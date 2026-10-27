import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableCors({
    origin: (process.env.WEB_ORIGIN || "http://localhost:3000").split(","),
    credentials: true,
  });
  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[egeopolis-api] listening on :${port}`);
}

void bootstrap();
