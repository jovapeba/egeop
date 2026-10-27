import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "An unexpected server error occurred.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
      } else if (typeof res === "object" && res !== null && "message" in res) {
        message = (res as { message: string | string[] }).message;
      }
    } else if (
      exception &&
      typeof exception === "object" &&
      "code" in exception &&
      (exception as { code: unknown }).code === "P2002"
    ) {
      // Prisma unique constraint violation
      status = HttpStatus.CONFLICT;
      message = "This operation has already been performed or the record already exists.";
    } else if (
      exception &&
      typeof exception === "object" &&
      "code" in exception &&
      (exception as { code: unknown }).code === "P2025"
    ) {
      // Prisma record not found
      status = HttpStatus.NOT_FOUND;
      message = "The requested resource was not found.";
    } else {
      // Internal error or crash - do not leak stack traces or sql
      this.logger.error("Unhandled exception:", exception instanceof Error ? exception.stack : exception);
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "An unexpected server error occurred. Please try again shortly.";
    }

    // Guard against 5xx error leaks
    if (status >= 500) {
      this.logger.error(`Server error (5xx): ${status}`, exception instanceof Error ? exception.stack : exception);
      message = "An unexpected server error occurred. Please try again shortly.";
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
