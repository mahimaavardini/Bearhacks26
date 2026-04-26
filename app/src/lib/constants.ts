export const COLORS = {
  navy: '#2E4057',
  mutedGreen: '#66A182',
  paleMint: '#CAFFB9',
  lime: '#AEF78E',
  yellowGreen: '#C0D461',
} as const;

export const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';
export const PROGRAM_ID = 'QuEUe9gEFt6mY7z2fV3wtdJPK1SLVQ3kQW1pQ7fR1uE';
const eventText = 'BEARHACKS26_DEVNET_EVENT_000000';
export const EVENT_ID_BYTES = new Uint8Array(32);
new TextEncoder().encodeInto(eventText, EVENT_ID_BYTES);