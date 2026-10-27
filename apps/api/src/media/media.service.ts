import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  NEWS_CATEGORIES,
  NEWS_PORTAL_CREATE_COST,
  NEWS_PORTAL_VIEWS_PER_GOLD,
} from "@egeopolis/game-core";
import { Prisma } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));
const SHOUT_MAX_LENGTH = 100;
/** Media Mogul medal: per 100 subscribers (wiki). */
const MEDIA_MOGLU_STEP = 100;

/** Tiny HTML whitelist sanitizer. */
export function sanitizeHtml(input: string): string {
  return (input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\/?iframe[\s\S]*?>/gi, "")
    .replace(/<[^>]*>/g, (tag) =>
      /^<\/?(b|i|u|strong|em|p|br|h1|h2|h3|ul|ol|li|blockquote|img|a|span)(\s[^>]*)?\/?>$/i.test(tag) ? tag : "",
    )
    .slice(0, 20_000);
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  // ===========================================================================
  // NEWS PORTALS (v2: L13, 50g, 1g per 100 views, 5 articles/day, 4 categories)
  // ===========================================================================

  async createPortal(citizen: { id: string; level: number }, name: string, avatarColor?: string) {
    if (citizen.level < 13) throw new ForbiddenException("level 13 required");
    if (!name?.trim() || name.trim().length < 3) throw new BadRequestException("portal name too short");
    return this.redis.withLock(`gold:${citizen.id}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, GOLD(NEWS_PORTAL_CREATE_COST), "NEWSPAPER_CREATE");
        return tx.newsPortal.create({ data: { ownerId: citizen.id, name: name.trim(), avatarColor } });
      }),
    );
  }

  async publishArticle(citizenId: string, dto: { title: string; body: string; category?: string }) {
    return this.redis.withLock(`article:${citizenId}`, 10_000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const portal = await tx.newsPortal.findUnique({ where: { ownerId: citizenId } });
        if (!portal) throw new NotFoundException("create a news portal first");
        const day = await this.game.currentDay();
        // 5 articles per day (v2).
        const today = await tx.article.count({
          where: { portalId: portal.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
        });
        if (today >= 5) throw new ConflictException("5 articles per day limit");
        if (!dto.title?.trim() || !dto.body?.trim()) throw new BadRequestException("title and body required");
        const category = (NEWS_CATEGORIES as readonly string[]).includes(dto.category ?? "")
          ? (dto.category as never)
          : "FUN_OTHER";
        return tx.article.create({
          data: {
            portalId: portal.id,
            authorId: citizenId,
            title: dto.title.trim().slice(0, 200),
            body: sanitizeHtml(dto.body),
            category,
          },
        });
      }),
    );
  }

  async listArticles(opts: { category?: string; take?: number }) {
    const articles = await this.prisma.article.findMany({
      where: opts.category ? { category: opts.category as never } : {},
      include: {
        portal: { select: { id: true, name: true, avatarColor: true } },
        author: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, opts.take ?? 30),
    });
    // The web UI consumes the portal relation as "newspaper" (its whole surface
    // speaks of newspapers) — expose it under that key or the feed crashes.
    return articles.map(({ portal, ...article }) => ({ ...article, newspaper: portal }));
  }

  /** Reading an article counts a verified view → 1g per 100 unique views to the portal owner. */
  async getArticle(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        portal: { select: { id: true, name: true, avatarColor: true, ownerId: true, goldEarned: true } },
        author: { select: { id: true, nickname: true } },
        votes: { select: { citizenId: true } },
      },
    });
    if (!article) throw new NotFoundException("article not found");
    const views = article.views + 1;
    await this.prisma.article.update({ where: { id }, data: { views } });
    if (views % 100 === 0) {
      await this.prisma.$transaction(async (tx: Tx) => {
        await tx.newsPortal.update({ where: { id: article.portalId }, data: { goldEarned: { increment: BigInt(100) } } });
        await tx.citizen.update({ where: { id: article.portal.ownerId }, data: { gold: { increment: BigInt(100) } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "OTHER", amount: BigInt(100), toType: "CITIZEN", toId: article.portal.ownerId, meta: { portalViews: views } as Prisma.InputJsonValue },
        });
      });
    }
    return article;
  }

  async upvote(citizenId: string, articleId: string) {
    return this.redis.withLock(`article:${articleId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        try {
          await tx.articleVote.create({ data: { articleId, citizenId } });
        } catch {
          throw new ConflictException("already upvoted");
        }
        const article = await tx.article.update({ where: { id: articleId }, data: { upvotes: { increment: 1 } } });
        await this.game.trackAchievement(tx, article.authorId, "COMMUNITY", "ARTICLE_UPVOTES");
        return { ok: true, upvotes: article.upvotes };
      }),
    );
  }

  async subscribe(citizenId: string, portalId: string) {
    return this.redis.withLock(`sub:${portalId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        try {
          await tx.subscription.create({ data: { portalId, citizenId } });
        } catch {
          throw new ConflictException("already subscribed");
        }
        const count = await tx.subscription.count({ where: { portalId } });
        if (count > 0 && count % MEDIA_MOGLU_STEP === 0) {
          const portal = await tx.newsPortal.findUniqueOrThrow({ where: { id: portalId } });
          await this.game.awardMedal(tx, portal.ownerId, "MEDIA_MOGLU", 5, { portalId, subscribers: count });
        }
        return { ok: true, subscribers: count };
      }),
    );
  }

  async unsubscribe(citizenId: string, portalId: string) {
    await this.prisma.subscription.deleteMany({ where: { portalId, citizenId } });
    return { ok: true };
  }

  async myPortal(citizenId: string) {
    return this.prisma.newsPortal.findUnique({
      where: { ownerId: citizenId },
      include: { _count: { select: { subscribers: true, articles: true, editors: true } } },
    });
  }

  /** Public portal directory (feeds the Media page's Portals tab + rating widget). */
  async listPortals(citizenId?: string) {
    const portals = await this.prisma.newsPortal.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        ownerId: true,
        name: true,
        avatarColor: true,
        totalViews: true,
        owner: { select: { nickname: true } },
        _count: { select: { subscribers: true, articles: true } },
        ...(citizenId
          ? {
              subscribers: {
                where: { citizenId },
                select: { citizenId: true },
              },
            }
          : {}),
      },
    });

    return portals.map((p) => {
      const isSubscribed = citizenId ? ((p as any).subscribers?.length ?? 0) > 0 : false;
      const isOwner = citizenId ? p.ownerId === citizenId : false;
      const { subscribers, ...rest } = p as any;
      return {
        ...rest,
        isSubscribed,
        isOwner,
      };
    });
  }

  async addEditor(ownerId: string, portalName: string, editorNickname: string) {
    const portal = await this.prisma.newsPortal.findUnique({ where: { ownerId }, select: { id: true } });
    if (!portal) throw new NotFoundException("portal not found");
    const editor = await this.prisma.citizen.findUnique({ where: { nickname: editorNickname }, select: { id: true } });
    if (!editor) throw new NotFoundException("citizen not found");
    await this.prisma.portalEditor.upsert({
      where: { portalId_citizenId: { portalId: portal.id, citizenId: editor.id } },
      create: { portalId: portal.id, citizenId: editor.id },
      update: {},
    });
    return { ok: true };
  }

  async tip(citizenId: string, articleId: string, gold: number) {
    if (gold <= 0 || gold > 500) throw new BadRequestException("tip must be between 0.01 and 500 gold");
    const cents = GOLD(gold);
    const article = await this.prisma.article.findUnique({ where: { id: articleId }, select: { authorId: true } });
    if (!article) throw new NotFoundException("article not found");
    if (article.authorId === citizenId) throw new BadRequestException("cannot tip yourself");
    return this.redis.withLock(`tip:${citizenId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, { type: "CITIZEN", id: article.authorId }, cents, "TIP", { articleId });
        await this.game.notify(tx, article.authorId, "TIP_RECEIVED", { from: citizenId, gold });
        return { ok: true, gold };
      }),
    );
  }

  // ===========================================================================
  // SHOUTS (100 chars; global / country / army)
  // ===========================================================================

  async shouts(opts: { scope?: string; scopeId?: string; take?: number }) {
    const scope = (opts.scope ?? "GLOBAL") as Prisma.EnumShoutScopeFilter["equals"];
    return this.prisma.shout.findMany({
      where: {
        scope,
        ...(scope === "GLOBAL" ? { scopeId: null } : { scopeId: opts.scopeId ?? undefined }),
      },
      include: { author: { select: { id: true, nickname: true, citizenshipCountry: { select: { code: true, flagColor: true } } } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, opts.take ?? 30),
    });
  }

  async createShout(citizen: { id: string; citizenshipCountryId: string }, dto: { scope?: string; scopeId?: string; content: string }) {
    const content = (dto.content ?? "").slice(0, SHOUT_MAX_LENGTH);
    if (!content.trim()) throw new BadRequestException("empty shout");
    const scope = (dto.scope ?? "GLOBAL") as "GLOBAL" | "COUNTRY" | "MILITARY_UNIT";
    let scopeId: string | null = dto.scopeId ?? null;
    if (scope === "COUNTRY") scopeId = citizen.citizenshipCountryId;
    if (scope === "MILITARY_UNIT") {
      const membership = await this.prisma.muMembership.findUnique({ where: { citizenId: citizen.id } });
      if (!membership) throw new ForbiddenException("join an army first");
      scopeId = membership.muId;
    }
    if (scope === "GLOBAL") scopeId = null;
    const shout = await this.prisma.shout.create({ data: { authorId: citizen.id, scope, scopeId, content } });
    await this.redis.publish(`shouts:${scope}:${scopeId ?? "-"}`, { type: "shout", shout });
    return shout;
  }
}
