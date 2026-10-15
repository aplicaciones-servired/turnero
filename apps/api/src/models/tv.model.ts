import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

export interface TvCreation {
  IdTv: number;
  NombrePaciente?: string | null;
  Modulo?: string | null;
  Servicio?: string | null;
  Turno?: string | null;
  Descripcion?: string | null;
  Estado?: number | null;
  IdSede?: number | null;
}

@Table({ tableName: "tv", timestamps: false })
export class Tv extends Model<Tv, TvCreation> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdTv: number;

  @Column(DataType.STRING(200))
  declare NombrePaciente: string | null;

  @Column(DataType.STRING(100))
  declare Modulo: string | null;

  @Column(DataType.STRING(150))
  declare Servicio: string | null;

  @Column(DataType.STRING(10))
  declare Turno: string | null;

  @Column(DataType.STRING(20))
  declare Descripcion: string | null;

  @Column(DataType.INTEGER)
  declare Estado: number | null;

  @Column(DataType.INTEGER)
  declare IdSede: number | null;
}
