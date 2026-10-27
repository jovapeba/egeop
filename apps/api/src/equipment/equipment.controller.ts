import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { EquipmentService } from "./equipment.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("equipment")
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get("mine")
  mine(@CurrentCitizen() citizen: { id: string }) {
    return this.equipment.mine(citizen.id);
  }

  @Get("offers")
  offers() {
    return this.equipment.listOffers("ACTIVE");
  }

  @Post(":id/equip")
  equip(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.equipment.equip(citizen.id, id);
  }

  @Delete("equipped/:id/unequip")
  unequip(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.equipment.unequip(citizen.id, id);
  }

  @Post("merge")
  merge(@CurrentCitizen() citizen: { id: string }, @Body() body: { itemIds: string[] }) {
    return this.equipment.merge(citizen.id, body.itemIds);
  }

  @Post(":id/split")
  split(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.equipment.split(citizen.id, id);
  }

  @Post(":id/upgrade-param")
  upgradeParam(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { paramType: any },
  ) {
    return this.equipment.upgradeParam(citizen.id, id, body.paramType);
  }

  @Post("offers")
  list(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { itemId: string; price: number },
  ) {
    return this.equipment.createOffer(citizen.id, body.itemId, body.price);
  }

  @Post("offers/:id/buy")
  buy(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.equipment.buyOffer(citizen.id, id);
  }

  @Post("offers/:id/cancel")
  cancel(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.equipment.cancelOffer(citizen.id, id);
  }
}
