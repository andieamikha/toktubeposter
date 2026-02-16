import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any = {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan server. Silakan coba lagi.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        errorResponse = {
          code: (exceptionResponse as any).code || 'ERROR',
          message: (exceptionResponse as any).message || exception.message,
          details: (exceptionResponse as any).details,
        };
      } else {
        errorResponse.message = exceptionResponse;
      }
    } else {
      this.logger.error('Unhandled exception', exception?.stack);
    }

    response.status(status).json({
      success: false,
      error: errorResponse,
    });
  }
}
