import { utils } from '@project-serum/anchor';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Connection,
} from '@solana/web3.js';

const ixDiscriminator = (name: string): Buffer => {
  return Buffer.from(utils.sha256.hash(`global:${name}`)).subarray(0, 8);
};

const writeU64LE = (value: bigint): Buffer => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value, 0);
  return out;
};

export const deriveSpotPda = (programId: PublicKey, owner: PublicKey, eventId: Uint8Array): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('spot'), owner.toBuffer(), Buffer.from(eventId)], programId)[0];

export const deriveEventPda = (programId: PublicKey, eventId: Uint8Array): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('event'), Buffer.from(eventId)], programId)[0];

export const mintSpotTx = async (
  connection: Connection,
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>,
  wallet: PublicKey,
  feePayer: PublicKey,
  programId: PublicKey,
  eventId: Uint8Array,
): Promise<string> => {
  const spot = deriveSpotPda(programId, wallet, eventId);
  const eventState = deriveEventPda(programId, eventId);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: feePayer, isSigner: true, isWritable: true },
      { pubkey: spot, isSigner: false, isWritable: true },
      { pubkey: eventState, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([ixDiscriminator('mint_spot'), Buffer.from(eventId)]),
  });

  const tx = new Transaction().add(ix);
  return sendTransaction(tx, connection);
};

export const listSpotTx = async (
  connection: Connection,
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>,
  owner: PublicKey,
  spot: PublicKey,
  programId: PublicKey,
  priceLamports: bigint,
): Promise<string> => {
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: spot, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([ixDiscriminator('list_spot'), writeU64LE(priceLamports)]),
  });

  const tx = new Transaction().add(ix);
  return sendTransaction(tx, connection);
};

export const executeSwapTx = async (
  connection: Connection,
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>,
  buyer: PublicKey,
  seller: PublicKey,
  buyerSpot: PublicKey,
  sellerSpot: PublicKey,
  programId: PublicKey,
): Promise<string> => {
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: false, isWritable: true },
      { pubkey: buyerSpot, isSigner: false, isWritable: true },
      { pubkey: sellerSpot, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator('execute_swap'),
  });

  const tx = new Transaction().add(ix);
  return sendTransaction(tx, connection);
};