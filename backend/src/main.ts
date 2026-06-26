import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import { createServer, Server } from 'net';
import { AppModule } from './app.module';

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port starting from the preferred port
 */
async function findAvailablePort(startPort: number, maxAttempts = 100): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`Port ${port} is in use, trying next...`);
  }
  throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const logger = new Logger('Bootstrap');

  // Enable CORS for frontend (React) and Python AI service
  app.enableCors({
    origin: [
      'http://localhost:5173', // Vite React dev
      'http://localhost:3003', // Backend port
      'http://localhost:8081', // Python AI service
      'https://webhook.callsphere.tech', // Production (legacy)
      'https://urackit.callsphere.tech', // Production (main)
    ],
    credentials: true,
  });

  // Global validation pipe
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('URackIT Voice Agent API')
    .setDescription('Backend API for URackIT IT Support Voice Agent System')
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('dashboard', 'Dashboard analytics and metrics')
    .addTag('calls', 'Call logs and voice agent interactions')
    .addTag('tickets', 'Support ticket management')
    .addTag('devices', 'Device inventory')
    .addTag('organizations', 'Organization management')
    .addTag('contacts', 'Contact management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Serve static frontend files from dist folder at root
  const frontendPath = join(__dirname, '..', '..', '..', 'frontend', 'dist');
  logger.log(`Static assets path: ${frontendPath}`);

  if (existsSync(frontendPath)) {
    app.useStaticAssets(frontendPath);
    logger.log('Frontend static assets configured');
  } else {
    logger.warn('Frontend dist folder not found');
  }

  // SPA fallback. Registered BEFORE app.listen so it sits ahead of Nest's
  // route resolution in the Express stack ([serve-static, spa-fallback, nest-router]):
  // static files win, /api falls through to controllers, everything else returns
  // index.html so client-side routes (e.g. /calls, /live) deep-link correctly.
  // (A catch-all registered after listen runs behind Nest's 404 and never fires.)
  const expressApp = app.getHttpAdapter().getInstance();
  const indexPath = join(frontendPath, 'index.html');

  expressApp.use((req: any, res: any, next: any) => {
    // Only handle GET/HEAD navigations; never hijack API or static-asset requests.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (req.originalUrl.startsWith('/api') ||
        req.originalUrl.includes('/assets/') ||
        req.originalUrl.match(/\.(js|css|svg|png|ico|json|woff|woff2|ttf|map)$/)) {
      return next();
    }
    if (existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });

  const preferredPort = parseInt(process.env.PORT ?? '3003', 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn(`Preferred port ${preferredPort} was in use, using port ${port} instead`);
  }

  await app.listen(port);

  logger.log(`🚀 URackIT API running on http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  logger.log(`🎨 Dashboard: http://localhost:${port}/`);
}
bootstrap();
