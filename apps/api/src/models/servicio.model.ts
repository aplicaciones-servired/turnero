import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "servicio", timestamps: false })
export class Servicio extends Model<Servicio> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdServicio: number;

  @Column(DataType.STRING(150))
  declare Servicio: string | null;

  @Column(DataType.STRING(10))
  declare Prefijo: string | null;

  @Column(DataType.INTEGER)
  declare Cont_min: number | null;

  @Column(DataType.INTEGER)
  declare Cont_max: number | null;

  @Column(DataType.INTEGER)
  declare Secuencia: number | null;

  @Column(DataType.INTEGER)
  declare Prioridad: number | null;

  @Column(DataType.STRING(100))
  declare LlamadoTv: string | null;

  @Column(DataType.STRING(200))
  declare Color: string | null;

  @Column(DataType.STRING(200))
  declare ColorLetra: string | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;

  @Column(DataType.STRING(100))
  declare EstadoSub: string | null;

  @Column(DataType.INTEGER)
  declare atril: number | null;

  @Column(DataType.INTEGER)
  declare tiempomax: number | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;
}
