import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "videos", timestamps: false })
export class Video extends Model<Video> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare idvideo: number;

  @Column(DataType.STRING(200))
  declare nombrevideo: string | null;

  @Column(DataType.INTEGER)
  declare estado: number | null;

  @Column(DataType.INTEGER)
  declare volumen: number | null;
}
