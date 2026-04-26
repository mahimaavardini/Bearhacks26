import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("queue_marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.QueueMarketplace as Program;
  const eventId = Uint8Array.from(Array(32).fill(7));

  const buyer = provider.wallet;
  const seller = Keypair.generate();

  const [buyerSpot] = PublicKey.findProgramAddressSync(
    [Buffer.from("spot"), buyer.publicKey.toBuffer(), Buffer.from(eventId)],
    program.programId,
  );

  const [sellerSpot] = PublicKey.findProgramAddressSync(
    [Buffer.from("spot"), seller.publicKey.toBuffer(), Buffer.from(eventId)],
    program.programId,
  );

  const [eventState] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), Buffer.from(eventId)],
    program.programId,
  );

  it("mints buyer and seller spots", async () => {
    await provider.connection.requestAirdrop(seller.publicKey, LAMPORTS_PER_SOL * 2);

    await program.methods
      .mintSpot(Array.from(eventId))
      .accounts({
        owner: buyer.publicKey,
        spot: buyerSpot,
        eventState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .mintSpot(Array.from(eventId))
      .accounts({
        owner: seller.publicKey,
        spot: sellerSpot,
        eventState,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const buyerAccount = await program.account.queueSpot.fetch(buyerSpot);
    const sellerAccount = await program.account.queueSpot.fetch(sellerSpot);

    expect(buyerAccount.queuePosition).to.equal(0);
    expect(sellerAccount.queuePosition).to.equal(1);
    expect(Buffer.from(buyerAccount.eventId)).to.deep.equal(Buffer.from(eventId));
  });

  it("lists a seller spot", async () => {
    const price = new BN(0.1 * LAMPORTS_PER_SOL);

    await program.methods
      .listSpot(price)
      .accounts({ owner: seller.publicKey, spot: sellerSpot })
      .signers([seller])
      .rpc();

    const sellerAccount = await program.account.queueSpot.fetch(sellerSpot);
    expect(sellerAccount.isSelling).to.equal(true);
    expect(sellerAccount.priceLamports.toString()).to.equal(price.toString());
  });

  it("executes paid positional swap", async () => {
    const sellerBefore = await provider.connection.getBalance(seller.publicKey);
    const buyerBefore = await provider.connection.getBalance(buyer.publicKey);

    const sellerAccountBefore = await program.account.queueSpot.fetch(sellerSpot);
    const buyerAccountBefore = await program.account.queueSpot.fetch(buyerSpot);

    await program.methods
      .executeSwap()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        buyerSpot,
        sellerSpot,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sellerAfter = await provider.connection.getBalance(seller.publicKey);
    const buyerAfter = await provider.connection.getBalance(buyer.publicKey);
    const sellerAccountAfter = await program.account.queueSpot.fetch(sellerSpot);
    const buyerAccountAfter = await program.account.queueSpot.fetch(buyerSpot);

    expect(sellerAfter).to.be.greaterThan(sellerBefore);
    expect(buyerAfter).to.be.lessThan(buyerBefore);
    expect(buyerAccountAfter.queuePosition).to.equal(sellerAccountBefore.queuePosition);
    expect(sellerAccountAfter.queuePosition).to.equal(buyerAccountBefore.queuePosition);
    expect(buyerAccountAfter.isSelling).to.equal(false);
    expect(sellerAccountAfter.isSelling).to.equal(false);
  });
});