import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

export interface AuditoriaCreation {
  IdAuditoria: number;
  IdServicio?: number | null;
  IdUsuario?: number | null;
  Turno?: string | null;
  IdPersona?: number | null;
  IdEncuesta?: number | null;
  Estado?: string | null;
  FechaLlegada?: Date | null;
  FechaLlamado?: Date | null;
  Fechasalio?: Date | null;
  NumeroLlamados?: number | null;
  Observacion?: string | null;
  ObservacionAsesor?: string | null;
  EstadoNube?: number | null;
  idrelacionservicio?: number | null;
  ObservacionRetraso?: string | null;
  LlamadoEspecifico?: number | null;
  CedulaCliente?: string | null;
  NombreCliente?: string | null;
  TipoDocumento?: string | null;
  TipoPersona?: string | null;
  TipoPoblacion?: string | null;
  IdTurnoAgendado?: number | null;
  Eliminado?: number | null;
  IdSede?: number | null;
  emp_id?: number | null;
}

@Table({ tableName: "auditoria", timestamps: false })
export class Auditoria extends Model<Auditoria, AuditoriaCreation> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdAuditoria: number;

  @Column(DataType.INTEGER)
  declare IdServicio: number | null;

  @Column(DataType.INTEGER)
  declare IdUsuario: number | null;

  @Column(DataType.STRING(20))
  declare Turno: string | null;

  @Column(DataType.INTEGER)
  declare IdPersona: number | null;

  @Column(DataType.INTEGER)
  declare IdEncuesta: number | null;

  @Column(DataType.STRING(20))
  declare Estado: string | null;

  @Column(DataType.DATE)
  declare FechaLlegada: Date | null;

  @Column(DataType.DATE)
  declare FechaLlamado: Date | null;

  @Column(DataType.DATE)
  declare Fechasalio: Date | null;

  @Column(DataType.INTEGER)
  declare NumeroLlamados: number | null;

  @Column(DataType.STRING(500))
  declare Observacion: string | null;

  @Column(DataType.STRING(500))
  declare ObservacionAsesor: string | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;

  @Column(DataType.INTEGER)
  declare idrelacionservicio: number | null;

  @Column(DataType.STRING(500))
  declare ObservacionRetraso: string | null;

  @Column(DataType.INTEGER)
  declare LlamadoEspecifico: number | null;

  @Column(DataType.STRING(100))
  declare CedulaCliente: string | null;

  @Column(DataType.STRING(100))
  declare NombreCliente: string | null;

  @Column(DataType.STRING(50))
  declare TipoDocumento: string | null;

  @Column(DataType.STRING(50))
  declare TipoPersona: string | null;

  @Column(DataType.STRING(50))
  declare TipoPoblacion: string | null;

  @Column(DataType.INTEGER)
  declare IdTurnoAgendado: number | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;
}
