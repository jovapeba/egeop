import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { MediaService } from "./media.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get("articles")
  articles(@Query("category") category?: string, @Query("take") take?: string) {
    return this.media.listArticles({ category, take: take ? Number(take) : undefined });
  }

  @Get("articles/:id")
  article(@Param("id") id: string) {
    return this.media.getArticle(id);
  }

  @Get("portal")
  myPortal(@CurrentCitizen() citizen: { id: string }) {
    return this.media.myPortal(citizen.id);
  }

  /** Public directory of all news portals. */
  @Get("portals")
  portals(@CurrentCitizen() citizen?: { id: string }) {
    return this.media.listPortals(citizen?.id);
  }

  @Post("portal")
  createPortal(
    @CurrentCitizen() citizen: { id: string; level: number },
    @Body() body: { name: string; avatarColor?: string },
  ) {
    return this.media.createPortal(citizen, body.name, body.avatarColor);
  }

  @Post("articles")
  publish(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { title: string; body: string; category?: string },
  ) {
    return this.media.publishArticle(citizen.id, body);
  }

  @Post("articles/:id/upvote")
  upvote(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.media.upvote(citizen.id, id);
  }

  @Post("articles/:id/tip")
  tip(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string, @Body() body: { gold: number }) {
    return this.media.tip(citizen.id, id, body.gold);
  }

  @Post("portals/:id/subscribe")
  subscribe(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.media.subscribe(citizen.id, id);
  }

  @Delete("portals/:id/subscribe")
  unsubscribe(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.media.unsubscribe(citizen.id, id);
  }

  @Post("portals/:id/editors")
  addEditor(@CurrentCitizen() citizen: { id: string }, @Param("id") _portalId: string, @Body() body: { nickname: string }) {
    return this.media.addEditor(citizen.id, "", body.nickname);
  }

  @Get("shouts")
  shouts(@Query("scope") scope?: string, @Query("scopeId") scopeId?: string, @Query("take") take?: string) {
    return this.media.shouts({ scope, scopeId, take: take ? Number(take) : undefined });
  }

  @Post("shouts")
  shout(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { scope?: string; scopeId?: string; content: string },
  ) {
    return this.media.createShout(citizen, body);
  }
}
