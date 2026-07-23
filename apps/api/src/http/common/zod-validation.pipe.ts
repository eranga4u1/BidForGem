import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { httpForReason } from "./error-envelope.js";

/**
 * Reusable zod validation at the HTTP boundary. Used where the controller needs
 * typed input before delegating (domain services also validate — defense in
 * depth). Rejections become a consistent 400 INVALID_INPUT envelope.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw httpForReason("INVALID_INPUT", result.error.issues);
    return result.data;
  }
}
