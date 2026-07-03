// Deck queries for the dracolich-mtg-deck-builder-api.
// Mirrors the Spring DeckDto shape from the backend, with the field-name
// translations Jackson applies (camelCase Java → snake_case JSON).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import { useAuth } from "../auth";
import type { PageRecord } from "./cards";

// ---------- Types ----------

export interface AuditDto {
  created_at?: string;
  last_modified?: string;
}

export interface DeckCardDto {
  card_id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  type_line?: string;
  // Map of Scryfall image sizes: small / normal / large / png / art_crop / border_crop
  image_uri?: Record<string, string>;
  count?: number;
  card_category?: "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD";
}

export interface DeckDto {
  id: string;
  copied_from_id?: string;
  user_id?: string;
  anon_id?: string;
  audit?: AuditDto;
  name: string;
  description?: string;
  // Color identity of the deck (commander color identity for commander decks,
  // aggregate identity of all cards otherwise).
  colors?: string[];
  format?: string; // "COMMANDER" | "STANDARD" | etc.
  status?: string; // DeckStatus enum
  // Present (and length 1-2) on commander decks; null otherwise.
  commander?: DeckCardDto[];
  cards?: DeckCardDto[];
  favorites_count?: number;
  visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED";
  ai_session_id?: string;
  card_count?: number;
  mainboard_count?: number;
  sideboard_count?: number;
  maybeboard_count?: number;
}

// ---------- Hooks ----------

interface DeckListArgs {
  // Optional format filter (e.g. "COMMANDER", "STANDARD"). Omit for all formats.
  format?: string;
  page?: number;
  size?: number;
}

/**
 * Public decks sorted by favoritesCount DESC. Backed by GET /decks/popular.
 */
export function usePopularDecks({
  format,
  page = 0,
  size = 10,
}: DeckListArgs = {}) {
  return useQuery({
    queryKey: ["decks", "popular", { format, page, size }],
    queryFn: () =>
      api.deckBuilder<PageRecord<DeckDto>>("/decks/popular", {
        params: { format, page, size },
      }),
  });
}

/**
 * Public decks sorted by audit.created_at DESC. Backed by GET /decks/latest.
 */
export function useLatestDecks({
  format,
  page = 0,
  size = 10,
}: DeckListArgs = {}) {
  return useQuery({
    queryKey: ["decks", "latest", { format, page, size }],
    queryFn: () =>
      api.deckBuilder<PageRecord<DeckDto>>("/decks/latest", {
        params: { format, page, size },
      }),
  });
}

interface MyDecksArgs {
  // Optional filters mirror the backend's GET /decks/ query params.
  format?: string;
  status?: string;
  visibility?: string;
  page?: number;
  size?: number;
}

/**
 * Decks owned by the authenticated user. Backed by GET /decks/, which is
 * the auth-required list endpoint (returns the caller's own decks — public
 * AND private). Sorted server-side by audit.last_modified DESC so this
 * doubles as a "your recent decks" feed for the dashboard.
 *
 * Disabled when there's no signed-in user — the dashboard renders for
 * anonymous visitors too, and we don't want a 401 churning the cache.
 */
export function useMyDecks({
  format,
  status,
  visibility,
  page = 0,
  size = 10,
}: MyDecksArgs = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "decks",
      "mine",
      user?.userId,
      { format, status, visibility, page, size },
    ],
    queryFn: () =>
      api.deckBuilder<PageRecord<DeckDto>>("/decks/", {
        params: { format, status, visibility, page, size },
      }),
    enabled: !!user,
  });
}

/**
 * Fetch a deck by id. Enabled only when id is present, so callers can
 * pass straight from useLocalSearchParams.
 */
export function useDeckById(id: string | undefined) {
  return useQuery({
    queryKey: ["decks", "byId", id],
    queryFn: () => api.deckBuilder<DeckDto>(`/decks/${id}`),
    enabled: !!id,
  });
}

// Deck stats — computed deterministically server-side and cached per deck.
export interface DeckStatsDto {
  deck_id?: string;
  card_count?: number;
  land_count?: number;
  // CMC bucket → count. Keys are stringified ints (JSON Map serialization).
  mana_curve?: Record<string, number>;
  // Color code ("W","U",...) → normalized percentage (0..1, 3-decimal).
  color_pie?: Record<string, number>;
  // Type name → count of cards with that type (a card can count in many).
  type_breakdown?: Record<string, number>;
  average_cmc?: number;
  warnings?: string[];
}

export function useDeckStats(id: string | undefined) {
  return useQuery({
    queryKey: ["decks", "stats", id],
    queryFn: () => api.deckBuilder<DeckStatsDto>(`/decks/${id}/stats`),
    enabled: !!id,
  });
}

// ---------- Mutations ----------

export interface CardRequest {
  card_id: string;
  count?: number;
  card_category?: "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD";
}

export interface CreateDeckRequest {
  format: string;
  name: string;
  description?: string;
  deck_status?: string;
  // Backend requires cards to be present (NonNull Set). Empty array is fine
  // for "start with nothing, add cards later".
  cards: CardRequest[];
  commander?: CardRequest;
  visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED";
}

/**
 * Create an empty (or seeded) deck. Backed by POST /decks/.
 * Invalidates the popular/latest deck lists on success so a brand-new
 * deck shows up wherever it should.
 */
export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateDeckRequest) =>
      api.deckBuilder<DeckDto>("/decks/", {
        method: "POST",
        data: req,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

// Mirrors UpdateDeckRequest on the backend — all fields optional, only
// non-null fields are applied. `deck_status` matches the @JsonProperty
// on the server record. Anon owners can't promote off PRIVATE; the
// backend returns 401 if they try.
export interface UpdateDeckRequest {
  name?: string;
  description?: string;
  format?: string;
  deck_status?: "DRAFT" | "READY_TO_PLAY";
  visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED";
}

/**
 * Partial metadata update. PUT /decks/{id}. Used by the finalize step
 * to commit name / description / visibility changes and flip status to
 * READY_TO_PLAY.
 */
export function useUpdateDeck(deckId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateDeckRequest) =>
      api.deckBuilder<DeckDto>(`/decks/${deckId}`, {
        method: "PUT",
        data: req,
      }),
    onSuccess: (updated) => {
      if (!deckId) return;
      qc.setQueryData(["decks", "byId", deckId], updated);
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

/**
 * Delete a deck the user owns. Backed by DELETE /decks/{id}.
 *
 * Optimistic: strips the deleted deck from every cached `PageRecord`
 * (any query whose data has a `content` array of DeckDto-shaped items)
 * BEFORE the network call returns. The user navigates to /account/decks
 * after the mutation and immediately sees the list without the deleted
 * deck — no flash of stale data while the refetch lands.
 *
 * On error: rolls back to the pre-mutation snapshots so the list shows
 * the deck back where it was.
 */
export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) =>
      api.deckBuilder<void>(`/decks/${deckId}`, { method: "DELETE" }),
    onMutate: async (deckId) => {
      // Cancel any in-flight "decks/*" queries — without this an
      // incoming refetch could overwrite our optimistic state with the
      // pre-delete data.
      await qc.cancelQueries({ queryKey: ["decks"] });

      // Snapshot every "decks/*" query so we can roll back on error.
      const snapshots = qc.getQueriesData<unknown>({ queryKey: ["decks"] });

      // Optimistically remove the deck from any cache entry that looks
      // like a paginated DeckDto list. The page shape is checked
      // structurally so we don't have to enumerate every consumer
      // (popular / latest / mine / favorites all share PageRecord<DeckDto>).
      snapshots.forEach(([key, value]) => {
        if (
          value &&
          typeof value === "object" &&
          "content" in (value as object) &&
          Array.isArray((value as { content: unknown }).content)
        ) {
          const page = value as PageRecord<DeckDto>;
          const filtered = (page.content ?? []).filter((d) => d.id !== deckId);
          if (filtered.length === page.content.length) return; // not in this page
          qc.setQueryData(key, {
            ...page,
            content: filtered,
            totalElements: Math.max(0, (page.totalElements ?? 0) - 1),
            empty: filtered.length === 0,
          });
        }
      });

      // The by-id entry is meaningless after delete.
      qc.removeQueries({ queryKey: ["decks", "byId", deckId] });

      return { snapshots };
    },
    onError: (_err, _deckId, ctx) => {
      // Roll back every snapshot. Each entry is [queryKey, previousData].
      ctx?.snapshots.forEach(([key, value]) => {
        qc.setQueryData(key, value);
      });
    },
    onSettled: () => {
      // Background refetch confirms the server agrees with our
      // optimistic state. If it doesn't, the UI heals to truth.
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export interface ImportDeckRequest {
  format: string;
  name: string;
  description?: string;
  deck_status?: string;
  visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED";
  // Moxfield / Scryfall-format text. Section markers ("// Sideboard" etc.)
  // honored by the backend parser; strict mode rejects the whole import
  // if any line can't resolve to a card.
  deck_text: string;
}

/**
 * Import a deck from a pasted decklist. Backed by POST /decks/import.
 * Returns the fully-populated DeckDto. 422 with per-line errors if any
 * card name doesn't resolve.
 */
export function useImportDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ImportDeckRequest) =>
      api.deckBuilder<DeckDto>("/decks/import", {
        method: "POST",
        data: req,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

/**
 * Add a single card (or +N count) to a deck. Backed by POST /decks/{id}/cards.
 * Invalidates the deck + stats + AI suggestions for that deck on success
 * so the build page reflects the new state immediately.
 */
export function useAddCardToDeck(deckId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (card: CardRequest) =>
      api.deckBuilder<DeckDto>(`/decks/${deckId}/cards`, {
        method: "POST",
        data: card,
      }),
    onSuccess: (updated) => {
      if (!deckId) return;
      // POST returns the fully-recomputed DeckDto (card_count, mainboard_count,
      // updated audit, …). Write it straight into the cache so the deck
      // column re-renders without a refetch round-trip.
      qc.setQueryData(["decks", "byId", deckId], updated);
      qc.invalidateQueries({ queryKey: ["decks", "stats", deckId] });
      // Mark AI outputs stale (backend cache is also invalidated by the
      // audit.lastModified bump), but don't auto-refetch — each refetch
      // is a ~30s AI call that costs Anthropic tokens. The user gets fresh
      // results by clicking the refresh button in the AI panel, OR by
      // hitting the deck's target size (analyze auto-fires there).
      qc.invalidateQueries({
        queryKey: ["decks", "ai-suggest", deckId],
        refetchType: "none",
      });
      qc.invalidateQueries({
        queryKey: ["decks", "ai-analyze", deckId],
        refetchType: "none",
      });
    },
  });
}

/**
 * Remove a card from the deck. Backed by DELETE /decks/{id}/cards/{cardId}.
 *
 * The backend `removeIf(cardId == ...)` pulls every entry matching that
 * cardId — i.e. all copies of the card across the deck. We optimistically
 * strip those entries from the cached DeckDto so the pile view updates
 * before the network call completes, then settle from the refetch.
 */
export function useRemoveCardFromDeck(deckId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) =>
      api.deckBuilder<unknown>(`/decks/${deckId}/cards/${cardId}`, {
        method: "DELETE",
      }),
    onMutate: async (cardId) => {
      if (!deckId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: ["decks", "byId", deckId] });
      const previous = qc.getQueryData<DeckDto>(["decks", "byId", deckId]);
      if (previous) {
        qc.setQueryData<DeckDto>(["decks", "byId", deckId], {
          ...previous,
          cards: (previous.cards ?? []).filter((c) => c.card_id !== cardId),
        });
      }
      return { previous };
    },
    onError: (_err, _cardId, ctx) => {
      if (deckId && ctx?.previous) {
        qc.setQueryData(["decks", "byId", deckId], ctx.previous);
      }
    },
    onSettled: () => {
      if (!deckId) return;
      qc.invalidateQueries({ queryKey: ["decks", "byId", deckId] });
      qc.invalidateQueries({ queryKey: ["decks", "stats", deckId] });
      qc.invalidateQueries({
        queryKey: ["decks", "ai-suggest", deckId],
        refetchType: "none",
      });
      qc.invalidateQueries({
        queryKey: ["decks", "ai-analyze", deckId],
        refetchType: "none",
      });
    },
  });
}

/**
 * Update the copy count for a card already in the deck. Backed by
 * PUT /decks/{id}/cards/{cardId}?category=... with body `{ count }`.
 *
 * Backend constraint: `count >= 1`. To go to 0, callers should use the
 * DELETE endpoint (useRemoveCardFromDeck) instead.
 *
 * `category` defaults to MAINBOARD on the backend when omitted. The same
 * cardId can exist with different categories (mainboard + sideboard),
 * so the param is the disambiguator.
 */
export function useUpdateCardCount(deckId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      count,
      category = "MAINBOARD",
    }: {
      cardId: string;
      count: number;
      category?: "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD";
    }) =>
      api.deckBuilder<DeckDto>(`/decks/${deckId}/cards/${cardId}`, {
        method: "PUT",
        params: { category },
        data: { count },
      }),
    onMutate: async ({ cardId, count, category = "MAINBOARD" }) => {
      if (!deckId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: ["decks", "byId", deckId] });
      const previous = qc.getQueryData<DeckDto>(["decks", "byId", deckId]);
      if (previous) {
        // Optimistic: mutate the matching entry's count so the editor
        // pile reflects +/- taps without waiting for the round trip.
        qc.setQueryData<DeckDto>(["decks", "byId", deckId], {
          ...previous,
          cards: (previous.cards ?? []).map((c) => {
            const sameCard = c.card_id === cardId;
            const sameCategory =
              (c.card_category ?? "MAINBOARD") === category;
            return sameCard && sameCategory ? { ...c, count } : c;
          }),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (deckId && ctx?.previous) {
        qc.setQueryData(["decks", "byId", deckId], ctx.previous);
      }
    },
    onSuccess: (updated) => {
      if (!deckId) return;
      // Server-recomputed DeckDto wins over optimistic state.
      qc.setQueryData(["decks", "byId", deckId], updated);
    },
    onSettled: () => {
      if (!deckId) return;
      qc.invalidateQueries({ queryKey: ["decks", "byId", deckId] });
      qc.invalidateQueries({ queryKey: ["decks", "stats", deckId] });
      qc.invalidateQueries({
        queryKey: ["decks", "ai-suggest", deckId],
        refetchType: "none",
      });
      qc.invalidateQueries({
        queryKey: ["decks", "ai-analyze", deckId],
        refetchType: "none",
      });
    },
  });
}

// ---------- AI suggestions ----------
//
// Backend returns a unified DeckAiResultDto for both /suggest (build-time)
// and /analyze (review-time) — same shape, different prompt. The build
// page uses /suggest.

export interface IssueDto {
  topic: string;
  severity: "ERROR" | "WARNING" | "INFO";
  reason: string;
}

export interface CardSuggestionDto {
  card_name: string;
  category?: string;
  reason?: string;
  synergy_score?: number;
  // Links a suggestion back to an issue topic ("mana_curve", "removal_count", etc.)
  topic?: string;
}

export interface DeckAiResultDto {
  summary?: string;
  issues?: IssueDto[];
  suggestions?: CardSuggestionDto[];
}

/**
 * AI card recommendations for a deck. POST /ai/decks/{id}/suggest.
 *
 * Notes:
 * - Backend requires JWT (user, not anon). Anon decks will 401 — the build
 *   page surfaces "sign in to enable AI" in that case.
 * - Server-side cached per-deck until `audit.lastModified` changes, so
 *   repeated firings while editing are cheap until the next add/remove.
 * - `enabled` gate respects the user's "AI suggestions" toggle.
 */
export function useDeckAiSuggest(
  deckId: string | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["decks", "ai-suggest", deckId],
    queryFn: () =>
      api.deckBuilder<DeckAiResultDto>(`/ai/decks/${deckId}/suggest`, {
        method: "POST",
        // AI generation takes ~20–40s end-to-end (Claude streaming + tool
        // invocations + persistence). The default 15s axios timeout
        // (lib/api.ts) cuts in long before the backend finishes; bump to
        // 90s, comfortably above the backend's own 60s internal timeout.
        timeout: 90_000,
      }),
    enabled: !!deckId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * AI deck analysis — the "overall view" findings. POST /ai/decks/{id}/analyze.
 *
 * Same shape as suggest, but the backend's ANALYSIS prompt instructs the
 * model to call `reportIssues` (mana curve, removal density, color
 * balance, etc.) rather than `suggestCards`. The build page only enables
 * this when the deck has reached its format's target size, since running
 * a full review on a half-built deck is noisy and wastes tokens.
 */
export function useDeckAiAnalyze(
  deckId: string | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["decks", "ai-analyze", deckId],
    queryFn: () =>
      api.deckBuilder<DeckAiResultDto>(`/ai/decks/${deckId}/analyze`, {
        method: "POST",
        timeout: 90_000,
      }),
    enabled: !!deckId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}
