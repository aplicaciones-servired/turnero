import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "relacionususer", timestamps: false })
export class RelacionUsUser extends Model<RelacionUsUser> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdRelacion: number;

  @Column(DataType.INTEGER)
  declare IdServicio: number | null;

  @Column(DataType.INTEGER)
  declare IdUsuario: number | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;
}
