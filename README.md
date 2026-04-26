# Queue Marketplace (Bearhacks26)

Solana-powered queue marketplace for free events. People join for free (rent-only PDA creation), optionally list their queue position, and buyers can atomically pay and swap positions.

## Project Structure

- `anchor/` - Anchor smart contract, tests, and deploy config
- `app/` - React + Vite + React Three Fiber + Wallet Adapter frontend

## Smart Contract

Program implements:

- `mint_spot(event_id)` - creates a queue spot PDA for caller and assigns next queue position
- `list_spot(price_lamports)` - marks caller spot as selling at chosen price
- `execute_swap()` - transfers SOL buyer->seller and swaps queue positions between buyer/seller spot PDAs

Queue spot state:

- `owner: Pubkey`
- `queue_position: u32`
- `created_at: i64`
- `is_selling: bool`
- `price_lamports: u64`
- `event_id: [u8; 32]`

### Anchor Commands

```bash
cd anchor
npm install
anchor test
anchor deploy --provider.cluster devnet
```

## Frontend

Portrait-first UI with:

- Top banner (`Swap a Spot` + wallet/spot/balance row)
- Mid 3D queue scene (6 avatars: 4 ahead, you, 1 behind)
- Bottom Buy/Sell marketplace panel with strict contrast tab/button rules

### Frontend Commands

```bash
cd app
npm install
npm run dev
npm run build
```

## Notes

- Uses Solana devnet endpoint by default
- Program ID constant is currently: `QuEUe9gEFt6mY7z2fV3wtdJPK1SLVQ3kQW1pQ7fR1uE`
- Event ID is currently a fixed 32-byte devnet event seed in `app/src/lib/constants.ts`
- For production, update Program ID + Event ID from scanned QR payload and generated IDL types