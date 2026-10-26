import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { TurnsGateway } from "./turns.gateway";

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  providers: [TurnsGateway],
  exports: [TurnsGateway],
})
export class RealtimeModule {}
