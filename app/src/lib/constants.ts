export const COLORS = {
  navy: '#2E4057',
  mutedGreen: '#66A182',
  paleMint: '#CAFFB9',
  lime: '#AEF78E',
  yellowGreen: '#C0D461',
} as const;

export const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';
export const PROGRAM_ID = 'DHNLLb8p9kSFg8AzVzXAVmkHVkcb8yDM3xMz9iXALcv1';
const eventText = 'BEARHACKS26_DEVNET_EVENT_000000';
export const EVENT_ID_BYTES = new Uint8Array(32);
new TextEncoder().encodeInto(eventText, EVENT_ID_BYTES);