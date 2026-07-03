// Card-related queries for the mtg-library-api.
// Each hook is a typed wrapper around TanStack Query → axios → DmdResponse unwrap.

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../api";

// ---------- Types ----------
//
// Minimal shape for now — extend as the UI starts using more fields.
// Mirrors the Spring DTO from `dracolich-mtg-library-api`.

export interface CardFaceDto {
  name: string;
  full_type?: string;
  types?: string[];
  oracle_text?: string;
  flavor_text?: string;
  gameplay_property?: {
    mana_cost?: string;
    mana_value?: number;
    colors?: string[];
    color_identity?: string[];
    power?: string;
    toughness?: string;
  };
}

export interface CardArtDto {
  id?: string;
  scryfall_id?: string;
  card_id?: string;
  set_id?: string;
  release_date?: string;
  rarity?: string;
  // Scryfall image URIs — keys mirror Scryfall's: small, normal, large,
  // png, art_crop, border_crop. Not every key is always populated.
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
    border_crop?: string;
  };
  prices?: Record<string, number>;
  // Per-printing flavor text — changes between different printings of the
  // same oracle card. The card-detail panel renders this and updates when
  // the user picks a different printing from the art-versions carousel.
  flavor_text?: string;
  flavor_name?: string;
  collector_number?: string;
  full_art?: boolean;
  textless?: boolean;
  variation?: boolean;
  watermark?: string;
}

export interface CardDto {
  id: string;
  oracle_id: string;
  name: string;
  keywords?: string[];
  layout?: string;
  multiface: boolean;
  first_release_date?: string;
  edhrec_rank?: number;
  default_face?: CardFaceDto;
  flipped_face?: CardFaceDto;
  default_art?: CardArtDto;
}

// Spring `Page<T>` envelope (post-DmdResponse-unwrap)
export interface PageRecord<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

// ---------- Hooks ----------

interface SearchCardsArgs {
  // Partial name match (case-insensitive on the server). Goes in the URL
  // because Spring's @RequestParam is easier to bind than nested body fields.
  name?: string;
  // MTG color identity filter — array of single-char codes ("W", "U", ...).
  // Sent only when non-empty; matching semantics depend on the server.
  colorIdentity?: string[];
  // Card-type filter — array of capitalized type strings ("Creature", ...).
  types?: string[];
  // Spring-style sort: "field,direction". E.g. "first_release_date,desc"
  // for the newest-first home view.
  sort?: string;
  page?: number;
  size?: number;
}

/**
 * Search cards by name + filters. The body carries the filter fields; the
 * URL carries name + paging + sort. Filters are omitted entirely when empty
 * so the queryKey stays stable across rerenders.
 */
export function useSearchCards({
  name,
  colorIdentity,
  types,
  sort,
  page = 0,
  size = 10,
}: SearchCardsArgs = {}) {
  return useQuery({
    queryKey: [
      "cards",
      "search",
      { name, colorIdentity, types, sort, page, size },
    ],
    queryFn: () => {
      const body: Record<string, unknown> = {};
      if (colorIdentity && colorIdentity.length > 0) {
        body.color_identity = colorIdentity;
      }
      if (types && types.length > 0) {
        // The API expects uppercase type codes (e.g. "ARTIFACT", "CREATURE")
        // even though the chip labels are title-cased for display.
        body.types = types.map((t) => t.toUpperCase());
      }
      return api.mtgLibrary<PageRecord<CardDto>>("/cards/search", {
        method: "POST",
        params: { name, page, size, sort },
        data: body,
      });
    },
  });
}

/**
 * Infinite-scroll variant of `useSearchCards`. Same backend endpoint,
 * same args minus `page` (the hook manages page indexes internally).
 * Returns the TanStack `useInfiniteQuery` result so callers can:
 *
 *   const q = useInfiniteSearchCards({ name, ... });
 *   const cards = q.data?.pages.flatMap(p => p.content) ?? [];
 *   <FlatList onEndReached={() => q.hasNextPage && q.fetchNextPage()} />
 *
 * Page size defaults to 20 — chunky enough that prefetch doesn't fire
 * every couple of swipes, small enough that the first page hydrates
 * quickly.
 */
export function useInfiniteSearchCards({
  name,
  colorIdentity,
  types,
  sort,
  size = 20,
}: Omit<SearchCardsArgs, "page"> = {}) {
  return useInfiniteQuery({
    queryKey: [
      "cards",
      "search-infinite",
      { name, colorIdentity, types, sort, size },
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const body: Record<string, unknown> = {};
      if (colorIdentity && colorIdentity.length > 0) {
        body.color_identity = colorIdentity;
      }
      if (types && types.length > 0) {
        body.types = types.map((t) => t.toUpperCase());
      }
      return api.mtgLibrary<PageRecord<CardDto>>("/cards/search", {
        method: "POST",
        params: { name, page: pageParam, size, sort },
        data: body,
      });
    },
    // Spring's Page<T> has `last: boolean` — when true, no more pages.
    // Otherwise the next page index is current + 1.
    getNextPageParam: (lastPage) =>
      lastPage.last ? undefined : lastPage.number + 1,
  });
}

/**
 * Convenience: the newest N cards, sorted by `first_release_date` desc.
 * Used as the cards-screen empty state when there's no query / filters.
 */
export function useNewestCards(size = 10) {
  return useSearchCards({
    sort: "first_release_date,desc",
    size,
  });
}

interface CardByIdArgs {
  id: string | undefined;
}

/**
 * Fetch a single card by id. `enabled` follows the id — disabled until we
 * have a real id, so callers can pass `id` directly from `useLocalSearchParams`
 * without checking for undefined themselves.
 */
export function useCardById({ id }: CardByIdArgs) {
  return useQuery({
    queryKey: ["cards", "byId", id],
    queryFn: () => api.mtgLibrary<CardDto>(`/cards/${id}`),
    enabled: !!id,
  });
}
