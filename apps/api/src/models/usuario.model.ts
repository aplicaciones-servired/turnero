import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "usuario", timestamps: false })
export class Usuario extends Model<Usuario> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare IdUsuario: number;

  @Column(DataType.STRING(100))
  declare Cedula: string | null;

  @Column(DataType.STRING(200))
  declare NombreCompleto: string | null;

  @Column(DataType.STRING(200))
  declare Correo: string | null;

  @Column(DataType.STRING(100))
  declare Rol: string | null;

  @Column(DataType.STRING(100))
  declare Estado: string | null;

  @Column(DataType.STRING(100))
  declare NombreUsuario: string | null;

  @Column(DataType.STRING(500))
  declare Contrasena: string | null;

  @Column(DataType.STRING(50))
  declare LlamadoTv: string | null;

  @Column(DataType.STRING(100))
  declare EstadoRecuperarContra: string | null;

  @Column(DataType.INTEGER)
  declare Eliminado: number | null;

  @Column(DataType.DATE)
  declare registro: Date | null;

  @Column(DataType.STRING(100))
  declare socket_id: string | null;

  @Column(DataType.BIGINT)
  declare IdSede: number | null;

  @Column(DataType.INTEGER)
  declare emp_id: number | null;

  @Column(DataType.INTEGER)
  declare EstadoNube: number | null;
}
