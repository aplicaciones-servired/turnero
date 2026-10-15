import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import * as crypto from "crypto";
import type { AuthUser, UserDTO, UserRole } from "@turnero/shared";
import { Usuario } from "../models/usuario.model";

@Injectable()
export class UsersService {
  constructor(@InjectModel(Usuario) private readonly model: typeof Usuario) {}

  private mapRole(rol: string | null): UserRole {
    return (rol ?? "").trim().toUpperCase() === "ADMINISTRADOR" ? "admin" : "cashier";
  }

  private toAuthUser(u: Usuario): AuthUser {
    const username = u.NombreUsuario ?? "";
    const displayName = u.NombreCompleto ?? username;
    return {
      id: String(u.IdUsuario),
      username,
      displayName,
      role: this.mapRole(u.Rol),
      counterName: displayName || null,
    };
  }

  async validateLogin(username: string, password: string): Promise<AuthUser | null> {
    const login = username.trim();
    if (!login || !password) return null;

    const user = await this.model.findOne({
      where: { Cedula: login },
    });
    if (!user) return null;

    const hash = crypto.createHash("md5").update(password).digest("hex");
    const storedPassword = (user.Contrasena ?? "").trim();
    const isMd5 = /^[a-f\d]{32}$/i.test(storedPassword);
    const validPassword = isMd5
      ? storedPassword.toLowerCase() === hash
      : storedPassword === password;

    if (!validPassword) return null;
    return this.toAuthUser(user);
  }

  async findById(id: string): Promise<AuthUser | null> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;
    const user = await this.model.findByPk(numericId);
    if (!user) return null;
    return this.toAuthUser(user);
  }

  async findAll(): Promise<UserDTO[]> {
    const users = await this.model.findAll({ order: [["NombreCompleto", "ASC"]] });
    return users.map((u) => ({
      ...this.toAuthUser(u),
      active: u.Eliminado !== 1,
      createdAt: u.registro ? new Date(u.registro).toISOString() : "",
    }));
  }
}
