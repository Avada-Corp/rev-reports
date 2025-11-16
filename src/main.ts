import { webcrypto } from "crypto";

// Полифилл для Web Crypto API в Node.js
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as any;
}

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { logRequests } from "./log";
import * as dotenv from "dotenv";

// Load env overrides early
if (process.env.NODE_ENV === "local") {
  // eslint-disable-next-line no-console
  console.log("[BOOT] Loading local.env with override");
  dotenv.config({ path: "local.env", override: true });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  logRequests(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("APP_PORT")!;
  console.log("port: ", port);
  await app.listen(port);
}
bootstrap();
