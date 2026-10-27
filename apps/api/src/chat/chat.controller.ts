import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get("country/:countryId")
  getMessages(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Param("countryId") countryId: string,
    @Query("limit") limit?: string,
  ) {
    return this.chatService.getMessages(citizen, countryId, limit ? parseInt(limit, 10) : 50);
  }

  @Post("country/:countryId")
  sendMessage(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Param("countryId") countryId: string,
    @Body() body: { content: string },
  ) {
    return this.chatService.sendMessage(citizen, countryId, body?.content);
  }
}
