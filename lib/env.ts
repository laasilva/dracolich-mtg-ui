// Typed access to EXPO_PUBLIC_* env vars.
// Anything prefixed EXPO_PUBLIC_ is bundled at build time.

const apiBase = process.env.EXPO_PUBLIC_API_BASE;

if (!apiBase) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE is not set. Add it to .env at the project root."
  );
}

export const env = {
  apiBase: apiBase as string,
  // Per-service base paths (matches Spring webflux.base-path on each service)
  paths: {
    user: "/dracolich/user/api/v0",
    mtgLibrary: "/dracolich/mtg-library/api/v0",
    deckBuilder: "/dracolich/mtg-deck-builder/api/v0",
  },
} as const;
