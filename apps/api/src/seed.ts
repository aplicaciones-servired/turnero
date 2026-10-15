import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Setting } from "./models/setting.model";

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  const { getModelToken } = await import("@nestjs/sequelize");
  const SettingRepo = app.get(getModelToken(Setting)) as typeof Setting;

  await SettingRepo.findOrCreate({ where: { id: 1 } });
  console.log(
    "Configuracion lista. Servicios y usuarios se leen en vivo de la base MagisoftV1."
  );

  await app.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Error en seed:", err);
  process.exit(1);
});
