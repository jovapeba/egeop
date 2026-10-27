import type { Product, WaParamType, WaSlot } from "./constants";

export interface WaParam {
  type: WaParamType;
  value: number;
}

export interface WaItem {
  id: string;
  slot: WaSlot;
  quality: number;
  name: string;
  params: WaParam[];
  ownerId?: string;
}

export interface StorageEntry {
  product: Product;
  quality: number;
  quantity: number;
}

export interface WallState {
  roundId: string;
  attackerDamage: number;
  defenderDamage: number;
  wall: number;
  endsAt: string;
  roundNumber: number;
}

export interface HitFeedEntry {
  citizen: string;
  side: "ATTACKER" | "DEFENDER";
  damage: number;
  crit: boolean;
  missed: boolean;
  mode: "SINGLE" | "BERSERK";
}

export type { Product, WaSlot, WaParamType };
