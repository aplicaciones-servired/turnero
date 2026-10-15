import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "configturnosperdidos", timestamps: false })
export class ConfigTurnosPerdidos extends Model<ConfigTurnosPerdidos> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare TiempoEspera: number;

  @Column(DataType.INTEGER)
  declare NumeroLlamado: number | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;
}
