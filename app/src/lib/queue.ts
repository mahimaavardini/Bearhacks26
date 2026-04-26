import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { QueueSpot } from '../types/queue';

const ACCOUNT_DISCRIMINATOR = 8;
const EVENT_OFFSET = ACCOUNT_DISCRIMINATOR + 32 + 4 + 8 + 1 + 8;

export const deserializeSpot = (pubkey: PublicKey, data: Uint8Array): QueueSpot => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const owner = new PublicKey(data.subarray(8, 40)).toBase58();
  const queuePosition = view.getUint32(40, true);
  const createdAt = Number(view.getBigInt64(44, true));
  const isSelling = view.getUint8(52) === 1;
  const priceLamports = view.getBigUint64(53, true);
  const eventId = data.slice(61, 93);

  return {
    pubkey: pubkey.toBase58(),
    owner,
    queuePosition,
    createdAt,
    isSelling,
    priceLamports,
    eventId,
  };
};

export const fetchEventSpots = async (
  connection: Connection,
  programId: PublicKey,
  eventId: Uint8Array,
): Promise<QueueSpot[]> => {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: 8 + 32 + 4 + 8 + 1 + 8 + 32 },
      {
        memcmp: {
          offset: EVENT_OFFSET,
          bytes: bs58.encode(eventId),
        },
      },
    ],
  });

  return accounts
    .map((account) => deserializeSpot(account.pubkey, account.account.data))
    .sort((a, b) => a.queuePosition - b.queuePosition);
};