import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

export interface EncuestaCreation {
  IdEncuesta: number;
  IdServicio?: number | null;
  IdUsuario?: number | null;
  IdPersona?: number | null;
  Asunto?: string | null;
  TipoPoblacion?: string | null;
  NivelEscolaridad?: string | null;
}

@Table({ tableName: "encuesta", timestamps: false })
export class Encuesta extends Model<Encuesta, EncuestaCreation> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdEncuesta: number;

  @Column(DataType.INTEGER)
  declare IdServicio: number | null;

  @Column(DataType.INTEGER)
  declare IdUsuario: number | null;

  @Column(DataType.INTEGER)
  declare IdPersona: number | null;

  @Column(DataType.STRING(500))
  declare Asunto: string | null;

  @Column(DataType.STRING(200))
  declare TipoPoblacion: string | null;

  @Column(DataType.STRING(200))
  declare NivelEscolaridad: string | null;
}
