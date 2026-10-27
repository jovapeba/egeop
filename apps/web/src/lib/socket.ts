"use client";

import { io, type Socket } from "socket.io-client";

const WS = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";

let socket: Socket | null = null;

export function battleSocket(): Socket {
  if (!socket) {
    socket = io(WS, { transports: ["websocket"], autoConnect: false });
  }
  return socket;
}

export interface BattleEvent {
  type: "hit";
  battleId: string;
  roundId: string;
  roundNumber: number;
  side: "ATTACKER" | "DEFENDER";
  mode: "SINGLE" | "BERSERK";
  hits: Array<{ damage: number; crit: boolean; missed: boolean; avoided: boolean }>;
  wall: number;
  attackerDamage: number;
  defenderDamage: number;
  endsAt: string;
}

export interface CountryChatMessage {
  id: string;
  countryId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    nickname: string;
    avatarColor: string;
    level: number;
    citizenshipCountry: {
      id: string;
      name: string;
      code: string;
      flagColor: string;
    };
  };
}

let chatSock: Socket | null = null;

export function chatSocket(token?: string | null): Socket {
  if (!chatSock) {
    chatSock = io(WS, {
      transports: ["websocket"],
      autoConnect: false,
      auth: token ? { token } : undefined,
    });
  } else if (token && (!chatSock.auth || (chatSock.auth as any).token !== token)) {
    chatSock.auth = { ...(chatSock.auth || {}), token };
  }
  return chatSock;
}

