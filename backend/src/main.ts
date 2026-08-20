import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './configure-app';

// DB-MOBILE.md §Fase 2 passo 1: prefixo, CORS, 0.0.0.0 (celular na mesma rede, não localhost),
// filtro de exceção único, Swagger montado assim que o Nest sobe (pedido do usuário).
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  setupSwagger(app);

  const port = Number(process.env.PORT) || 3333;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`DB Mobile API em http://0.0.0.0:${port}/api/v1 — Swagger em /api/docs`);
}
bootstrap();
