import "reflect-metadata";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
  });
  const config = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  if (!config.get<string>("JWT_SECRET")) {
    logger.warn("JWT_SECRET no definido: se usara una clave insegura solo para desarrollo.");
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.disable("x-powered-by");

  app.useStaticAssets(join(__dirname, "..", "public"), {
    index: false,
  });

  const origins = (config.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.enableShutdownHooks();

  const port = Number(config.get("API_PORT") ?? 3001);
  await app.listen(port, "0.0.0.0");
  logger.log(`API turnero escuchando en http://localhost:${port}/api`);
}
bootstrap();
