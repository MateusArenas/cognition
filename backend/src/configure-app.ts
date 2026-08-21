import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';

// Extraído de main.ts pra ser reaproveitado pelos testes e2e (test/bootstrap-app.ts) — mesmo
// pipeline de middleware/erro em produção e em teste, sem duplicar a configuração.
export function configureApp(app: INestApplication): void {
  app.enableCors();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DatabaseExceptionFilter());
  // Genérico do Nest — nenhum gateway específico aqui, qualquer @WebSocketGateway() (o /ssh de
  // docs/20-ssh-mobile.md, e qualquer outro no futuro) já sobe em cima disso de graça.
  app.useWebSocketAdapter(new IoAdapter(app));
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('DB Mobile API')
    .setDescription('Cliente de banco de dados pro celular — Knex fala com os bancos-alvo, Prisma guarda usuários/permissões/conexões do próprio backend.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
