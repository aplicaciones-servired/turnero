import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

export interface PersonaCreation {
  IdPersona: number;
  NombreCompleto?: string | null;
  Cedula?: string | null;
  Sexo?: string | null;
  Direccion?: string | null;
  Barrio?: string | null;
  Telefono?: string | null;
  Fecha?: string | null;
  IdSede?: number | null;
  emp_id?: number | null;
  EstadoNube?: number | null;
  Eliminado?: number | null;
}

@Table({ tableName: "personas", timestamps: false })
export class Persona extends Model<Persona, PersonaCreation> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdPersona: number;

  @Column(DataType.STRING(200))
  declare NombreCompleto: string | null;

  @Column(DataType.STRING(50))
  declare Cedula: string | null;

  @Column(DataType.STRING(50))
  declare Sexo: string | null;

  @Column(DataType.STRING(200))
  declare Direccion: string | null;

  @Column(DataType.STRING(200))
  declare Barrio: string | null;

  @Column(DataType.STRING(50))
  declare Telefono: string | null;

  @Column(DataType.DATEONLY)
  declare Fecha: string | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;
}
