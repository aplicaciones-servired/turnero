import { Global, Module } from "@nestjs/common";
import { TurnsGateway } from "./turns.gateway";

@Global()
@Module({
  providers: [TurnsGateway],
  exports: [TurnsGateway],
})
export class RealtimeModule {}
