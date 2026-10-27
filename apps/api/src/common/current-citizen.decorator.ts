import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Citizen } from "@prisma/client";

export const CurrentCitizen = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Citizen => {
    return ctx.switchToHttp().getRequest().citizen as Citizen;
  },
);
