import { Controller, Get, Param, Post, Body } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("overview")
  async overview(@CurrentCitizen() citizen: { id: string; isAdmin: boolean }) {
    this.staff.assertAdmin(citizen);
    return this.staff.overview();
  }

  @Get("citizens/:id/audit")
  async citizenAudit(@CurrentCitizen() citizen: { isAdmin: boolean }, @Param("id") id: string) {
    this.staff.assertAdmin(citizen);
    return this.staff.citizenIpAudit(id);
  }
}
