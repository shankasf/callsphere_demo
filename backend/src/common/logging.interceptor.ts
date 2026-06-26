import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { randomUUID } from 'crypto';

/**
 * Global access logger: one structured line per HTTP request with method, path,
 * status, duration, and a short request id (also returned as X-Request-ID).
 * Health/static polling is logged at debug to keep the stream readable.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const rid = (randomUUID() as string).slice(0, 8);
    const { method, originalUrl } = req;
    if (res?.setHeader) res.setHeader('X-Request-ID', rid);
    const start = Date.now();

    const quiet =
      originalUrl?.startsWith('/assets') ||
      originalUrl === '/' ||
      originalUrl?.startsWith('/api/live-sessions');

    const line = (status: number) =>
      `rid=${rid} ${method} ${originalUrl} -> ${status} (${Date.now() - start}ms)`;

    return next.handle().pipe(
      tap(() => {
        const msg = line(res?.statusCode ?? 200);
        quiet ? this.logger.debug(msg) : this.logger.log(msg);
      }),
      catchError((err) => {
        this.logger.error(line(err?.status ?? 500) + ` ${err?.message ?? ''}`);
        throw err;
      }),
    );
  }
}
