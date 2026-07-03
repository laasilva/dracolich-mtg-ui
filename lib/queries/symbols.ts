// Mana / tap / loyalty symbol lookups via mtg-library-api `/symbols`.
//
// Symbols never change, so cache forever. TanStack Query dedupes by queryKey,
// so 100 cards each rendering `{W}` fire exactly one network request.

import { useQuery } from "@tanstack/react-query";

import { api } from "../api";

export interface SymbolDto {
  id: string;
  symbol: string; // e.g. "{W}"
  plaintext: string; // human-readable: "one white mana"
  alt: string; // short alt text: "W"
  represents_mana: boolean;
  mana_value?: number;
  svg_uri: string; // https://svgs.scryfall.io/card-symbols/W.svg
}

export function useSymbol(symbol: string | undefined) {
  return useQuery({
    queryKey: ["symbol", symbol],
    queryFn: () =>
      api.mtgLibrary<SymbolDto>("/symbols", { params: { symbol } }),
    enabled: !!symbol,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
