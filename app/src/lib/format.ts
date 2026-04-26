export const formatWallet = (address?: string | null): string => {
  if (!address) {
    return 'Not connected';
  }

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export const lamportsToSol = (lamports: bigint | number): number => {
  const raw = typeof lamports === 'number' ? BigInt(lamports) : lamports;
  return Number(raw) / 1_000_000_000;
};

export const solToLamports = (sol: number): bigint => {
  if (!Number.isFinite(sol) || sol <= 0) {
    return 0n;
  }

  return BigInt(Math.round(sol * 1_000_000_000));
};

export const formatSol = (sol: number): string => `${sol.toFixed(3)} SOL`;