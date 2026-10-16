<#
  ==============================================================================
   Agente de impresion ESC/POS para Windows
  ==============================================================================
   Escucha en un puerto TCP (9100 por defecto) y envia los bytes que llegan a
   una impresora instalada en Windows mediante winspool (RAW). De este modo el
   API de produccion puede imprimir usando:

        PRINTER_INTERFACE=tcp://<IP-DE-ESTE-PC>:9100

   El protocolo es el de node-thermal-printer (interfaces/network.js):
     - isPrinterConnected() abre una conexion y la cierra SIN enviar nada
       -> el agente ignora esas conexiones vacias.
     - execute() escribe el buffer y cierra
       -> el agente imprime lo que haya recibido.

   Uso:
     powershell -ExecutionPolicy Bypass -File PrintAgent.ps1
     powershell -ExecutionPolicy Bypass -File PrintAgent.ps1 -Printer "POS-80-Series" -Port 9100
     powershell -ExecutionPolicy Bypass -File PrintAgent.ps1 -Install        (requiere admin)

  ==============================================================================
#>
[CmdletBinding()]
param(
    [string]$Printer = "",
    [int]$Port = 9100,
    [string]$LogFile = "",
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
if (-not $LogFile) { $LogFile = Join-Path $PSScriptRoot 'print-agent.log' }

function Write-Log {
    param([string]$Mensaje)
    $linea = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Mensaje
    Write-Host $linea
    try { Add-Content -LiteralPath $LogFile -Value $linea -Encoding UTF8 } catch { }
}

# ---------------------------------------------------------------- windowspool
$RawPrinterCode = @'
using System;
using System.Runtime.InteropServices;
public class TurneroRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero;
    DOCINFOA di = new DOCINFOA();
    bool bSuccess = false;
    di.pDocName = "Turnero Ticket";
    di.pDataType = "RAW";
    if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
      if (StartDocPrinter(hPrinter, 1, di)) {
        if (StartPagePrinter(hPrinter)) {
          IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, pBytes, bytes.Length);
          Int32 dwWritten = 0;
          bSuccess = WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten);
          Marshal.FreeCoTaskMem(pBytes);
          EndPagePrinter(hPrinter);
        }
        EndDocPrinter(hPrinter);
      }
      ClosePrinter(hPrinter);
    }
    if (bSuccess == false) { Console.Error.WriteLine("winspool error: " + Marshal.GetLastWin32Error()); }
    return bSuccess;
  }
}
'@

try { Add-Type -TypeDefinition $RawPrinterCode } catch { Write-Log "Add-Type: $($_.Exception.Message)" }

# ------------------------------------------------------- deteccion de impresora
function Select-TerminalPrinter {
    param([string]$Forzada)

    if ($Forzada) { return $Forzada }

    $lista = @()
    try { $lista = @(Get-CimInstance Win32_Printer) } catch { return $null }
    if ($lista.Count -eq 0) { return $null }

    $virtual = '(onenote|xps|pdf|fax|send to|microsoft print)'
    $termica = '(pos|thermal|termic|receipt|esc/?pos|58mm|80mm|\b58\b|\b80\b)'
    $candidatos = @()

    foreach ($p in $lista) {
        if (-not $p.Name) { continue }
        $driver = ''
        try { $driver = [string]$p.DriverName } catch { }
        if (($p.Name -match $virtual) -or ($driver -match $virtual)) { continue }

        $score = 0
        if (($p.Name -match $termica) -or ($driver -match $termica)) { $score += 50 }
        if ($p.Default) { $score += 30 }
        if ($p.WorkOffline) { $score -= 100 }
        $candidatos += [pscustomobject]@{ Name = [string]$p.Name; Score = $score }
    }

    if ($candidatos.Count -eq 0) { return $null }
    $mejor = $candidatos | Sort-Object Score -Descending | Select-Object -First 1
    return $mejor.Name
}

# ------------------------------------------------------------------ instalacion
if ($Install) {
    $proceso = 'powershell.exe'
    $argumentos = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '"'
    if ($Printer) { $argumentos += ' -Printer "' + $Printer + '"' }
    $argumentos += " -Port $Port"

    $nombre = 'TurneroPrintAgent'

    try {
        $regla = Get-NetFirewallRule -DisplayName 'Turnero Print Agent' -ErrorAction SilentlyContinue
        if (-not $regla) {
            New-NetFirewallRule -DisplayName 'Turnero Print Agent' -Direction Inbound -Protocol TCP `
                -LocalPort $Port -Action Allow -Profile Any | Out-Null
            Write-Log "Regla de firewall creada (TCP $Port)."
        } else {
            Write-Log "Regla de firewall ya existente (TCP $Port)."
        }
    } catch {
        Write-Log "No se pudo crear la regla de firewall: $($_.Exception.Message)"
        Write-Log "Ejecuta PowerShell como administrador."
    }

    $accion = New-ScheduledTaskAction -Execute $proceso -Argument $argumentos
    $gatillos = @(
        (New-ScheduledTaskTrigger -AtLogon),
        (New-ScheduledTaskTrigger -AtStartup)
    )
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

    $esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent())
    $nivel = if ($esAdmin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'Highest' } else { 'Limited' }
    $principales = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel $nivel

    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $gatillos `
        -Settings $ajustes -Principal $principales -Force | Out-Null

    Write-Log "Tarea '$nombre' registrada (nivel $nivel). Arranca al iniciar sesion."
    Write-Log "Arrancala ya con: Start-ScheduledTask -TaskName $nombre"
    return
}

# ---------------------------------------------------------------------- servidor
$nombreImpresora = Select-TerminalPrinter -Forzada $Printer
if (-not $nombreImpresora) {
    Write-Log "ERROR: no hay ninguna impresora instalada en Windows."
    Write-Log "Instala el driver de la POS-80 y vuelve a arrancar el agente."
    exit 1
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Log "Agente listo. Puerto TCP $Port -> impresora '$nombreImpresora'"
Write-Log "Configura el servidor con:  PRINTER_INTERFACE=tcp://<IP-DE-ESTE-PC>:$Port"
Write-Log "Presiona Ctrl+C para detener."

$buf = New-Object byte[] 65536

try {
    while ($true) {
        $cliente = $null
        $stream = $null
        try {
            $cliente = $listener.AcceptTcpClient()
            $cliente.ReceiveTimeout = 300
            $stream = $cliente.GetStream()

            $mem = New-Object System.IO.MemoryStream
            while ($true) {
                try {
                    $n = $stream.Read($buf, 0, $buf.Length)
                } catch {
                    # timeout (300 ms sin datos) o reset: terminamos de leer
                    break
                }
                if ($n -le 0) { break }
                $mem.Write($buf, 0, $n)
            }

            if ($mem.Length -gt 0) {
                $bytes = $mem.ToArray()
                $ok = $false
                try {
                    $ok = [TurneroRawPrinter]::SendBytesToPrinter($nombreImpresora, $bytes)
                } catch {
                    Write-Log "Excepcion imprimiendo: $($_.Exception.Message)"
                }
                $destino = if ($ok) { 'OK' } else { 'FALLO' }
                Write-Log ("{0} bytes recibidos -> '{1}' [{2}]" -f $bytes.Length, $nombreImpresora, $destino)
            }
            # conexiones sin datos = sonda de isPrinterConnected() -> se ignoran
        } catch {
            Write-Log "Error de conexion: $($_.Exception.Message)"
        } finally {
            if ($stream) { try { $stream.Dispose() } catch { } }
            if ($cliente) { try { $cliente.Close() } catch { } }
        }
    }
} finally {
    try { $listener.Stop() } catch { }
    Write-Log "Agente detenido."
}
