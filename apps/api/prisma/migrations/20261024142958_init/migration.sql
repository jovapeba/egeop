-- CreateEnum
CREATE TYPE "Resource" AS ENUM ('GRAIN', 'IRON', 'DIAMOND', 'OIL', 'WOOD', 'STONE');

-- CreateEnum
CREATE TYPE "Density" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Product" AS ENUM ('GRAIN', 'IRON', 'DIAMOND', 'OIL', 'WOOD', 'STONE', 'FOOD', 'WEAPON', 'GIFT', 'TICKET', 'HOUSE', 'ESTATE', 'HOSPITAL', 'DEFENSE_SYSTEM', 'MEDKIT');

-- CreateEnum
CREATE TYPE "EquipmentSlot" AS ENUM ('HELMET', 'ARMOR', 'VISION', 'WEAPON_UPGRADE', 'OFFHAND', 'PANTS', 'SHOES', 'LUCKY_CHARM');

-- CreateEnum
CREATE TYPE "StorageOwnerType" AS ENUM ('CITIZEN', 'COMPANY', 'JSC', 'COUNTRY', 'MILITARY_UNIT');

-- CreateEnum
CREATE TYPE "MarketOwnerType" AS ENUM ('CITIZEN', 'COMPANY', 'JSC', 'COUNTRY');

-- CreateEnum
CREATE TYPE "WarType" AS ENUM ('DIRECT', 'RESISTANCE', 'CIVIL');

-- CreateEnum
CREATE TYPE "WarStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "BattleStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "BattleSide" AS ENUM ('ATTACKER', 'DEFENDER');

-- CreateEnum
CREATE TYPE "HitMode" AS ENUM ('SINGLE', 'BERSERK');

-- CreateEnum
CREATE TYPE "CivilPollStatus" AS ENUM ('VOTING', 'FAILED', 'PASSED');

-- CreateEnum
CREATE TYPE "StockSide" AS ENUM ('SELL', 'BUY');

-- CreateEnum
CREATE TYPE "LawType" AS ENUM ('CHANGE_TAX', 'SET_MIN_WAGE', 'PRINT_MONEY', 'TREASURY_TRANSFER', 'ISSUE_BONDS', 'DECLARE_WAR', 'ATTACK_REGION', 'DEPLOY_BUILDING', 'DEMOLISH_BUILDING', 'PROPOSE_PEACE', 'PROPOSE_MPP', 'IMPEACH');

-- CreateEnum
CREATE TYPE "LawStatus" AS ENUM ('VOTING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "ElectionType" AS ENUM ('PRESIDENTIAL', 'PARTY_LEADER', 'CONGRESS');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('CANDIDATURE', 'VOTING', 'CLOSED');

-- CreateEnum
CREATE TYPE "MuRank" AS ENUM ('COMMANDER', 'CAPTAIN', 'RECRUIT');

-- CreateEnum
CREATE TYPE "MuApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ShoutScope" AS ENUM ('GLOBAL', 'COUNTRY', 'MILITARY_UNIT');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxAsset" AS ENUM ('GOLD', 'FIAT');

-- CreateEnum
CREATE TYPE "TxReason" AS ENUM ('STARTER', 'SALARY', 'WAGE_PAYMENT', 'TAX', 'MARKET_PURCHASE', 'MARKET_SALE', 'MONETARY_TRADE', 'MEDAL', 'LEVEL_UP', 'LAW_EXECUTION', 'TREASURY_TRANSFER', 'PRINT_MONEY', 'WAR_DECLARE', 'REGION_ATTACK', 'RW_START', 'CIVIL_START', 'SUBSIDY', 'MERGE_FEE', 'AUCTION_FEE', 'JSC_CREATE', 'JSC_DIVIDEND', 'STOCK_TRADE', 'MU_CREATE', 'MU_EXPAND', 'COMPANY_CREATE', 'COMPANY_UPGRADE', 'COMPANY_RELOCATE', 'COMPANY_INDUSTRY', 'COMPANY_SALE', 'NEWSPAPER_CREATE', 'TIP', 'BOND_ISSUE', 'BOND_REDEEM', 'OTHER');

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "currencyName" TEXT NOT NULL,
    "currencySymbol" VARCHAR(4) NOT NULL,
    "flagColor" VARCHAR(16) NOT NULL DEFAULT '#4a6de8',
    "treasuryGold" BIGINT NOT NULL DEFAULT 0,
    "treasuryFiat" BIGINT NOT NULL DEFAULT 0,
    "minWage" BIGINT NOT NULL DEFAULT 1000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "presidentId" TEXT,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryTax" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "vat" INTEGER NOT NULL DEFAULT 1,
    "importTax" INTEGER NOT NULL DEFAULT 1,
    "incomeTax" INTEGER NOT NULL DEFAULT 25,

    CONSTRAINT "CountryTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "coreCountryId" TEXT NOT NULL,
    "isCapital" BOOLEAN NOT NULL DEFAULT false,
    "resource" "Resource",
    "density" "Density" NOT NULL DEFAULT 'NONE',
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "population" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionNeighbor" (
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,

    CONSTRAINT "RegionNeighbor_pkey" PRIMARY KEY ("aId","bId")
);

-- CreateTable
CREATE TABLE "RegionBuilding" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "type" "Product" NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegionBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citizen" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarColor" VARCHAR(16) NOT NULL DEFAULT '#5aa2e8',
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL DEFAULT 50,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "ecoSkill" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "totalDamage" BIGINT NOT NULL DEFAULT 0,
    "lastRegenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workedOnDay" INTEGER NOT NULL DEFAULT 0,
    "trainedOnDay" INTEGER NOT NULL DEFAULT 0,
    "foodUsed" INTEGER NOT NULL DEFAULT 0,
    "giftUsed" INTEGER NOT NULL DEFAULT 0,
    "foodLimitExtra" INTEGER NOT NULL DEFAULT 0,
    "giftLimitExtra" INTEGER NOT NULL DEFAULT 0,
    "hospitalUsedOnDay" INTEGER NOT NULL DEFAULT 0,
    "workTotalDays" INTEGER NOT NULL DEFAULT 0,
    "workStreak" INTEGER NOT NULL DEFAULT 0,
    "lastWorkedDay" INTEGER NOT NULL DEFAULT 0,
    "trainTotalSessions" INTEGER NOT NULL DEFAULT 0,
    "trainStreak" INTEGER NOT NULL DEFAULT 0,
    "lastTrainedDay" INTEGER NOT NULL DEFAULT 0,
    "gold" BIGINT NOT NULL DEFAULT 0,
    "citizenshipCountryId" TEXT NOT NULL,
    "locationRegionId" TEXT NOT NULL,
    "referrerId" TEXT,
    "referralCode" TEXT NOT NULL,
    "societyBuilderCount" INTEGER NOT NULL DEFAULT 0,
    "medkits" INTEGER NOT NULL DEFAULT 0,
    "freeFlightsToday" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Citizen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquippedSlot" (
    "citizenId" TEXT NOT NULL,
    "slot" "EquipmentSlot" NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "EquippedSlot_pkey" PRIMARY KEY ("citizenId","slot")
);

-- CreateTable
CREATE TABLE "Storage" (
    "id" TEXT NOT NULL,
    "ownerType" "StorageOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 0,
    "quantity" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "ownerType" "StorageOwnerType" NOT NULL DEFAULT 'CITIZEN',
    "ownerId" TEXT NOT NULL,
    "slot" "EquipmentSlot" NOT NULL,
    "quality" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerType" "MarketOwnerType" NOT NULL DEFAULT 'CITIZEN',
    "product" "Product" NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 1,
    "regionId" TEXT NOT NULL,
    "fiatWallet" BIGINT NOT NULL DEFAULT 0,
    "forSale" BOOLEAN NOT NULL DEFAULT false,
    "salePrice" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkedToday" (
    "companyId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkedToday_pkey" PRIMARY KEY ("companyId","day")
);

-- CreateTable
CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "minEcoSkill" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "salary" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salary" BIGINT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ceoId" TEXT NOT NULL,
    "treasuryGold" BIGINT NOT NULL DEFAULT 0,
    "sharesTotal" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "jscId" TEXT NOT NULL,
    "holderCitizenId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOrder" (
    "id" TEXT NOT NULL,
    "jscId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "side" "StockSide" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTrade" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL,
    "jscId" TEXT NOT NULL,
    "totalGold" BIGINT NOT NULL,
    "perShare" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOffer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerType" "MarketOwnerType" NOT NULL DEFAULT 'CITIZEN',
    "countryId" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPurchase" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "quality" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "vatPaid" BIGINT NOT NULL,
    "importPaid" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetaryOffer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sellAsset" "TxAsset" NOT NULL,
    "sellCountryId" TEXT,
    "sellAmount" BIGINT NOT NULL,
    "remaining" BIGINT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "buyAsset" "TxAsset" NOT NULL,
    "buyCountryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetaryOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetaryTrade" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sellAsset" "TxAsset" NOT NULL,
    "buyAsset" "TxAsset" NOT NULL,
    "sellCountryId" TEXT,
    "buyCountryId" TEXT,
    "sellAmount" BIGINT NOT NULL,
    "buyAmount" BIGINT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetaryTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentOffer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "buyerId" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bond" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "principal" BIGINT NOT NULL,
    "interest" BIGINT NOT NULL,
    "issuedDay" INTEGER NOT NULL,
    "redeemDay" INTEGER NOT NULL,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subsidy" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "goldPerHit" BIGINT NOT NULL,
    "budgetGold" BIGINT NOT NULL,
    "spentGold" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subsidy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "War" (
    "id" TEXT NOT NULL,
    "type" "WarType" NOT NULL,
    "attackerCountryId" TEXT,
    "defenderCountryId" TEXT NOT NULL,
    "status" "WarStatus" NOT NULL DEFAULT 'ACTIVE',
    "attackerWins" INTEGER NOT NULL DEFAULT 0,
    "defenderWins" INTEGER NOT NULL DEFAULT 0,
    "rwInitiatorId" TEXT,
    "civilPollStatus" "CivilPollStatus",
    "civilPollYes" INTEGER NOT NULL DEFAULT 0,
    "civilPollNo" INTEGER NOT NULL DEFAULT 0,
    "civilPollEndsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "winnerCountryId" TEXT,

    CONSTRAINT "War_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "warId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "attackerCountryId" TEXT NOT NULL,
    "defenderCountryId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "BattleStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "winnerCountryId" TEXT,

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "defenderDsQuality" INTEGER NOT NULL DEFAULT 0,
    "attackerDamage" BIGINT NOT NULL DEFAULT 0,
    "defenderDamage" BIGINT NOT NULL DEFAULT 0,
    "winnerSide" "BattleSide",
    "hospitalExists" BOOLEAN NOT NULL DEFAULT false,
    "dsExists" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleHit" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "side" "BattleSide" NOT NULL,
    "mode" "HitMode" NOT NULL,
    "damage" BIGINT NOT NULL,
    "crit" BOOLEAN NOT NULL DEFAULT false,
    "missed" BOOLEAN NOT NULL DEFAULT false,
    "avoided" BOOLEAN NOT NULL DEFAULT false,
    "weaponsUsed" INTEGER NOT NULL DEFAULT 0,
    "hpUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilitaryUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "levelIdx" INTEGER NOT NULL DEFAULT 0,
    "memberSlots" INTEGER NOT NULL DEFAULT 10,
    "gold" BIGINT NOT NULL DEFAULT 0,
    "recruitmentOpen" BOOLEAN NOT NULL DEFAULT true,
    "countryOnly" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilitaryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuMembership" (
    "muId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "rank" "MuRank" NOT NULL DEFAULT 'RECRUIT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MuApplication" (
    "id" TEXT NOT NULL,
    "muId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "message" TEXT,
    "status" "MuApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MuApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuOrder" (
    "id" TEXT NOT NULL,
    "muId" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "side" "BattleSide" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MuOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyMembership" (
    "partyId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "type" "ElectionType" NOT NULL,
    "day" INTEGER NOT NULL,
    "status" "ElectionStatus" NOT NULL DEFAULT 'CANDIDATURE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidacy" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "partyId" TEXT,
    "presentation" TEXT,
    "withdrawn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Candidacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "electionId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("electionId","citizenId")
);

-- CreateTable
CREATE TABLE "CongressSeat" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "partyId" TEXT,
    "electedDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CongressSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Minister" (
    "countryId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "Minister_pkey" PRIMARY KEY ("countryId","role")
);

-- CreateTable
CREATE TABLE "Law" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "type" "LawType" NOT NULL,
    "payload" JSONB NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "LawStatus" NOT NULL DEFAULT 'VOTING',
    "yes" INTEGER NOT NULL DEFAULT 0,
    "no" INTEGER NOT NULL DEFAULT 0,
    "votingEndsAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Law_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawVote" (
    "lawId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "yes" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LawVote_pkey" PRIMARY KEY ("lawId","citizenId")
);

-- CreateTable
CREATE TABLE "Treaty" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "countryAId" TEXT NOT NULL,
    "countryBId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Treaty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Newspaper" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarColor" VARCHAR(16) NOT NULL DEFAULT '#e8b44a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Newspaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "newspaperId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("newspaperId","citizenId")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "newspaperId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleVote" (
    "articleId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,

    CONSTRAINT "ArticleVote_pkey" PRIMARY KEY ("articleId","citizenId")
);

-- CreateTable
CREATE TABLE "Shout" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "scope" "ShoutScope" NOT NULL,
    "scopeId" TEXT,
    "content" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medal" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "goldPaid" INTEGER NOT NULL,
    "meta" JSONB,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "asset" "TxAsset" NOT NULL,
    "reason" "TxReason" NOT NULL,
    "amount" BIGINT NOT NULL,
    "fromType" TEXT,
    "fromId" TEXT,
    "toType" TEXT,
    "toId" TEXT,
    "countryId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitizenWallet" (
    "citizenId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "CitizenWallet_pkey" PRIMARY KEY ("citizenId","countryId")
);

-- CreateTable
CREATE TABLE "GameClock" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "serverStart" TIMESTAMP(3) NOT NULL,
    "lastDayDone" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameClock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CountryTax_countryId_product_key" ON "CountryTax"("countryId", "product");

-- CreateIndex
CREATE UNIQUE INDEX "RegionBuilding_regionId_type_key" ON "RegionBuilding"("regionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Citizen_email_key" ON "Citizen"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Citizen_nickname_key" ON "Citizen"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Citizen_referralCode_key" ON "Citizen"("referralCode");

-- CreateIndex
CREATE INDEX "Citizen_citizenshipCountryId_idx" ON "Citizen"("citizenshipCountryId");

-- CreateIndex
CREATE INDEX "Citizen_locationRegionId_idx" ON "Citizen"("locationRegionId");

-- CreateIndex
CREATE INDEX "Storage_ownerType_ownerId_idx" ON "Storage"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Storage_ownerType_ownerId_product_quality_key" ON "Storage"("ownerType", "ownerId", "product", "quality");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Employment_citizenId_active_idx" ON "Employment"("citizenId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "StockCompany_name_key" ON "StockCompany"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Share_jscId_holderCitizenId_key" ON "Share"("jscId", "holderCitizenId");

-- CreateIndex
CREATE INDEX "ProductOffer_countryId_product_quality_active_idx" ON "ProductOffer"("countryId", "product", "quality", "active");

-- CreateIndex
CREATE INDEX "War_status_idx" ON "War"("status");

-- CreateIndex
CREATE INDEX "BattleHit_roundId_idx" ON "BattleHit"("roundId");

-- CreateIndex
CREATE INDEX "BattleHit_battleId_citizenId_idx" ON "BattleHit"("battleId", "citizenId");

-- CreateIndex
CREATE INDEX "BattleHit_citizenId_idx" ON "BattleHit"("citizenId");

-- CreateIndex
CREATE UNIQUE INDEX "MilitaryUnit_name_key" ON "MilitaryUnit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MuMembership_citizenId_key" ON "MuMembership"("citizenId");

-- CreateIndex
CREATE UNIQUE INDEX "MuApplication_muId_citizenId_key" ON "MuApplication"("muId", "citizenId");

-- CreateIndex
CREATE UNIQUE INDEX "Party_countryId_name_key" ON "Party"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMembership_citizenId_key" ON "PartyMembership"("citizenId");

-- CreateIndex
CREATE UNIQUE INDEX "Election_countryId_type_day_key" ON "Election"("countryId", "type", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Candidacy_electionId_citizenId_key" ON "Candidacy"("electionId", "citizenId");

-- CreateIndex
CREATE INDEX "CongressSeat_countryId_active_idx" ON "CongressSeat"("countryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Newspaper_ownerId_key" ON "Newspaper"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Newspaper_name_key" ON "Newspaper"("name");

-- CreateIndex
CREATE INDEX "Shout_scope_scopeId_createdAt_idx" ON "Shout"("scope", "scopeId", "createdAt");

-- CreateIndex
CREATE INDEX "Medal_citizenId_type_idx" ON "Medal"("citizenId", "type");

-- CreateIndex
CREATE INDEX "Transaction_toId_idx" ON "Transaction"("toId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_citizenId_readAt_idx" ON "Notification"("citizenId", "readAt");

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "Country_presidentId_fkey" FOREIGN KEY ("presidentId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryTax" ADD CONSTRAINT "CountryTax_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_coreCountryId_fkey" FOREIGN KEY ("coreCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionNeighbor" ADD CONSTRAINT "RegionNeighbor_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionNeighbor" ADD CONSTRAINT "RegionNeighbor_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionBuilding" ADD CONSTRAINT "RegionBuilding_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citizen" ADD CONSTRAINT "Citizen_citizenshipCountryId_fkey" FOREIGN KEY ("citizenshipCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citizen" ADD CONSTRAINT "Citizen_locationRegionId_fkey" FOREIGN KEY ("locationRegionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citizen" ADD CONSTRAINT "Citizen_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedSlot" ADD CONSTRAINT "EquippedSlot_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedSlot" ADD CONSTRAINT "EquippedSlot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkedToday" ADD CONSTRAINT "WorkedToday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCompany" ADD CONSTRAINT "StockCompany_ceoId_fkey" FOREIGN KEY ("ceoId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_jscId_fkey" FOREIGN KEY ("jscId") REFERENCES "StockCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_holderCitizenId_fkey" FOREIGN KEY ("holderCitizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrder" ADD CONSTRAINT "StockOrder_jscId_fkey" FOREIGN KEY ("jscId") REFERENCES "StockCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrder" ADD CONSTRAINT "StockOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTrade" ADD CONSTRAINT "StockTrade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StockOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_jscId_fkey" FOREIGN KEY ("jscId") REFERENCES "StockCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetaryOffer" ADD CONSTRAINT "MonetaryOffer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetaryTrade" ADD CONSTRAINT "MonetaryTrade_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MonetaryOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentOffer" ADD CONSTRAINT "EquipmentOffer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentOffer" ADD CONSTRAINT "EquipmentOffer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bond" ADD CONSTRAINT "Bond_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bond" ADD CONSTRAINT "Bond_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subsidy" ADD CONSTRAINT "Subsidy_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "War" ADD CONSTRAINT "War_attackerCountryId_fkey" FOREIGN KEY ("attackerCountryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "War" ADD CONSTRAINT "War_defenderCountryId_fkey" FOREIGN KEY ("defenderCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "War" ADD CONSTRAINT "War_rwInitiatorId_fkey" FOREIGN KEY ("rwInitiatorId") REFERENCES "Citizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_warId_fkey" FOREIGN KEY ("warId") REFERENCES "War"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleHit" ADD CONSTRAINT "BattleHit_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleHit" ADD CONSTRAINT "BattleHit_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleHit" ADD CONSTRAINT "BattleHit_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuMembership" ADD CONSTRAINT "MuMembership_muId_fkey" FOREIGN KEY ("muId") REFERENCES "MilitaryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuMembership" ADD CONSTRAINT "MuMembership_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuApplication" ADD CONSTRAINT "MuApplication_muId_fkey" FOREIGN KEY ("muId") REFERENCES "MilitaryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuApplication" ADD CONSTRAINT "MuApplication_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuOrder" ADD CONSTRAINT "MuOrder_muId_fkey" FOREIGN KEY ("muId") REFERENCES "MilitaryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMembership" ADD CONSTRAINT "PartyMembership_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMembership" ADD CONSTRAINT "PartyMembership_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CongressSeat" ADD CONSTRAINT "CongressSeat_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minister" ADD CONSTRAINT "Minister_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Law" ADD CONSTRAINT "Law_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawVote" ADD CONSTRAINT "LawVote_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawVote" ADD CONSTRAINT "LawVote_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treaty" ADD CONSTRAINT "Treaty_countryAId_fkey" FOREIGN KEY ("countryAId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treaty" ADD CONSTRAINT "Treaty_countryBId_fkey" FOREIGN KEY ("countryBId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Newspaper" ADD CONSTRAINT "Newspaper_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_newspaperId_fkey" FOREIGN KEY ("newspaperId") REFERENCES "Newspaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_newspaperId_fkey" FOREIGN KEY ("newspaperId") REFERENCES "Newspaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVote" ADD CONSTRAINT "ArticleVote_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVote" ADD CONSTRAINT "ArticleVote_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shout" ADD CONSTRAINT "Shout_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medal" ADD CONSTRAINT "Medal_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitizenWallet" ADD CONSTRAINT "CitizenWallet_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "Citizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitizenWallet" ADD CONSTRAINT "CitizenWallet_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
