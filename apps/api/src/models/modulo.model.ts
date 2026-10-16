import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "modulo", timestamps: false })
export class Modulo extends Model<Modulo> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare Id: number;

  @Column(DataType.STRING(50))
  declare IdModulo: string;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;
}
