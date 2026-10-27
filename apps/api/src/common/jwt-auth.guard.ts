import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing bearer token");
    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: process.env.JWT_SECRET || "dev-secret-change-me",
      });
      const citizen = await this.prisma.citizen.findUnique({ where: { id: payload.sub } });
      if (!citizen) throw new UnauthorizedException();
      request.citizen = citizen;
      return true;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}
