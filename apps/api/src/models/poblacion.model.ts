import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "poblacion", timestamps: false })
export class Poblacion extends Model<Poblacion> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdPoblacion: number;

  @Column(DataType.STRING(100))
  declare TipoPoblacion: string | null;
}
