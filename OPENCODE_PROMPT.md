# PROMPT FOR OPENCODE: COMPLETE eGeopolis IMPLEMENTATION

> **Instructions for the AI Coding Agent (OpenCode):**
> You are an expert principal software engineer and systems architect implementing the complete, official game specification for **eGeopolis** — a high-performance, real-time social-strategy MMO game built on Next.js 14 (App Router), NestJS 10, PostgreSQL 16 (Prisma ORM), Redis 7, Socket.io, and Tailwind CSS.
>
> Your objective is to implement all 7 phases outlined below with 100% adherence to the game design wiki, zero compile errors, complete type-safety, and production-grade architecture.

---

## 0. ENGINEERING STANDARDS & ARCHITECTURAL INVARIANTS

1. **NestJS Architecture Standards**:
   - Organize strictly by feature modules (`src/<feature>/<feature>.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `dto/`).
   - No circular dependencies (`forwardRef` is forbidden; extract shared logic or use `@nestjs/event-emitter`).
   - Constructor injection only (avoid `ModuleRef.get()` service-locator anti-patterns).
   - All controller endpoints must validate request payloads using `class-validator` and `class-transformer` DTOs.
   - Centralized error handling using NestJS `HttpException` subclasses (`NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException`).
   - Atomic database modifications must run inside `prisma.$transaction`. Do not make uncommitted out-of-transaction queries.
2. **Financial Math & Minor Units**:
   - All fiat currencies and gold must use **minor units** (integers/BigInt): `1 Gold = 100 minor units`, `1 Currency Unit (CC) = 100 minor units`.
   - Never use floating point math for balances, debts, salaries, dividends, or market transactions.
   - Market and Monetary offers support 4 decimal places (`0.0001` unit = base integer math / 10,000 where applicable). Job fair offers support 2 decimal places.
3. **Frontend Standards (Next.js 14 App Router)**:
   - Use React 18 / Next.js App Router with Server & Client components properly separated (`'use client'` where hooks or sockets are required).
   - Premium military/tactical glassmorphism dark aesthetic: Deep dark slate/zinc background (`#0a0d14`), emerald/amber/cyan tactical accents, glowing borders, crisp typography, responsive layout.
   - Zero placeholder UI or broken navigation.
4. **Execution Protocol**:
   - Work methodically phase-by-phase.
   - After updating the Prisma schema, execute `npx prisma db push --schema=apps/api/prisma/schema.prisma` and `npx prisma generate --schema=apps/api/prisma/schema.prisma`.
   - Constantly verify type-safety by executing `npm run -ws --if-present typecheck`.

---

## PHASE 1: CORE DOMAIN, WORLD GEOGRAPHY & RAW SUPPLY CHAIN

### 1.1 Align Raws and Products in `packages/game-core` & Prisma
Update `packages/game-core/src/constants.ts` and `apps/api/prisma/schema.prisma`:
- **6 Raw Materials**:
  - `GRAIN`, `SUGAR`, `GUNPOWDER`, `STONE`, `WOOD`, `PETROL`.
  - Remove deprecated raw types (`IRON`, `DIAMOND`, `OIL`).
- **10 Manufactured Products**:
  - `AMMO` (derived from Gunpowder; Q1 requires 2 gunpowder, Q5 requires 10 gunpowder; Q1 increases damage by %, Q5 increases damage by 80%).
  - `FOOD` (derived from Grain; 1 grain per Q; restores 10 HP per Q).
  - `ENERGY_DRINK` (derived from Sugar; 2 sugar per Q; restores 10 HP per Q).
  - `PANTRY` (derived from Wood; 1000 wood; increases max food limit by 10, non-stackable, 60 days lifespan, repairable with wood).
  - `FRIDGE` (derived from Stone; 2000 stone; increases max energy drink limit by 10, non-stackable, 60 days lifespan, repairable with stone).
  - `HOSPITAL` (derived from Stone; 300 stone per Q; gives +1 food limit and +1 energy drink limit per Q).
  - `FORTIFICATION` (derived from Stone; 300 stone per Q; gives +3% bonus damage per Q in battle round).
  - `MILITARY_AIR_BASE` (derived from Wood; 1500 wood per Q; provides border to 2 neighboring regions per Q, non-raw/non-capital regions only, 1h cooldown before attack).
  - `MILITARY_NAVY_BASE` (derived from Stone; 1500 stone per Q; deployed in port regions, gives border to other port regions with radius scaled by Q, 1h cooldown before attack).
  - `TICKET` (derived from Petrol; Economy Class Q1: 4 petrol, reduces 50 HP on travel; First Class Q5: 20 petrol, 0 HP loss on travel).

### 1.2 Damage Ranks (40 Ranks) & Levels (51 Levels)
In `packages/game-core/src/constants.ts`:
- **40 Damage Ranks** (+1% damage boost per rank up):
  1: 100 Civil, 2: 250 Reserves, 3: 500 Cadet, 4: 1k Private, 5: 2.5k PFC, 6: 5k Specialist, 7: 10k Lance Cpl, 8: 17.5k Cpl, 9: 25k Sgt, 10: 35k Staff Sgt, 11: 50k SFC, 12: 70k GySgt, 13: 100k MSgt, 14: 150k MGySgt, 15: 250k 1st Sgt, 16: 375k Sgt Maj, 17: 500k CSM, 18: 650k SMA, 19: 800k E4 Petty Officer, 20: 1kk E5 Petty Officer, 21: 1.2kk E6 Petty Officer, 22: 1.5kk WO1, 23: 2kk CW2, 24: 2.5kk CW3, 25: 3kk CW4, 26: 4kk CW5, 27: 5kk 2nd Lt, 28: 6.5kk 1st Lt, 29: 8kk Capt, 30: 10kk Major, 31: 12.5kk Lt Col, 32: 15kk Col, 33: 17.5kk Brig Gen, 34: 20kk Maj Gen, 35: 25kk Lt Gen, 36: 30kk Gen, 37: 40kk Gen of the Army, 38: 50kk Gen of the Armies, 39: 75kk Grand Marshal, 40: 100kk Generalissimus.
- **51 Level XP Table**:
  1: 1-9, 2: 10-19, 3: 20-39, 4: 40-59, 5: 60-89, 6: 90-129, 7: 130-179, 8: 180-239, 9: 240-319 (awards 5 Gold for each level-up starting from L9), 10: 320-429, 11: 430-569, 12: 570-749, 13: 750-999 (unlocks referral bonus sharing, voting, Stock Companies, and News Portals), ..., 50: 1,040,000-1,159,999, 51: 1,160,000+.

### 1.3 World Geography & Database Seeding
Update `packages/game-core/src/world-data.ts` and `apps/api/prisma/seed.ts`:
- **54 Playable Countries**:
  Albania, Algeria, Argentina, Armenia, Austria, Azerbaijan, Belgium, Bolivia, Bosnia and Herzegovina, Brazil, Bulgaria, Chile, China, Colombia, Croatia, Czech Republic, Egypt, Estonia, France, Georgia, Germany, Greece, Hungary, India, Indonesia, Iran, Israel, Italy, Japan, Latvia, Libya, Lithuania, Mexico, Montenegro, Morocco, Netherlands, North Macedonia, Pakistan, Peru, Philippines, Poland, Portugal, Romania, Russia, Serbia, Slovakia, Slovenia, Spain, Sweden, Tunisia, Turkey, Ukraine, United Kingdom, United States of America.
  - Exactly **7 regions per playable country**: 1 Capital region, 2 Raw regions (1 Sugar or Grain, 1 Wood, Stone, or Petrol), and 4 Non-raw regions.
- **13 Neutral Countries**:
  Cuba, Paraguay, Taiwan, Saudi Arabia, Moldova, Switzerland, Cyprus, Kosovo, Ireland, Nagorno Karabakh, Malta, Southern Finland, Southern Norway.
  - 5 or 6 regions each: exactly 1 bridge region to each adjacent playable border country + 1 middle Gunpowder region (Gunpowder can only be extracted in neutral countries).
- **1 Staff Country**:
  - Located in Antarctic with 1 region named `Prison`.
- **National Organisations**:
  - Initialize each country with a `NationalOrganisation` record.
  - Seed 1 Q1 company for each core raw region belonging to the National Organisation.
  - Seed 10,000 Country Currency in the National Organisation treasury.

---

## PHASE 2: ECONOMY, AUCTIONS, EMBARGOS & STOCK COMPANIES

### 2.1 Auction House System
Build dedicated Auction House (`apps/api/src/auctions/` and frontend `/auctions`):
- Supports listing **Weapon Attachments** and **Special Items** (`Adrenalin Rush`, `Matrix`, `Upgrade`).
- Auction durations: 1 to 48 hours.
- Bids are public and transparent. No secret reserve bid.
- Minimum outbid: Current top bid + 3%.
- **30-Second Sniper Anti-Sniping Rollback**:
  - When a bid is placed with $< 30$ seconds remaining, reset `endsAt = now + 30 seconds`.
  - Broadcast timer extension in real time via Socket.io (`auction:timer_extended`).
- Auction Fees:
  - 1% of starting price deducted immediately upon listing.
  - 2% of final sale price deducted from seller proceeds if sold. (No fee if unsold).
- Cancellations: Seller may cancel offer only if zero bids have been placed.

### 2.2 Embargo System
Implement in `apps/api/src/politics/` & `apps/api/src/economy/`:
- 3 Embargo Types: `Marketplace`, `Job`, `Monetary`.
- Proposed by Minister of Economy as a law; costs 10 Gold from the National Organisation treasury; duration is 30 days.
- **Effects**:
  - `Marketplace Embargo`: Citizens of target country cannot buy or sell on the market; removes existing offers.
  - `Job Embargo`: Citizens of target country cannot apply; workers in companies of target country get fired immediately.
  - `Monetary Embargo`: Citizens cannot buy or sell national currency on the Monetary Market; removes active FX offers.
- **Alliance Immunity**: Countries in the same alliance cannot embargo each other.
- Cancellation Law: Minister of Economy can propose canceling an embargo for 10 Gold.

### 2.3 Companies for Sale & Armies for Sale
- Calculate appraised value of companies based on Q1-Q5 creation and upgrade costs.
- Company owners can list companies for 70% to 100% of appraised value.
- Armies for sale: Leader can list military unit ownership on a dedicated secondary market.

### 2.4 Stock Companies (JSC) Expansion
- Minimum Level 13 to create.
- 1% transaction fee on buying shares.
- CEO Voting Engine: 50% + 1 voting threshold for issuing shares, paying dividends, changing share price, and CEO election/impeachment.
- Manager Roles assigned by CEO:
  - `Company Manager`: Can set worker wages, post/cancel job offers, and fire workers.
  - `Monetary Manager`: Manage monetary market currency offers.
  - `Marketplace Manager`: Post and fulfill marketplace product offers.
- Staff liquidation: Shares belonging to permanently banned or inactive players (30+ days) can be put on sale by Staff.

---

## PHASE 3: ARMIES, WEAPON ATTACHMENTS & COMBAT

### 3.1 Armies (Military Units) Overhaul
Update `apps/api/src/mu/` and `/armies` UI:
- Army creation cost: 5 Gold. Initial member limit: 1. Max member limit: 100.
- **4 Military Ranks**:
  - Rookie (+5% damage on Battle Order). Slot expand: 5g/slot.
  - Amateur (+10% damage on Battle Order). Slot expand: 10g/slot.
  - Experienced (+15% damage on Battle Order). Slot expand: 25g/slot.
  - Elite (+20% damage on Battle Order). Slot expand: 50g/slot.
  - Rank upgrade cost: Rookie $\rightarrow$ Amateur: 5g/slot; Amateur $\rightarrow$ Experienced: 15g/slot; Experienced $\rightarrow$ Elite: 25g/slot.
- **Rules & Restrictions**:
  - 3-day cooldown between joining different armies.
  - Army Weapon Attachment storage locked until member has been in army for at least 3 days.
  - Auto-Supply Salary: Army companies can configure auto-supply payouts in goods (e.g. ammo/food) directly to worker inventories instead of cash, immune to regional occupation dismissal.

### 3.2 Weapon Attachments & WA Dealer
Implement 8 WA slots and 9 parameters in `packages/game-core` and `apps/api/src/equipment/`:
- **8 Slots**: `MUZZLE`, `LASER`, `OPTIC`, `STOCK`, `REAR_GRIP`, `MAGAZINE`, `BARREL`, `UNDERBARREL`.
- **9 Parameters**: Headshot (+1%/Q), Recoil (-1%/Q), Max damage (+1.5%/Q), Min damage (+0.9%/Q), Strength (+3/Q), Punch (+3/Q), Luck (+1%/Q), Resupply (+1%/Q), Good looking (+1/Q).
- Base player attributes: Strength 100, Headshot 5%, Recoil 9.5%, Luck 5%. Caps: Headshot 40%, Recoil 0%, Luck 40%, Strength uncapped.
- **Weapon Attachment Dealer**:
  - Upgrade: Trade 3 of same quality for 1 of higher quality (3 Q1 $\rightarrow$ Q2 = 0.67g, 3 Q2 $\rightarrow$ Q3 = 2g, 3 Q3 $\rightarrow$ Q4 = 6g, 3 Q4 $\rightarrow$ Q5 = 18g).
  - Downgrade: Trade 1 WA for 2 lower-quality WAs (1 duplicate of original + 1 random attachment chosen strictly according to the wiki probability matrix).
- **Decay Engine**: Q5 Weapon Attachments reset to minimum parameter values annually on anniversary date. Upgrades can restore them.

### 3.3 Battle Engine & Drops
- Maximum 15 rounds per battle, 8 round wins required for victory.
- Regular rounds last 1 hour. Civil War rounds last 2 hours.
- 24-hour attack window after DoW; 24-hour initiative for winning country.
- Attacking cost: 10 Gold (playable region), 20 Gold (neutral region) from National Organisation.
- **Regional Conquest Bonuses (applied to citizens of occupying country)**:
  - Conquered raw region: +10% production on that raw and derivative products.
  - Conquered capital region: +10% bonus on all production.
  - Neutral country full conquest: +10% bonus on all production.
  - Non-raw & non-capital region: +2% bonus on all production.
  - Capital loss penalty: 10% penalty on all production if nation loses its own capital.
- **Battle Drops Trigger**:
  - Everyone: Q1 WA at 300 hits.
  - Top 10 damage dealers: Q2 WA at 1,500 hits.
  - Top 3 damage dealers: Q3 WA at 7,500 hits.
  - Round Hero: Q4 WA & Upgrade item at 37,500 & 2,500 hits.
- **Training Yard**: Practice battlefield for low damage ranks (Team Alpha vs Team Beta), 1-hour rounds, 8 round wins.

---

## PHASE 4: POLITICS, GOVERNANCE & ALLIANCES

### 4.1 5 Fixed Political Parties
- Initialize each country with 5 fixed parties: `Far-Left`, `Left`, `Center`, `Right`, `Far-Right`.
- Party elections on the 11th of every month (candidacies 8th–10th). Minimum Level 13.
- Party Presidents submit list of up to 20 Congress candidates (18th–20th). If empty, top XP members become candidates.

### 4.2 Country President & Cabinet
- Presidential elections on the 1st of every month (candidacies open last 3 days of preceding month).
- Cabinet roles selected from Congressmen:
  - `Vice Country President`: Can declare wars and attack regions if CP is inactive.
  - `Minister of Defence`: Can propose NAP, MDMA, Deploy/Demolish buildings, and attack regions.
  - `Minister of Economy`: Can propose Tax change, Print money, Minimum salary, and Embargos.
- Presidential Pop-up: Send a 24-hour banner broadcast to all citizens.

### 4.3 18 Law Types
Implement atomic voting and execution for all 18 laws:
1. `Declare War` (30g playable / 50g neutral from National Organisation; CP/vCP).
2. `Ceasefire` (CP only; voted by opponent Congress).
3. `Non-Aggression Pact (NAP)` (CP/MoD; lasts until next CP election).
4. `Join/Leave/Create Alliance` (50g; CP only).
5. `Propose MDMA` (10g; allows citizens to fight remotely from home country).
6. `Cancel MDMA` (10g).
7. `Rival Country` (Once/month; +5% damage boost; 0g).
8. `Deploy/Demolish Building` (Deploy Hospital, Fortification, Air Base, Naval Base).
9. `Tax Change` (Income, Import, VAT).
10. `Print Money` (Increases CC in National Organisation, monitors inflation).
11. `Minimum Salary` (Adjusts min currency per economy skill).
12. `Marketplace Embargo` (10g, 30 days).
13. `Job Embargo` (10g, 30 days).
14. `Monetary Embargo` (10g, 30 days).
15. `Impeach Country President` (Requires Congress majority).
16. `Elect Country President` (Select replacement from Congress after impeachment).
17. `Revoke Citizenship` (Revokes citizen back to native country).
18. `Citizenship Request` (30g fee paid by applicant, 1 Congress sponsor, majority vote, 10 approvals/month cap).

### 4.4 Alliances & Civil Wars
- **Alliances**: Max 5 member countries. Alliance Leader & Vice Leader can set the Alliance Battle Order (+2% bonus damage per member country, max +10%).
- **Civil War Engine**:
  - Unrest petition: Requires $\ge 33.33\%$ support of voting citizens.
  - Cost: 100 Gold + 10% of country population in Gold.
  - 15 rounds max (8 to win), 2-hour rounds.
  - Outcome: Rebel leader becomes President; top 20 rebel fighters become Congressmen. 7-day cooldown between Civil Wars.

---

## PHASE 5: CONTRACTS, BUFFS & DAILY SYSTEMS

### 5.1 Contracts & Loans System
Implement in `apps/api/src/contracts/` and frontend `/contracts`:
- **Money Loans**: Creator specifies amount to loan, duration in days, and interest rate in %. System auto-calculates total gold due.
- **Pack Sales**: Direct sale of Gold/Packs between players. Purchaser cannot propose contract.
- Only Staff members hold permissions to cancel debts.
- **Public Audit Log**: Public feed showing `"Player X and Player Y had a transaction"` without disclosing sensitive amounts.

### 5.2 Buffs System (1 Gold each)
Implement 4 buffs with 24h buff duration and 24h (prem) / 48h (non-prem) debuff duration:
- `Steroid Buff`: +10% damage for 24h $\rightarrow$ -10% damage next 24h/48h.
- `Rambo Buff`: +10% damage with Q5 Ammo for 24h $\rightarrow$ Ammo usage locked next 24h/48h.
- `Patriot Buff`: +10% damage defending core region for 24h $\rightarrow$ -10% damage in all battles next 24h/48h.
- `Rebel Buff`: +10% damage in Resistance War on core region for 24h $\rightarrow$ -10% damage next 24h/48h.

### 5.3 Day Change & Limits Cron
- Day change cron at `00:00 CET`:
  - Reset daily Food (20) and Energy Drink (20) limits.
  - Add active Pantry (+10 Food) and Fridge (+10 Energy Drink) bonuses.
  - Reset work, train, and 20-worker company limits.
- Hourly cron: Restore +1 Food limit, +1 Energy Drink limit, and +100 HP.
- Ad Watch Bonus: Single daily grant of +5 Food limits.
- Tutorial Guide: Profile selector for guide avatar (`Man`, `Woman`, `Chicken`) with contextual onboarding.
- Customizable Sidebar: Store up to 5 user-selected navbar shortcut keys.

---

## PHASE 6: TOURNAMENTS & SPECIAL EVENTS

### 6.1 7 Regular Tournament Engines
Implement tournament brackets and automated match progression in `apps/api/src/events/`:
1. `Gunpowder Cup`: 8 teams (Team Crazy, Team Lollipop, etc.) in 2 groups. 3 pts/win, top 2 advance to semifinals. Rewards: Gunpowder, FAKs, Laser attachments.
2. `Global War`: 2 massive factions, 10-minute rounds, 8 round wins $\rightarrow$ 1 FAK to winning team.
3. `Army Cup`: 2-day event, min 5 members, 125g fee, 4-minute rounds, winners/losers bracket, 10-10 restore on 30 hits. Gold & Laser rewards.
4. `Country Cup`: 1-day single elimination, 4-minute rounds, Laser rewards.
5. `Quickdrop Cup`: Fastest country to hit dynamic damage wall based on top server strength.
6. `1v1 Tournament`: 1-day knockout, 50g entry, 1000g first prize.
7. `First Aid Tournament`: 1 battle, 5 1-hour rounds, live damage leaderboard, FAK rewards for top 50 countries.

### 6.2 Special Events & Annual Crons
- `Halloween Holiday Event`: Earth vs Halloween Army (skeletons/ghosts), 2-hour rounds, dynamic health walls.
- `King of the Hill`: Spawns neutral Hill region; automatic RW upon capture; gold prize to victor.
- `Patriot Week`: Strict citizenship lock; players can only fight for their own country.
- Automated monthly leaderboard rewards (Top 5 damage countries & armies).
- Annual FAK reset cron: Clears unused FAKs, executes Q5 WA parameter decay, awards top annual performers.

---

## PHASE 7: COMMUNITY, STATISTICS, ACHIEVEMENTS & STAFF

### 7.1 Community & Media
- `News Portals`: Level 13, 50 Gold fee. Owner can assign editors. Payout: 1 Gold per 100 unique verified views. 5 articles/day max across 4 categories (`Politics`, `War`, `Economy`, `Fun/Other`).
- `eSocialis`: Gaming profile linking (external game handles) and Army/Newspaper social broadcast pages.
- `Referrals`: 5 Gold at Level 9 (or 13), +0.5 Gold per level-up, +0.5 Gold per medal. Exclude shared IP accounts.

### 7.2 Statistics Engine
Build real-time and aggregate analytics for 6 categories:
- `Country`, `Army`, `Citizen`, `Alliance`, `Stock Company`, `News Portal`.
- Daily, monthly, and all-time damage counters. Permanent historical attribution.

### 7.3 Staff & Police Department
- Staff territory in Antarctic with `Prison` region.
- 4 Staff Ranks: `Police Officer`, `Inspector`, `Special Agent`, `Director`.
- Moderation deck: Debt cancellation, 30-day inactive share liquidation, and public shared IP audit table.

### 7.4 10-Subcategory Achievements Engine
Implement tracking across all 10 subcategories:
1. `Military` (War medals, daily/battle damage tiers, Civil War actions).
2. `Economy` (Company tiers, Stock Company ownership, trading volumes).
3. `Medals` (Medal count milestones, complete sets).
4. `Inviter` (Referrals reaching L13, political roles achieved).
5. `Community` (Articles, upvotes, subscribers, messages).
6. `Politics` (Voting streaks, candidacies, law proposals).
7. `Game Support` (Packs sold via contracts, donations).
8. `Events` (Tournament hits, bracket victories, FAK reset placements).
9. `General` (Pantry/Fridge ownership, 100-day train/work streaks, storage stocks).
10. `Weapon Attachments` (Equipped slots, merges, downgrades, drops).
- **Subcategory Reward**: Automatically award **2 Gold** upon 100% completion of all achievements within any single subcategory.

---

## EXECUTION VERIFICATION CHECKLIST
Upon completing changes, you must run and verify:
1. `npx prisma db push --schema=apps/api/prisma/schema.prisma` $\rightarrow$ Schema in sync.
2. `npx prisma generate --schema=apps/api/prisma/schema.prisma` $\rightarrow$ Client updated.
3. `npm run -ws --if-present typecheck` $\rightarrow$ Must exit with 0 errors.
4. Verify Next.js web build: `npm run build -w apps/web` compiles cleanly.
5. All UI views load without hydration mismatches or 404s.
