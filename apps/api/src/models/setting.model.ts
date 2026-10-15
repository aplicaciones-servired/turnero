import {
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

export interface SettingCreation {
  id?: number;
  businessName?: string;
  ticketHeader?: string;
  ticketFooter?: string;
  announcePrefix?: string;
  voiceRate?: number;
  voicePitch?: number;
}

/** Configuracion global del turnero (una sola fila). Editable por el admin. */
@Table({ tableName: "turnero_settings", underscored: true, timestamps: true })
export class Setting extends Model<Setting, SettingCreation> {
  @PrimaryKey
  @Default(1)
  @Column(DataType.INTEGER)
  declare id: number;

  @Default("Mi Empresa")
  @Column({ type: DataType.STRING(160), allowNull: false })
  declare businessName: string;

  @Default("Por favor espere su turno")
  @Column({ type: DataType.TEXT, allowNull: false })
  declare ticketHeader: string;

  @Default("Gracias por su visita")
  @Column({ type: DataType.TEXT, allowNull: false })
  declare ticketFooter: string;

  @Default("Turno")
  @Column({ type: DataType.STRING(40), allowNull: false })
  declare announcePrefix: string;

  @Default(0.85)
  @Column({ type: DataType.FLOAT, allowNull: false })
  declare voiceRate: number;

  @Default(1)
  @Column({ type: DataType.FLOAT, allowNull: false })
  declare voicePitch: number;
}
