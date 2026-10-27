import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { AuthService, type LoginDto, type RegisterDto } from "./auth.service";
import { Public } from "../common/public.decorator";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get("countries")
  countries() {
    return this.auth.countries();
  }

  @Public()
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post("login")
  login(@Req() req: Request & { ip?: string }, @Body() dto: LoginDto) {
    return this.auth.login(dto, req.ip);
  }

  @Get("me")
  me(@CurrentCitizen() citizen: { id: string }) {
    return this.auth.me(citizen.id);
  }
}
