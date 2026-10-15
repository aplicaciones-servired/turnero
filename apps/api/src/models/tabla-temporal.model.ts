import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

export interface TablaTemporalCreation {
  IdTablaTemporal: number;
  IdServicio?: number | null;
  Turno?: string | null;
  Estado?: string | null;
  Dato1?: string | null;
  Dato2?: string | null;
  LlamadoPor?: string | null;
  Prioridad?: number | null;
  FechaLlegada?: Date | null;
  IdAuditoria?: number | null;
  Observacion?: string | null;
  FechaLlamado?: Date | null;
  UltimoLlamado?: number | null;
  EstadoLlamado?: number | null;
  transferenciaUsuario?: number | null;
  Dato3?: string | null;
  Dato4?: string | null;
  IdTurnoAgendado?: number | null;
  IdSede?: number | null;
  emp_id?: number | null;
}

@Table({ tableName: "tablatemporal", timestamps: false })
export class TablaTemporal extends Model<TablaTemporal, TablaTemporalCreation> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdTablaTemporal: number;

  @Column(DataType.INTEGER)
  declare IdServicio: number | null;

  @Column(DataType.STRING(100))
  declare Turno: string | null;

  @Column(DataType.STRING(20))
  declare Estado: string | null;

  @Column(DataType.STRING(50))
  declare Dato1: string | null;

  @Column(DataType.STRING(50))
  declare Dato2: string | null;

  @Column(DataType.STRING(20))
  declare LlamadoPor: string | null;

  @Column(DataType.INTEGER)
  declare Prioridad: number | null;

  @Column(DataType.DATE)
  declare FechaLlegada: Date | null;

  @Column(DataType.INTEGER)
  declare IdAuditoria: number | null;

  @Column(DataType.STRING(500))
  declare Observacion: string | null;

  @Column(DataType.DATE)
  declare FechaLlamado: Date | null;

  @Column(DataType.INTEGER)
  declare UltimoLlamado: number | null;

  @Column(DataType.INTEGER)
  declare EstadoLlamado: number | null;

  @Column(DataType.INTEGER)
  declare transferenciaUsuario: number | null;

  @Column(DataType.STRING(100))
  declare Dato3: string | null;

  @Column(DataType.STRING(100))
  declare Dato4: string | null;

  @Column(DataType.INTEGER)
  declare IdTurnoAgendado: number | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;
}
