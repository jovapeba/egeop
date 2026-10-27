import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

/**
 * Serializes BigInt values for JSON transport (Prisma BigInt → string).
 * Values within the safe integer range are converted to numbers.
 */
@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.serialize(data)));
  }

  private serialize(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === "bigint") {
      return data >= BigInt(Number.MIN_SAFE_INTEGER) && data <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(data)
        : data.toString();
    }
    if (data instanceof Date) return data.toISOString();
    if (Array.isArray(data)) return data.map((d) => this.serialize(d));
    if (typeof data === "object") {
      // Prisma Decimal (decimal.js). Duck-type instead of checking
      // constructor.name — the generated client is minified, so the class
      // name is mangled ("i") and a name check never matches, letting
      // Decimals fall through to the generic-object branch where they
      // serialize as their internal {s,e,d} fields (NaN in clients).
      const dec = data as { toNumber?: unknown; toFixed?: unknown };
      if (typeof dec.toNumber === "function" && typeof dec.toFixed === "function") {
        return (data as unknown as { toString(): string }).toString();
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        out[k] = this.serialize(v);
      }
      return out;
    }
    return data;
  }
}
