import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Explicit row locks (race-condition prevention) inside an open transaction. */
  async lockCitizen(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Citizen" WHERE id = ${id} FOR UPDATE`;
  }
  async lockCompany(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${id} FOR UPDATE`;
  }
  async lockCountry(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Country" WHERE id = ${id} FOR UPDATE`;
  }
  async lockRound(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${id} FOR UPDATE`;
  }
  async lockStockCompany(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "StockCompany" WHERE id = ${id} FOR UPDATE`;
  }
  async lockStorage(tx: Tx, ownerType: string, ownerId: string, product: string, quality: number) {
    await tx.$queryRaw`SELECT id FROM "Storage" WHERE "ownerType" = ${ownerType}::"StorageOwnerType" AND "ownerId" = ${ownerId} AND "product" = ${product}::"Product" AND "quality" = ${quality} FOR UPDATE`;
  }
}
