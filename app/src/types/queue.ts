export type QueueSpot = {
  pubkey: string;
  owner: string;
  queuePosition: number;
  createdAt: number;
  isSelling: boolean;
  priceLamports: bigint;
  eventId: Uint8Array;
};

export type QueueViewSpot = QueueSpot & {
  relativeIndex: number;
  displayX: number;
  isYou: boolean;
};