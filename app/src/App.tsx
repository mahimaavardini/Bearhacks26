import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';
import { COLORS, EVENT_ID_BYTES, PROGRAM_ID } from './lib/constants';
import { formatSol, formatWallet, lamportsToSol, solToLamports } from './lib/format';
import { fetchEventSpots } from './lib/queue';
import { executeSwapTx, listSpotTx, mintSpotTx } from './lib/transactions';
import type { QueueSpot, QueueViewSpot } from './types/queue';

const SLOT_X = [-3.6, -2.2, -0.8, 0.6, 2.0, 3.4];
const CONFIRMATION_LEVEL = 'confirmed';

function Avatar({ spot, priceSol }: { spot: QueueViewSpot; priceSol: number }) {
  const [x, setX] = useState(spot.displayX);

  useFrame(() => {
    setX((prev) => prev + (spot.displayX - prev) * 0.1);
  });

  return (
    <group position={[x, 0, spot.relativeIndex * -0.08]}>
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color={spot.isYou ? COLORS.yellowGreen : COLORS.mutedGreen} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.3, 0.36, 0.9, 12]} />
        <meshStandardMaterial color={spot.isYou ? COLORS.yellowGreen : COLORS.mutedGreen} />
      </mesh>
      <mesh position={[-0.32, 0.65, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.7, 8]} />
        <meshStandardMaterial color={spot.isYou ? COLORS.yellowGreen : COLORS.mutedGreen} />
      </mesh>
      <mesh position={[0.32, 0.65, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.7, 8]} />
        <meshStandardMaterial color={spot.isYou ? COLORS.yellowGreen : COLORS.mutedGreen} />
      </mesh>
      {spot.isYou && (
        <Html position={[0, 2.0, 0]} center>
          <div className="rounded-md bg-[#2E4057] px-2 py-1 text-sm font-semibold text-[#C0D461]">
            #{spot.queuePosition}
          </div>
        </Html>
      )}
      {spot.isSelling && !spot.isYou && (
        <Html position={[0, 2.1 + Math.sin(Date.now() / 250) * 0.05, 0]} center>
          <div className="rounded-md bg-[#AEF78E] px-2 py-1 text-xs font-semibold text-[#2E4057]">
            ${priceSol.toFixed(2)}
          </div>
        </Html>
      )}
    </group>
  );
}

function QueueScene({ spots, you, eventId }: { spots: QueueSpot[]; you?: QueueSpot; eventId: Uint8Array }) {
  const visible = useMemo(() => {
    if (!you) return [] as QueueViewSpot[];

    const youIndex = spots.findIndex((spot) => spot.owner === you.owner);

    return SLOT_X.map((x, idx) => {
      const relative = idx - 4;
      const source = spots[youIndex + relative];

      if (!source) {
        return {
          pubkey: `placeholder-${idx}`,
          owner: 'none',
          queuePosition: Math.max(1, you.queuePosition + relative),
          createdAt: 0,
          isSelling: false,
          priceLamports: 0n,
          eventId,
          relativeIndex: relative,
          displayX: x,
          isYou: relative === 0,
        };
      }

      return {
        ...source,
        relativeIndex: relative,
        displayX: x,
        isYou: source.owner === you.owner,
      };
    });
  }, [eventId, spots, you]);

  return (
    <Canvas camera={{ position: [1.8, 3.3, 7.4], fov: 45 }}>
      <color attach="background" args={[COLORS.navy]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 7, 3]} intensity={1.1} />
      {visible.map((spot) => (
        <Avatar key={spot.pubkey} spot={spot} priceSol={lamportsToSol(spot.priceLamports)} />
      ))}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13, 3]} />
        <meshStandardMaterial color={COLORS.navy} />
      </mesh>
    </Canvas>
  );
}

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [spots, setSpots] = useState<QueueSpot[]>([]);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [balanceSol, setBalanceSol] = useState(0);
  const [sellInput, setSellInput] = useState('0.1');
  const [txStatus, setTxStatus] = useState<string>('');
  const [buyTarget, setBuyTarget] = useState<QueueSpot | null>(null);

  // Use hardcoded event details
  const programId = useMemo(() => {
    try {
      return new PublicKey(PROGRAM_ID);
    } catch {
      return null;
    }
  }, []);

  const publicKey = wallet.publicKey?.toBase58();
  const isWalletConnected = wallet.connected || Boolean(publicKey);
  const yourSpot = spots.find((spot) => spot.owner === publicKey);
  const listedSpots = spots
    .filter((spot) => spot.isSelling && spot.owner !== publicKey)
    .sort((a, b) => a.queuePosition - b.queuePosition);



  useEffect(() => {
    if (!programId) {
      setSpots([]);
      return;
    }

    const load = async () => {
      const data = await fetchEventSpots(connection, programId, EVENT_ID_BYTES);
      setSpots(data);
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [connection, programId]);

  useEffect(() => {
    if (!wallet.publicKey) return;

    void connection.getBalance(wallet.publicKey).then((lamports) => {
      setBalanceSol(lamports / 1_000_000_000);
    });
  }, [connection, wallet.publicKey, spots]);

  const handleJoin = async () => {
    if (!wallet.publicKey) {
      setTxStatus('Please connect your wallet before joining the queue.');
      return;
    }

    try {
      setTxStatus('Submitting mint_spot...');
      const signature = await mintSpotTx(connection, wallet.sendTransaction, wallet.publicKey, programId!, EVENT_ID_BYTES);
      await connection.confirmTransaction(signature, CONFIRMATION_LEVEL);
      setTxStatus('Joined queue successfully.');
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      setTxStatus(`Join failed: ${errorMsg}`);
      console.error('Join error:', error);
      return;
    }

    const data = await fetchEventSpots(connection, programId!, EVENT_ID_BYTES);
    setSpots(data);
  };

  const handleList = async () => {
    if (!yourSpot || !wallet.publicKey || !programId) return;
    const priceLamports = solToLamports(Number(sellInput));
    if (priceLamports <= 0n) return;

    try {
      setTxStatus('Submitting list_spot...');
      const signature = await listSpotTx(
        connection,
        wallet.sendTransaction,
        wallet.publicKey,
        new PublicKey(yourSpot.pubkey),
        programId,
        priceLamports,
      );
      await connection.confirmTransaction(signature, CONFIRMATION_LEVEL);
      setTxStatus('Spot listed.');
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      setTxStatus(`Listing failed: ${errorMsg}`);
      console.error('Listing error:', error);
      return;
    }

    setSpots((prev) =>
      prev.map((spot) =>
        spot.owner === yourSpot.owner ? { ...spot, isSelling: true, priceLamports } : spot,
      ),
    );
  };

  const handleBuyConfirm = async () => {
    if (!buyTarget) return;
    if (!yourSpot || !wallet.publicKey || !programId) return;

    try {
      setTxStatus(`Submitting execute_swap for #${buyTarget.queuePosition}...`);
      const signature = await executeSwapTx(
        connection,
        wallet.sendTransaction,
        wallet.publicKey,
        new PublicKey(buyTarget.owner),
        new PublicKey(yourSpot.pubkey),
        new PublicKey(buyTarget.pubkey),
        programId,
      );
      await connection.confirmTransaction(signature, CONFIRMATION_LEVEL);
      setTxStatus('Swap complete.');
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      setTxStatus(`Swap failed: ${errorMsg}`);
      console.error('Swap error:', error);
      return;
    }

    const oldPosition = yourSpot.queuePosition;
    setSpots((prev) =>
      prev.map((spot) => {
        if (spot.owner === yourSpot.owner) {
          return { ...spot, queuePosition: buyTarget.queuePosition, isSelling: false, priceLamports: 0n };
        }

        if (spot.owner === buyTarget.owner) {
          return { ...spot, queuePosition: oldPosition, isSelling: false, priceLamports: 0n };
        }

        return spot;
      }),
    );
    setBuyTarget(null);
  };


  return (
    <main className="min-h-screen bg-[#2E4057] text-[#CAFFB9]">
      <header className="sticky top-0 z-30">
        <div className="bg-[#2E4057] px-4 py-3 text-center text-3xl font-bold">Swap a Spot</div>
        <div className="grid grid-cols-3 items-center gap-2 bg-[#2E4057] px-3 py-2 text-xs font-medium sm:text-sm">
          <span>{formatWallet(publicKey)}</span>
          <span className="text-center text-[#C0D461]">{yourSpot ? `#${yourSpot.queuePosition}` : '--'}</span>
          <span className="text-right">{formatSol(balanceSol)}</span>
        </div>
      </header>

      <section className="h-[45vh] min-h-[300px] px-2 pb-2">
        {!yourSpot && (
          <div className="absolute inset-x-0 top-28 z-20 mx-auto flex w-[90%] max-w-sm flex-col items-center rounded-lg bg-[#CAFFB9] p-4 text-center text-[#2E4057] shadow-lg">
            <p className="mb-3 font-semibold">Connect your wallet to join the queue.</p>
            <WalletMultiButton className="!mt-2 !h-12 !min-w-[180px] !rounded-md !bg-[#2E4057] !text-[#CAFFB9]" />
            <a
              href="https://solflare.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 text-xs font-semibold underline"
            >
              Need Solflare? Open solflare.com
            </a>
            <button
              type="button"
              onClick={handleJoin}
              disabled={!isWalletConnected}
              className={`mt-4 h-12 w-full rounded-md border border-[#2E4057] font-semibold ${
                !isWalletConnected
                  ? 'bg-[#9CA9A0] text-[#5C635C] cursor-not-allowed'
                  : 'bg-[#CAFFB9] text-[#2E4057]'
              }`}
            >
              {isWalletConnected ? 'Join Queue' : 'Connect Wallet First'}
            </button>
            {txStatus && <p className="mt-3 max-h-24 overflow-y-auto text-xs whitespace-pre-wrap">{txStatus}</p>}
          </div>
        )}
        <QueueScene spots={spots} you={yourSpot} eventId={EVENT_ID_BYTES} />
      </section>

      <section className="min-h-[40vh] rounded-t-2xl bg-[#CAFFB9] px-4 py-4 text-[#2E4057]">
        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-[#2E4057]">
          <button
            type="button"
            onClick={() => setActiveTab('buy')}
            className={`h-12 text-base font-semibold ${
              activeTab === 'buy' ? 'bg-[#2E4057] text-[#CAFFB9]' : 'bg-[#CAFFB9] text-[#2E4057]'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sell')}
            className={`h-12 text-base font-semibold ${
              activeTab === 'sell' ? 'bg-[#2E4057] text-[#CAFFB9]' : 'bg-[#CAFFB9] text-[#2E4057]'
            }`}
          >
            Sell
          </button>
        </div>
        {txStatus && <p className="mb-3 text-xs font-medium">{txStatus}</p>}

        {activeTab === 'buy' ? (
          <div className="max-h-[28vh] space-y-2 overflow-y-auto pr-1">
            {listedSpots.map((spot) => (
              <button
                key={spot.pubkey}
                type="button"
                onClick={() => setBuyTarget(spot)}
                className="flex h-12 w-full items-center justify-between rounded-md border border-[#2E4057] bg-[#CAFFB9] px-3 text-left font-semibold"
              >
                <span>#{spot.queuePosition}</span>
                <span>${lamportsToSol(spot.priceLamports).toFixed(2)}</span>
              </button>
            ))}
            {listedSpots.length === 0 && <p className="text-sm font-medium">No active listings yet.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold">Your Spot</p>
              <div className="mt-1 inline-flex h-12 min-w-20 items-center justify-center rounded-md border border-[#2E4057] px-4 text-xl font-bold">
                {yourSpot ? `#${yourSpot.queuePosition}` : '--'}
              </div>
            </div>
            <label className="block text-sm font-semibold">
              Sell For:
              <div className="mt-1 flex h-12 items-center rounded-md border border-[#2E4057] bg-[#CAFFB9] px-3">
                <span className="mr-2">$</span>
                <input
                  value={sellInput}
                  onChange={(event) => setSellInput(event.target.value)}
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSellInput('0.1')}
                className="h-12 rounded-md border-2 border-[#2E4057] bg-[#CAFFB9] font-semibold text-[#2E4057]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleList}
                className="h-12 rounded-md bg-[#2E4057] font-semibold text-[#CAFFB9]"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </section>
      {buyTarget && (
        <div className="fixed inset-0 z-40 flex items-end bg-[#2E4057]/80 p-4">
          <div className="w-full rounded-2xl bg-[#CAFFB9] p-4 text-[#2E4057]">
            <p className="text-base font-semibold">
              Buy position #{buyTarget.queuePosition} for ${lamportsToSol(buyTarget.priceLamports).toFixed(2)}?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBuyTarget(null)}
                className="h-12 rounded-md border-2 border-[#2E4057] bg-[#CAFFB9] font-semibold text-[#2E4057]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBuyConfirm}
                className="h-12 rounded-md bg-[#2E4057] font-semibold text-[#CAFFB9]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}