import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Body } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

const TARGET_TYPES = ["CITIZEN", "STOCK_COMPANY", "NEWS_PORTAL"] as const;
type TargetType = (typeof TARGET_TYPES)[number];
const RATE_MIN_LEVEL = 13; // wiki: Like/Dislike gated to Level 13+

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vote (or re-vote) Like/Dislike on a citizen, stock company or news portal. */
  async rate(
    voter: { id: string; level: number },
    targetType: string,
    targetId: string,
    isLike: boolean,
  ) {
    if (!TARGET_TYPES.includes(targetType as TargetType)) throw new BadRequestException("unknown target type");
    if (voter.level < RATE_MIN_LEVEL) throw new ForbiddenException(`ratings unlock at level ${RATE_MIN_LEVEL}`);
    if (targetType === "CITIZEN" && targetId === voter.id) throw new BadRequestException("cannot rate yourself");
    await this.assertTargetExists(targetType as TargetType, targetId);
    return this.prisma.entityRating.upsert({
      where: { voterId_targetType_targetId: { voterId: voter.id, targetType, targetId } },
      create: { voterId: voter.id, targetType, targetId, isLike },
      update: { isLike },
    });
  }

  /** Like/dislike counts + the caller's own vote (null when not rated yet). */
  async summary(voterId: string, targetType: string, targetId: string) {
    if (!TARGET_TYPES.includes(targetType as TargetType)) throw new BadRequestException("unknown target type");
    const [likes, dislikes, mine] = await this.prisma.$transaction([
      this.prisma.entityRating.count({ where: { targetType, targetId, isLike: true } }),
      this.prisma.entityRating.count({ where: { targetType, targetId, isLike: false } }),
      this.prisma.entityRating.findUnique({
        where: { voterId_targetType_targetId: { voterId, targetType, targetId } },
        select: { isLike: true },
      }),
    ]);
    return { likes, dislikes, myVote: mine?.isLike ?? null };
  }

  private async assertTargetExists(targetType: TargetType, targetId: string) {
    if (targetType === "CITIZEN") {
      if (await this.prisma.citizen.findUnique({ where: { id: targetId }, select: { id: true } })) return;
    } else if (targetType === "STOCK_COMPANY") {
      if (await this.prisma.stockCompany.findUnique({ where: { id: targetId }, select: { id: true } })) return;
    } else if (targetType === "NEWS_PORTAL") {
      if (await this.prisma.newsPortal.findUnique({ where: { id: targetId }, select: { id: true } })) return;
    }
    throw new NotFoundException("rating target not found");
  }
}

@Controller("ratings")
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  rate(
    @CurrentCitizen() citizen: { id: string; level: number },
    @Body() body: { targetType: string; targetId: string; isLike: boolean },
  ) {
    return this.ratings.rate(citizen, body.targetType, body.targetId, body.isLike);
  }

  @Get(":targetType/:targetId")
  summary(
    @CurrentCitizen() citizen: { id: string },
    @Param("targetType") targetType: string,
    @Param("targetId") targetId: string,
  ) {
    return this.ratings.summary(citizen.id, targetType, targetId);
  }
}

@Module({
  providers: [RatingsService],
  controllers: [RatingsController],
})
export class RatingsModule {}
