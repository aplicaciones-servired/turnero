import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "sedes", timestamps: false })
export class Sede extends Model<Sede> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdSede: number;

  @Column(DataType.STRING(200))
  declare Nombre: string | null;

  @Column(DataType.STRING(200))
  declare Correo: string | null;

  @Column(DataType.STRING(20))
  declare Telefono: string | null;

  @Column(DataType.INTEGER)
  declare IdEmpresa: number | null;
}
