import { SequelizeModuleOptions } from "@nestjs/sequelize";
import { Usuario } from "../models/usuario.model";
import { Servicio } from "../models/servicio.model";
import { RelacionServicio } from "../models/relacion-servicio.model";
import { TablaTemporal } from "../models/tabla-temporal.model";
import { Tv } from "../models/tv.model";
import { Auditoria } from "../models/auditoria.model";
import { Configtv } from "../models/configtv.model";
import { Datosempresa } from "../models/datosempresa.model";
import { Sede } from "../models/sede.model";
import { Setting } from "../models/setting.model";
import { RelacionUsUser } from "../models/relacionususer.model";
import { ConfigTurnosPerdidos } from "../models/configturnosperdidos.model";
import { Persona } from "../models/persona.model";
import { Encuesta } from "../models/encuesta.model";
import { Poblacion } from "../models/poblacion.model";
import { Video } from "../models/video.model";

export function buildSequelizeOptions(): SequelizeModuleOptions {
  return {
    dialect: "mysql",
    host: process.env.DB_HOST ?? "127.0.0.1",
    username: process.env.DB_USER ?? "root",
    password: process.env.DB_PASS ?? "",
    database: process.env.DB_NAME ?? "MagisoftV1",
    models: [
      Usuario,
      Servicio,
      RelacionServicio,
      TablaTemporal,
      Tv,
      Auditoria,
      Configtv,
      Datosempresa,
      Sede,
      Setting,
      RelacionUsUser,
      ConfigTurnosPerdidos,
      Persona,
      Encuesta,
      Poblacion,
      Video,
    ],
    autoLoadModels: true,
    synchronize: process.env.DB_SYNCHRONIZE !== "false",
    logging: process.env.DB_LOGGING === "true",
    timezone: "-05:00",
    dialectOptions: {
      connectTimeout: 10000,
      charset: "utf8mb4",
    },
    pool: { max: 10, min: 0, idle: 10000 },
    define: { freezeTableName: true },
  };
}
