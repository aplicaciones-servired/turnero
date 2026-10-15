import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "configtv", timestamps: false })
export class Configtv extends Model<Configtv> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.STRING(500))
  declare mensaje: string | null;

  @Column(DataType.INTEGER)
  declare TamanoLetra: number | null;

  @Column(DataType.STRING(100))
  declare nombreLogo: string | null;

  @Column(DataType.INTEGER)
  declare estado: number | null;

  @Column(DataType.STRING(20))
  declare CambioTv: string | null;

  @Column(DataType.INTEGER)
  declare VolumenVoz: number | null;

  @Column(DataType.STRING(100))
  declare IpVisualizador: string | null;

  @Column(DataType.STRING(50))
  declare TipoVisualizador: string | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;
}
