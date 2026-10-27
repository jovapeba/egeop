-- CreateEnum
CREATE TYPE "CountryType" AS ENUM ('PLAYABLE', 'NEUTRAL', 'STAFF');

-- CreateEnum
CREATE TYPE "RegionKind" AS ENUM ('CAPITAL', 'RAW', 'NON_RAW', 'BRIDGE', 'GUNPOWDER', 'PRISON');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('POLITICS', 'WAR', 'ECONOMY', 'FUN_OTHER');

-- CreateEnum
CREATE TYPE "EmbargoType" AS ENUM ('MARKETPLACE', 'JOB', 'MONETARY');

-- CreateEnum
CREATE TYPE "BuffType" AS ENUM ('STEROID', 'RAMBO', 'PATRIOT', 'REBEL');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('LOAN', 'PACK_SALE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('OPEN', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "AuctionItemKind" AS ENUM ('WA', 'SPECIAL_ITEM');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('GUNPOWDER_CUP', 'GLOBAL_WAR', 'ARMY_CUP', 'COUNTRY_CUP', 'QUICKDROP_CUP', 'ONE_VS_ONE', 'FIRST_AID');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('REGISTERING', 'RUNNING', 'FINISHED');

-- AlterEnum
BEGIN;
CREATE TYPE "EquipmentSlot_new" AS ENUM ('MUZZLE', 'LASER', 'OPTIC', 'STOCK', 'REAR_GRIP', 'MAGAZINE', 'BARREL', 'UNDERBARREL');
ALTER TABLE "EquippedSlot" ALTER COLUMN "slot" TYPE "EquipmentSlot_new" USING ("slot"::text::"EquipmentSlot_new");
ALTER TABLE "EquipmentItem" ALTER COLUMN "slot" TYPE "EquipmentSlot_new" USING ("slot"::text::"EquipmentSlot_new");
ALTER TYPE "EquipmentSlot" RENAME TO "EquipmentSlot_old";
ALTER TYPE "EquipmentSlot_new" RENAME TO "EquipmentSlot";
DROP TYPE "EquipmentSlot_old";
COMMIT;

-- AlterEnum
ALTER TYPE "LawStatus" ADD VALUE 'FAILED';

-- AlterEnum
BEGIN;
CREATE TYPE "LawType_new" AS ENUM ('DECLARE_WAR', 'ATTACK_REGION', 'CEASEFIRE', 'NAP', 'JOIN_ALLIANCE', 'LEAVE_ALLIANCE', 'CREATE_ALLIANCE', 'PROPOSE_MDMA', 'CANCEL_MDMA', 'RIVAL_COUNTRY', 'DEPLOY_BUILDING', 'DEMOLISH_BUILDING', 'CHANGE_TAX', 'PRINT_MONEY', 'SET_MIN_SALARY', 'MARKETPLACE_EMBARGO', 'JOB_EMBARGO', 'MONETARY_EMBARGO', 'CANCEL_EMBARGO', 'IMPEACH', 'ELECT_PRESIDENT', 'REVOKE_CITIZENSHIP', 'CITIZENSHIP_REQUEST', 'TREASURY_TRANSFER', 'ISSUE_BONDS');
ALTER TABLE "Law" ALTER COLUMN "type" TYPE "LawType_new" USING ("type"::text::"LawType_new");
ALTER TYPE "LawType" RENAME TO "LawType_old";
ALTER TYPE "LawType_new" RENAME TO "LawType";
DROP TYPE "LawType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Product_new" AS ENUM ('GRAIN', 'SUGAR', 'GUNPOWDER', 'STONE', 'WOOD', 'PETROL', 'AMMO', 'FOOD', 'ENERGY_DRINK', 'PANTRY', 'FRIDGE', 'HOSPITAL', 'FORTIFICATION', 'MILITARY_AIR_BASE', 'MILITARY_NAVY_BASE', 'TICKET', 'FIRST_AID_KIT', 'SPECIAL_ITEM');
ALTER TABLE "CountryTax" ALTER COLUMN "product" TYPE "Product_new" USING ("product"::text::"Product_new");
ALTER TABLE "RegionBuilding" ALTER COLUMN "type" TYPE "Product_new" USING ("type"::text::"Product_new");
ALTER TABLE "Storage" ALTER COLUMN "product" TYPE "Product_new" USING ("product"::text::"Product_new");
ALTER TABLE "Company" ALTER COLUMN "product" TYPE "Product_new" USING ("product"::text::"Product_new");
ALTER TABLE "ProductOffer" ALTER COLUMN "product" TYPE "Product_new" USING ("product"::text::"Product_new");
ALTER TABLE "ProductPurchase" ALTER COLUMN "product" TYPE "Product_new" USING ("product"::text::"Product_new");
ALTER TYPE "Product" RENAME TO "Product_old";
ALTER TYPE "Product_new" RENAME TO "Product";
DROP TYPE "Product_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Resource_new" AS ENUM ('GRAIN', 'SUGAR', 'GUNPOWDER', 'STONE', 'WOOD', 'PETROL');
ALTER TABLE "Region" ALTER COLUMN "resource" TYPE "Resource_new" USING ("resource"::text::"Resource_new");
ALTER TYPE "Resource" RENAME TO "Resource_old";
ALTER TYPE "Resource_new" RENAME TO "Resource";
DROP TYPE "Resource_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TxReason" ADD VALUE 'STOCK_TRADE_FEE';
ALTER TYPE "TxReason" ADD VALUE 'JSC_SHARE_ISSUE';
ALTER TYPE "TxReason" ADD VALUE 'JSC_DONATION';
ALTER TYPE "TxReason" ADD VALUE 'JSC_LIQUIDATION';
ALTER TYPE "TxReason" ADD VALUE 'TREATY_FEE';

-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_newspaperId_fkey";

-- DropForeignKey
ALTER TABLE "Newspaper" DROP CONSTRAINT "Newspaper_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_newspaperId_fkey";

-- AlterTable
ALTER TABLE "Article" DROP COLUMN "newspaperId",
DROP COLUMN "scope",
ADD COLUMN     "category" "NewsCategory" NOT NULL DEFAULT 'FUN_OTHER',
ADD COLUMN     "portalId" TEXT NOT NULL,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Citizen" DROP COLUMN "medkits",
ADD COLUMN     "adWatchOnDay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enableTutorial" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "firstAidKits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fridgeDaysLeft" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guide" TEXT NOT NULL DEFAULT 'MAN',
ADD COLUMN     "lastIp" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pantryDaysLeft" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "premiumDaysLeft" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralLevelsPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralMedalsPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shortcuts" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Country" DROP COLUMN "minWage",
ADD COLUMN     "continent" TEXT,
ADD COLUMN     "minSalary" BIGINT NOT NULL DEFAULT 1000,
ADD COLUMN     "rivalOf" TEXT,
ADD COLUMN     "rivalUntil" TIMESTAMP(3),
ADD COLUMN     "svgPath" TEXT,
ADD COLUMN     "type" "CountryType" NOT NULL DEFAULT 'PLAYABLE';

-- AlterTable
ALTER TABLE "GameClock" ADD COLUMN     "lastMonthlyDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastYearlyDone" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Region" ADD COLUMN     "attackCooldownUntil" TIMESTAMP(3),
ADD COLUMN     "isPort" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "RegionKind" NOT NULL DEFAULT 'NON_RAW',
ALTER COLUMN "x" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "y" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Round" DROP COLUMN "defenderDsQuality",
DROP COLUMN "dsExists",
ADD COLUMN     "defenderFortQ" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fortificationExists" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockCompany" ADD COLUMN     "issuePrice" BIGINT NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_pkey",
DROP COLUMN "newspaperId",
ADD COLUMN     "portalId" TEXT NOT NULL,
ADD CONSTRAINT "Subscription_pkey" PRIMARY KEY ("portalId", "citizenId");

-- AlterTable
ALTER TABLE "War" ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "initiativeCountryId" TEXT,
ADD COLUMN     "initiativeUntil" TIMESTAMP(3);

-- DropTable
DROP TABLE "Newspaper";

-- CreateTable
CREATE TABLE "CivilPollVote" (
    "warId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "yes" BOOLEAN NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CivilPollVote_pkey" PRIMARY KEY ("warId","citizenId")
);

-- CreateTable
CREATE TABLE "NewsPortal" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarColor" VARCHAR(16) NOT NULL DEFAULT '#e8b44a',
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "goldEarned" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalEditor" (
    "portalId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,

    CONSTRAINT "PortalEditor_pkey" PRIMARY KEY ("portalId","citizenId")
);

-- CreateTable
CREATE TABLE "NationalOrganisation" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gold" BIGINT NOT NULL DEFAULT 0,
    "fiat" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NationalOrganisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embargo" (
    "id" TEXT NOT NULL,
    "sourceCountryId" TEXT NOT NULL,
    "targetCountryId" TEXT NOT NULL,
    "type" "EmbargoType" NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alliance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceMember" (
    "allianceId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceMember_pkey" PRIMARY KEY ("allianceId","countryId")
);

-- CreateTable
CREATE TABLE "Buff" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "type" "BuffType" NOT NULL,
    "buffUntil" TIMESTAMP(3) NOT NULL,
    "debuffUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "creatorId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "amountGold" BIGINT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "interestPct" INTEGER NOT NULL DEFAULT 0,
    "totalDueGold" BIGINT NOT NULL DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'OPEN',
    "auditNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "kind" "AuctionItemKind" NOT NULL,
    "itemId" TEXT NOT NULL,
    "startPrice" BIGINT NOT NULL,
    "currentBid" BIGINT,
    "currentBidderId" TEXT,
    "minOutbidPct" INTEGER NOT NULL DEFAULT 3,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "listFeePaid" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "type" "TournamentType" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'REGISTERING',
    "config" JSONB,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT,
    "muId" TEXT,
    "citizenId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "hitsA" INTEGER NOT NULL DEFAULT 0,
    "hitsB" INTEGER NOT NULL DEFAULT 0,
    "winnerTeamId" TEXT,
    "endsAt" TIMESTAMP(3),
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "roundEndsAt" TIMESTAMP(3),
    "roundWinsA" INTEGER NOT NULL DEFAULT 0,
    "roundWinsB" INTEGER NOT NULL DEFAULT 0,
    "roundHitsA" INTEGER NOT NULL DEFAULT 0,
    "roundHitsB" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentHit" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatsRollup" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "damage" BIGINT NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatsRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "warId" TEXT,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRating" (
    "id" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "isLike" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedIpRegistration" (
    "id" TEXT NOT NULL,
    "mainId" TEXT NOT NULL,
    "sharedId" TEXT NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedIpRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitizenshipRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "fromCountryId" TEXT NOT NULL,
    "toCountryId" TEXT NOT NULL,
    "sponsorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VOTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CitizenshipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JscPoll" (
    "id" TEXT NOT NULL,
    "jscId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "yesWeight" BIGINT NOT NULL DEFAULT 0,
    "noWeight" BIGINT NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'VOTING',

    CONSTRAINT "JscPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JscPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "yes" BOOLEAN NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "JscPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryChatMessage" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsPortal_ownerId_key" ON "NewsPortal"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPortal_name_key" ON "NewsPortal"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NationalOrganisation_countryId_key" ON "NationalOrganisation"("countryId");

-- CreateIndex
CREATE INDEX "Embargo_targetCountryId_type_active_idx" ON "Embargo"("targetCountryId", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_name_key" ON "Alliance"("name");

-- CreateIndex
CREATE INDEX "Buff_citizenId_idx" ON "Buff"("citizenId");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionId_amount_idx" ON "AuctionBid"("auctionId", "amount");

-- CreateIndex
CREATE INDEX "TournamentHit_tournamentId_teamId_idx" ON "TournamentHit"("tournamentId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentHit_tournamentId_citizenId_matchId_key" ON "TournamentHit"("tournamentId", "citizenId", "matchId");

-- CreateIndex
CREATE INDEX "StatsRollup_ownerType_day_idx" ON "StatsRollup"("ownerType", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StatsRollup_ownerType_ownerId_day_key" ON "StatsRollup"("ownerType", "ownerId", "day");

-- CreateIndex
CREATE INDEX "Achievement_citizenId_subcategory_idx" ON "Achievement"("citizenId", "subcategory");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_citizenId_key_key" ON "Achievement"("citizenId", "key");

-- CreateIndex
CREATE INDEX "SpecialEvent_status_startsAt_idx" ON "SpecialEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "EntityRating_targetType_targetId_idx" ON "EntityRating"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRating_voterId_targetType_targetId_key" ON "EntityRating"("voterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "SharedIpRegistration_ip_idx" ON "SharedIpRegistration"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "SharedIpRegistration_sharedId_key" ON "SharedIpRegistration"("sharedId");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "PrivateMessage_recipientId_readAt_idx" ON "PrivateMessage"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "PrivateMessage_senderId_recipientId_createdAt_idx" ON "PrivateMessage"("senderId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "CitizenshipRequest_toCountryId_status_idx" ON "CitizenshipRequest"("toCountryId", "status");

-- CreateIndex
CREATE INDEX "JscPoll_jscId_idx" ON "JscPoll"("jscId");

-- CreateIndex
CREATE UNIQUE INDEX "JscPollVote_pollId_citizenId_key" ON "JscPollVote"("pollId", "citizenId");

-- CreateIndex
CREATE INDEX "CountryChatMessage_countryId_createdAt_idx" ON "CountryChatMessage"("countryId", "createdAt");

-- CreateIndex
CREATE INDEX "Region_countryId_idx" ON "Region"("countryId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "NationalOrganisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CivilPollVote" ADD CONSTRAINT "CivilPollVote_warId_fkey" FOREIGN KEY ("warId") REFERENCES "War"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPortal" ADD CONSTRAINT "NewsPortal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalEditor" ADD CONSTRAINT "PortalEditor_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "NewsPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "NewsPortal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "NewsPortal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NationalOrganisation" ADD CONSTRAINT "NationalOrganisation_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embargo" ADD CONSTRAINT "Embargo_sourceCountryId_fkey" FOREIGN KEY ("sourceCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embargo" ADD CONSTRAINT "Embargo_targetCountryId_fkey" FOREIGN KEY ("targetCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buff" ADD CONSTRAINT "Buff_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedIpRegistration" ADD CONSTRAINT "SharedIpRegistration_mainId_fkey" FOREIGN KEY ("mainId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedIpRegistration" ADD CONSTRAINT "SharedIpRegistration_sharedId_fkey" FOREIGN KEY ("sharedId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateMessage" ADD CONSTRAINT "PrivateMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateMessage" ADD CONSTRAINT "PrivateMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitizenshipRequest" ADD CONSTRAINT "CitizenshipRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JscPoll" ADD CONSTRAINT "JscPoll_jscId_fkey" FOREIGN KEY ("jscId") REFERENCES "StockCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JscPollVote" ADD CONSTRAINT "JscPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "JscPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryChatMessage" ADD CONSTRAINT "CountryChatMessage_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryChatMessage" ADD CONSTRAINT "CountryChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Citizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

