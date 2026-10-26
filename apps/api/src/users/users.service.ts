import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/sequelize";
import { ConfigService } from "@nestjs/config";
import type { Sequelize, Transaction } from "sequelize";
import * as crypto from "crypto";
import type { AuthUser, UserDTO, UserRole } from "@turnero/shared";
import { RelacionUsUser } from "../models/relacionususer.model";
import { Usuario } from "../models/usuario.model";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

/** Valores de la columna `Rol` que entiende el sistema (MagisoftV1). */
const ADMIN_ROLE = "ADMINISTRADOR";
const CASHIER_ROLE = "ASESOR";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(Usuario) private readonly model: typeof Usuario,
    @InjectModel(RelacionUsUser) private readonly relationModel: typeof RelacionUsUser,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly config: ConfigService
  ) {}

  private get sedeId(): number | null {
    const raw = this.config.get<string>("SEDE_ID");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private mapRole(rol: string | null): UserRole {
    return (rol ?? "").trim().toUpperCase() === ADMIN_ROLE ? "admin" : "cashier";
  }

  private hash(password: string): string {
    return crypto.createHash("md5").update(password).digest("hex");
  }

  private toAuthUser(u: Usuario): AuthUser {
    const username = u.NombreUsuario ?? u.Cedula ?? "";
    const displayName = u.NombreCompleto ?? username;
    return {
      id: String(u.IdUsuario),
      username,
      displayName,
      role: this.mapRole(u.Rol),
      counterName: displayName || null,
    };
  }

  private toDto(u: Usuario): UserDTO {
    return {
      ...this.toAuthUser(u),
      active: u.Eliminado !== 1,
      createdAt: u.registro ? new Date(u.registro).toISOString() : "",
    };
  }

  async validateLogin(username: string, password: string): Promise<AuthUser | null> {
    const login = username.trim();
    if (!login || !password) return null;

    const user = await this.model.findOne({
      where: { Cedula: login },
    });
    if (!user) return null;
    if (user.Eliminado === 1) return null;

    const hash = this.hash(password);
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
    // La tabla legacy puede tener filas repetidas con el mismo IdUsuario: se descartan.
    const seen = new Set<string>();
    const out: UserDTO[] = [];
    for (const u of users) {
      const id = String(u.IdUsuario);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(this.toDto(u));
    }
    return out;
  }

  async create(dto: CreateUserDto): Promise<UserDTO> {
    const cedula = dto.username.trim();
    const duplicated = await this.model.findOne({ where: { Cedula: cedula } });
    if (duplicated) {
      throw new ConflictException("Ya existe un usuario con ese usuario/cedula.");
    }

    const max = await this.model.max("IdUsuario");
    const id = (Number(max) || 0) + 1;
    const nombre = dto.displayName.trim() || cedula;

    const created = await this.model.create({
      IdUsuario: id,
      Cedula: cedula,
      NombreUsuario: cedula,
      NombreCompleto: nombre,
      Correo: dto.email?.trim() || null,
      Rol: dto.role === "admin" ? ADMIN_ROLE : CASHIER_ROLE,
      Estado: "ACTIVO",
      Contrasena: this.hash(dto.password),
      LlamadoTv: null,
      EstadoRecuperarContra: null,
      Eliminado: dto.active === false ? 1 : 0,
      registro: new Date(),
      socket_id: null,
      IdSede: this.sedeId,
      EstadoNube: 0,
    } as any);

    return this.toDto(created);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDTO> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw new BadRequestException("Usuario invalido.");
    const user = await this.model.findByPk(numericId);
    if (!user) throw new NotFoundException("Usuario no encontrado.");

    const patch: Record<string, unknown> = {};

    if (dto.username !== undefined) {
      const cedula = dto.username.trim();
      if (!cedula) throw new BadRequestException("El usuario no puede quedar vacio.");
      if (cedula !== user.Cedula) {
        const duplicated = await this.model.findOne({ where: { Cedula: cedula } });
        if (duplicated) {
          throw new ConflictException("Ya existe un usuario con ese usuario/cedula.");
        }
        patch.Cedula = cedula;
        patch.NombreUsuario = cedula;
      }
    }

    if (dto.displayName !== undefined) patch.NombreCompleto = dto.displayName.trim();
    if (dto.email !== undefined) patch.Correo = dto.email.trim() || null;
    if (dto.password) patch.Contrasena = this.hash(dto.password);

    if (dto.role !== undefined && dto.role !== this.mapRole(user.Rol)) {
      // Solo se reescribe el Rol si el administrador realmente lo cambio, para no
      // alterar roles propios del sistema legacy (ej. "CAJERA", "AUXILIAR").
      patch.Rol = dto.role === "admin" ? ADMIN_ROLE : CASHIER_ROLE;
    }

    if (dto.active !== undefined) patch.Eliminado = dto.active ? 0 : 1;

    if (Object.keys(patch).length > 0) await user.update(patch);
    return this.toDto(user);
  }

  async remove(id: string, currentUserId?: string): Promise<{ id: string }> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) throw new BadRequestException("Usuario invalido.");
    if (currentUserId != null && Number(currentUserId) === numericId) {
      throw new BadRequestException("No puedes eliminar tu propio usuario.");
    }

    return this.sequelize.transaction(async (transaction: Transaction) => {
      const user = await this.model.findByPk(numericId, { transaction });
      if (!user) throw new NotFoundException("Usuario no encontrado.");

      await this.relationModel.destroy({
        where: { IdUsuario: numericId },
        transaction,
      });
      await user.destroy({ transaction });
      return { id: String(numericId) };
    });
  }
}
