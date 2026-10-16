import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import type { AuthUser } from "@turnero/shared";

export interface JwtPayload {
  sub: string;
  role: string;
  counterName?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService
  ) {
    super({
      // Permite tambien ?token= para descargas nativas del navegador (ej. APK),
      // donde no se pueden enviar cabeceras Authorization.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter("token"),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev_secret",
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("Usuario invalido");
    }
    // La caja/modulo elegida al ingresar viaja en el token.
    return { ...user, counterName: payload.counterName ?? user.counterName };
  }
}
