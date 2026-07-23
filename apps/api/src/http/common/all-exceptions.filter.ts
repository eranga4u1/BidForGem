import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { envelope, isErrorEnvelope } from "./error-envelope.js";

const STATUS_CODE: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
};

function messageFrom(body: unknown): string {
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && "message" in body) {
    const m: unknown = body.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join(", ");
  }
  return "Request failed.";
}

/**
 * Global filter — produces a consistent error envelope and NEVER leaks stack
 * traces or DB errors to clients. Unknown errors are logged server-side and
 * returned as a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isErrorEnvelope(body)) {
        res.status(status).json(body);
        return;
      }
      res.status(status).json(envelope(STATUS_CODE[status] ?? "ERROR", messageFrom(body)));
      return;
    }

    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(500).json(envelope("INTERNAL_ERROR", "Internal server error."));
  }
}
