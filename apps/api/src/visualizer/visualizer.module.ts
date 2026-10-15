import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Configtv } from "../models/configtv.model";
import { Tv } from "../models/tv.model";
import { Video } from "../models/video.model";
import { VisualizerService } from "./visualizer.service";
import {
  LegacyVisualizerController,
  VisualizerController,
} from "./visualizer.controller";

@Module({
  imports: [SequelizeModule.forFeature([Tv, Configtv, Video])],
  controllers: [VisualizerController, LegacyVisualizerController],
  providers: [VisualizerService],
  exports: [VisualizerService],
})
export class VisualizerModule {}
