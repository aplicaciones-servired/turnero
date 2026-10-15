import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "relacionservicios", timestamps: false })
export class RelacionServicio extends Model<RelacionServicio> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare idrelacionservicio: number;

  @Column(DataType.INTEGER)
  declare servicio: number | null;

  @Column(DataType.INTEGER)
  declare subservicio: number | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;

  @Column(DataType.INTEGER)
  declare Asignado: number | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;
}
