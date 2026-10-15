import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "datosempresa", timestamps: false })
export class Datosempresa extends Model<Datosempresa> {
  @PrimaryKey
  @Column(DataType.STRING(200))
  declare NombreEmpresa: string;

  @Column(DataType.STRING(100))
  declare nit: string | null;
}
