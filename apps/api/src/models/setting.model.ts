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
  printWidth?: number;
  printLogo?: boolean;
  printLogoFile?: string;
  printShowHeader?: boolean;
  printShowService?: boolean;
  printShowDate?: boolean;
  printShowQr?: boolean;
  printQrTemplate?: string;
  printShowFooter?: boolean;
  printTurnSize?: string;
  printFeed?: number;
  printCut?: boolean;
  printOpenDrawer?: boolean;
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
  @Column(DataType.FLOAT)
  declare voicePitch: number;

  // ── Impresion del ticket ──
  @Default(48)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare printWidth: number;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printLogo: boolean;

  @Default("logoTiket.png")
  @Column({ type: DataType.STRING(160), allowNull: false })
  declare printLogoFile: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printShowHeader: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printShowService: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printShowDate: boolean;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printShowQr: boolean;

  @Default("")
  @Column({ type: DataType.STRING(300), allowNull: false })
  declare printQrTemplate: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printShowFooter: boolean;

  @Default("quad")
  @Column({ type: DataType.STRING(10), allowNull: false })
  declare printTurnSize: string;

  @Default(2)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare printFeed: number;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printCut: boolean;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare printOpenDrawer: boolean;
}
