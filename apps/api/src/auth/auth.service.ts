import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.validateLogin(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException("Credenciales invalidas");
    }
    // La caja/modulo elegido al ingresar se anuncia en pantalla en cada llamado.
    const counterName = dto.caja?.trim() || user.counterName || null;
    const token = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      counterName,
    });
    return { token, user: { ...user, counterName } };
  }
}
