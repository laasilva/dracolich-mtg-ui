// Deck build mode — wizard step 2.
//
// Two-pane layout (wide):
//   left  → debounced card search + AI suggestions
//   right → live deck contents (refetches after every add)
//
// Adds are click-to-add: tap any search result tile to add it to the deck.
// (Drag-and-drop coming in a follow-up; the click handler is exactly what
// the drop target would call.)
//
// Commander selection happens in the wizard step 1 page (/decks/new) and
// is baked into the deck at create time via the existing POST /decks/
// contract — so by the time the user lands here, the commander (if any
// the format needed) is already set. No separate "set commander"
// endpoint, no in-page picker.
//
// AI suggestions are gated behind a per-page toggle AND require the deck
// to have *some* content (a commander or at least one card). The backend
// AI service picks BUILD vs ANALYSIS based on whether a commander is set.

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";

import { DeckPileView, primaryType } from "@/components/deck-pile-view";
import { useHoverPreviewWithCleanup } from "@/components/hover-preview";
import { StackEditorSheet } from "@/components/stack-editor-sheet";
import {
  CARD_TYPES,
  Chip,
  MTG_COLORS,
  toggleSetKey,
} from "@/components/filter-chips";
import { PageContent } from "@/components/page-content";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/lib/dialogs";
import { showFeedback } from "@/lib/feedback";
import {
  useInfiniteSearchCards,
  type CardDto,
} from "@/lib/queries/cards";
import {
  useAddCardToDeck,
  useDeckAiAnalyze,
  useDeckAiSuggest,
  useDeckById,
  useDeleteDeck,
  useRemoveCardFromDeck,
  useUpdateCardCount,
  type CardSuggestionDto,
  type DeckCardDto,
  type DeckDto,
} from "@/lib/queries/decks";

const WIDE_BREAKPOINT = 768;
const PAGE_PADDING = 24;
const COLUMN_GAP = 28;
const SEARCH_DEBOUNCE_MS = 300;

const SEARCH_COL_MIN = 360;
const DECK_COL_MIN = 320;
const DECK_COL_MAX = 460;

function hasCommanderSet(deck?: DeckDto): boolean {
  return (deck?.commander?.length ?? 0) > 0;
}

// Per-card copy cap by format. Basics are unlimited everywhere; unknown
// formats don't enforce a cap on the client (the backend rules engine is
// still the source of truth — this just keeps the UI from offering an add
// that we know will be invalid).
function maxCopiesPerCard(format?: string, typeLine?: string): number {
  if (typeLine && typeLine.includes("Basic Land")) return Infinity;
  switch (format) {
    case "COMMANDER":
      return 1;
    case "STANDARD":
    case "MODERN":
    case "PIONEER":
    case "PAUPER":
      return 4;
    default:
      return Infinity;
  }
}

interface CardLimitInfo {
  current: number;
  max: number;
  atLimit: boolean;
}

// Format-aware "deck is complete" target. For Commander that's the exact
// 100; for 60-card formats it's the legal minimum. Returns null for
// formats we don't auto-analyze.
function targetDeckSize(format?: string): number | null {
  switch (format) {
    case "COMMANDER":
      return 100;
    case "STANDARD":
    case "MODERN":
    case "PIONEER":
    case "PAUPER":
      return 60;
    default:
      return null;
  }
}

function mainboardCount(deck?: DeckDto): number {
  let n = 0;
  for (const c of deck?.cards ?? []) {
    if (c.card_category == null || c.card_category === "MAINBOARD") {
      n += c.count ?? 1;
    }
  }
  return n;
}

function isDeckAtTarget(deck?: DeckDto): boolean {
  const target = targetDeckSize(deck?.format);
  if (target == null || !deck) return false;
  if (deck.format === "COMMANDER") {
    const commanderCount = (deck.commander ?? []).reduce(
      (s, c) => s + (c.count ?? 1),
      0
    );
    return commanderCount + mainboardCount(deck) >= target;
  }
  return mainboardCount(deck) >= target;
}

export default function DeckBuildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= WIDE_BREAKPOINT;

  const deckQuery = useDeckById(id);
  const addCard = useAddCardToDeck(id);
  const removeCard = useRemoveCardFromDeck(id);
  const updateCount = useUpdateCardCount(id);
  const deleteDeck = useDeleteDeck();

  const deck = deckQuery.data;
  // Ownership — backend already enforces it on the mutation, but hiding
  // the delete button when the viewer isn't the owner avoids a 403 round
  // trip and the matching "permission denied" toast.
  const isOwner = !!user && !!deck?.user_id && deck.user_id === user.userId;

  const handleDeleteDeck = useCallback(async () => {
    if (!deck) return;
    const ok = await confirmDialog({
      title: "Delete deck",
      message:
        deck.status === "DRAFT"
          ? `Delete the draft "${deck.name}"? This can't be undone.`
          : `Delete "${deck.name}"? This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    // Feedback flow: loading spinner → success check → auto-close.
    // The router.replace fires the moment the mutation succeeds, but the
    // success modal lingers a beat (1.2s) so the user sees the
    // confirmation before the screen swap.
    const feedback = showFeedback({
      kind: "loading",
      title: "Deleting deck…",
    });
    try {
      await deleteDeck.mutateAsync(deck.id);
      feedback.update({
        kind: "success",
        title: "Deck deleted",
        autoCloseMs: 1200,
      });
      router.replace("/account/decks" as any);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Couldn't delete this deck.";
      feedback.update({
        kind: "error",
        title: "Couldn't delete deck",
        message: msg,
      });
    }
  }, [deck, deleteDeck, router]);

  // ---- Search query (lifted so AI-suggestion taps can set it) ----
  // Filters and pagination state live inside SearchPanel — they're a
  // "search experience" concern, not a wider page concern. The parent
  // only owns the input string so the AI suggestion handler can drop
  // a card name into it.
  const [searchInput, setSearchInput] = useState("");

  // Mobile-only: opening a pile through the StackEditorSheet. Stores
  // just the title + selection predicate — the editor's cards array is
  // derived from the live deck on every render, so add/remove/count
  // mutations flow through without the editor seeing a stale snapshot.
  const [editorSelection, setEditorSelection] = useState<
    | { title: string; predicate: (c: DeckCardDto) => boolean }
    | null
  >(null);
  const [editorIndex, setEditorIndex] = useState(0);

  // ---- AI suggestions ----
  // Gate on having SOME content — ANALYSIS sessions need a deck list and
  // BUILD sessions need a commander; firing against a totally empty deck
  // just errors out on the backend.
  const [aiEnabled, setAiEnabled] = useState(false);
  const deckHasContent =
    (deck?.card_count ?? 0) > 0 || hasCommanderSet(deck);
  const aiSuggest = useDeckAiSuggest(id, aiEnabled && deckHasContent);

  // Findings ("overall review") come from /analyze, which we only auto-fire
  // when the deck has reached its format's target size. Running an analysis
  // on a half-built deck is noisy and burns ~30s of AI tokens for nothing.
  // The query stays enabled past the target so it refetches via the refresh
  // button or after edits invalidate the cache.
  const atTargetSize = useMemo(() => isDeckAtTarget(deck), [deck]);
  const aiAnalyze = useDeckAiAnalyze(
    id,
    aiEnabled && deckHasContent && atTargetSize
  );

  // Lower-cased card names currently in the deck (mainboard + commander)
  // — used to hide AI suggestions for cards the user has already added.
  // Compared by name because the AI's suggestion shape is name-only.
  const deckCardNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of deck?.cards ?? []) {
      if (c.name) names.add(c.name.toLowerCase());
    }
    for (const c of deck?.commander ?? []) {
      if (c.name) names.add(c.name.toLowerCase());
    }
    return names;
  }, [deck?.cards, deck?.commander]);

  // cardId → total copies already in the deck (mainboard + sideboard +
  // maybeboard + commander). Drives the per-format copy cap in the search
  // panel.
  const cardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (entries?: { card_id: string; count?: number }[]) => {
      for (const c of entries ?? []) {
        counts.set(c.card_id, (counts.get(c.card_id) ?? 0) + (c.count ?? 1));
      }
    };
    add(deck?.cards);
    add(deck?.commander);
    return counts;
  }, [deck?.cards, deck?.commander]);

  const getCardLimit = useCallback(
    (card: CardDto): CardLimitInfo => {
      const current = cardCounts.get(card.id) ?? 0;
      const max = maxCopiesPerCard(
        deck?.format,
        card.default_face?.full_type
      );
      return { current, max, atLimit: current >= max };
    },
    [cardCounts, deck?.format]
  );

  // ---- Column sizing ----
  const innerColumnWidth = useMemo(
    () => Math.min(viewportWidth, 1280) - PAGE_PADDING * 2,
    [viewportWidth]
  );
  const deckColumnWidth = isWide
    ? Math.max(
        DECK_COL_MIN,
        Math.min(DECK_COL_MAX, Math.round(innerColumnWidth * 0.38))
      )
    : innerColumnWidth;
  const searchColumnWidth = isWide
    ? Math.max(SEARCH_COL_MIN, innerColumnWidth - COLUMN_GAP - deckColumnWidth)
    : innerColumnWidth;

  // ---- Handlers ----
  const handleAddCard = useCallback(
    async (card: CardDto) => {
      // Backstop the disabled state in the UI: if the user double-clicks
      // a card right as it crosses the format cap, the second add would
      // otherwise race past the disable and hit the backend. Use the
      // same type-aware limit the tile uses — basic lands have no cap
      // even on Commander, so a typeline-blind check would block them.
      const limit = getCardLimit(card);
      if (limit.atLimit) return;
      try {
        // Always send card_category — the backend's count aggregator only
        // sums entries with a non-null category, so omitting it would
        // leave card_count stuck at zero. MAINBOARD is the default zone
        // when the user adds from the search panel.
        await addCard.mutateAsync({
          card_id: card.id,
          count: 1,
          card_category: "MAINBOARD",
        });
      } catch {
        // Error surfaces inline below via addCard.error
      }
    },
    [addCard, getCardLimit]
  );

  const handleRemoveCard = useCallback(
    async (cardId: string) => {
      if (!deck) return;
      // Find the card so the confirm message is human-readable. The
      // backend DELETE strips every entry with this cardId, so the prompt
      // owns up to "all N copies" when there's more than one.
      const entries = (deck.cards ?? []).filter(
        (c) => c.card_id === cardId
      );
      const inCommander = (deck.commander ?? []).some(
        (c) => c.card_id === cardId
      );
      if (entries.length === 0 && !inCommander) return;

      const name = entries[0]?.name ?? "this card";
      const totalCopies = entries.reduce((s, c) => s + (c.count ?? 1), 0);
      const message =
        totalCopies > 1
          ? `Remove all ${totalCopies} copies of ${name} from your deck?`
          : `Remove ${name} from your deck?`;

      const ok = await confirmDialog({
        title: "Remove card",
        message,
        confirmText: "Remove",
        destructive: true,
      });
      if (!ok) return;

      try {
        await removeCard.mutateAsync(cardId);
      } catch {
        // Error surfaces inline below via removeCard.error
      }
    },
    [deck, removeCard]
  );

  const handleSearchForSuggestion = useCallback((cardName: string) => {
    setSearchInput(cardName);
  }, []);

  // ---- Stack editor helpers ----
  //
  // The editor stores a selection *predicate* + title, not the cards
  // themselves. The cards are derived from the live deck on each render
  // so add/remove/count mutations flow into the open editor without
  // staleness.

  // Cards currently visible in the editor (post-filter, expanded by
  // count would inflate the list — we want one entry per unique card so
  // the user can adjust copies via the +/- buttons).
  const editorCards = useMemo<DeckCardDto[]>(() => {
    if (!editorSelection || !deck) return [];
    const all = [...(deck.commander ?? []), ...(deck.cards ?? [])];
    return all.filter(editorSelection.predicate);
  }, [editorSelection, deck]);

  // When the user taps Edit on a pile or a card in a pile, pin the
  // selection by category + primary type. Re-opening the same category
  // produces a stable predicate that survives deck mutations.
  const openTypePile = useCallback(
    (category: "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD", type: string, title: string) => {
      setEditorSelection({
        title,
        predicate: (c) => {
          const cat = c.card_category ?? "MAINBOARD";
          if (cat !== category) return false;
          return primaryType(c.type_line) === type;
        },
      });
      setEditorIndex(0);
    },
    []
  );

  // Edit-pile handler given to DeckPileView. We need to figure out from
  // the first card which (category, type) combination this pile maps to.
  // PileBoard passes the pluralized type as the title (e.g. "Creatures"),
  // and every card in the pile shares both category and primary type by
  // construction.
  const handleEditPile = useCallback(
    (pileCards: DeckCardDto[], _title: string) => {
      if (pileCards.length === 0) return;
      const first = pileCards[0];
      const category =
        (first.card_category as "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD") ??
        "MAINBOARD";
      const type = primaryType(first.type_line);
      openTypePile(category, type, _title);
    },
    [openTypePile]
  );

  // Open the editor focused on a specific card. We resolve its pile
  // from category + primary type, then position the editor at that
  // card's index within the resulting list.
  const handleCardTap = useCallback(
    (cardId: string) => {
      const all = [...(deck?.commander ?? []), ...(deck?.cards ?? [])];
      const tapped = all.find((c) => c.card_id === cardId);
      if (!tapped) return;
      const category =
        (tapped.card_category as "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD") ??
        "MAINBOARD";
      const type = primaryType(tapped.type_line);
      const pile = all.filter((c) => {
        const cat = c.card_category ?? "MAINBOARD";
        if (cat !== category) return false;
        return primaryType(c.type_line) === type;
      });
      const idx = pile.findIndex((c) => c.card_id === cardId);
      setEditorSelection({
        title: `${type}s`,
        predicate: (c) => {
          const cat = c.card_category ?? "MAINBOARD";
          if (cat !== category) return false;
          return primaryType(c.type_line) === type;
        },
      });
      setEditorIndex(Math.max(0, idx));
    },
    [deck]
  );

  const closeEditor = useCallback(() => {
    setEditorSelection(null);
    setEditorIndex(0);
  }, []);

  // Count adjuster — wraps useUpdateCardCount with the correct category
  // for the card being adjusted (matters when the same cardId exists in
  // both mainboard and sideboard).
  const handleChangeCount = useCallback(
    async (cardId: string, newCount: number) => {
      if (!deck) return;
      const all = [...(deck.cards ?? [])];
      const entry = all.find((c) => c.card_id === cardId);
      if (!entry) return;
      const category = (entry.card_category ??
        "MAINBOARD") as "MAINBOARD" | "SIDEBOARD" | "MAYBE_BOARD";
      try {
        await updateCount.mutateAsync({ cardId, count: newCount, category });
      } catch {
        // Surfaced via the mutation's error state
      }
    },
    [deck, updateCount]
  );

  // Quick remove (no confirm dialog) from inside the editor — the user
  // is already focused on a single card and the action button is
  // explicit, so the confirm step would be redundant friction. The
  // dialog stays on the build screen's tap-to-remove path for users
  // who skip the editor.
  const handleEditorRemove = useCallback(
    async (cardId: string) => {
      try {
        await removeCard.mutateAsync(cardId);
      } catch {
        // Surfaced via removeCard.error inline below
      }
    },
    [removeCard]
  );

  return (
    // Outer flex container holds the page chrome + the optional preview
    // sheet as siblings. Without this wrapper the BottomSheet would mount
    // inside the KeyboardAvoidingView and inherit its padding behavior.
    <View style={{ flex: 1 }}>
    {/* KeyboardAvoidingView wraps the build step so the card-search input
        stays visible above the on-screen keyboard on mobile. */}
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <PageContent style={{ padding: PAGE_PADDING }}>
          {/* ---- Top bar ---- */}
          <View className="mb-5 flex-row items-center" style={{ gap: 12 }}>
            <Pressable
              onPress={() => router.back()}
              className="rounded-md px-2 py-1 hover:bg-elevated active:bg-elevated"
            >
              <Text className="text-sm text-accent">← Back</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text className="text-xs uppercase tracking-wider text-muted">
                Building
              </Text>
              <Text
                className="font-brand text-xl text-foreground"
                numberOfLines={1}
              >
                {deck?.name ?? "..."}
              </Text>
            </View>

            {isOwner && (
              <Pressable
                onPress={deleteDeck.isPending ? undefined : handleDeleteDeck}
                disabled={deleteDeck.isPending}
                accessibilityLabel="Delete deck"
                className="rounded-md border border-danger/40 px-3 py-2 hover:bg-danger/10 active:bg-danger/20"
                style={{ opacity: deleteDeck.isPending ? 0.5 : 1 }}
              >
                {deleteDeck.isPending ? (
                  <ActivityIndicator size="small" color="#D14B3D" />
                ) : (
                  <Ionicons name="trash-outline" size={16} color="#D14B3D" />
                )}
              </Pressable>
            )}

            <Pressable
              onPress={() => router.push(`/decks/${id}/review` as any)}
              className="rounded-md bg-accent px-4 py-2 hover:bg-accent/90 active:bg-accent/80"
            >
              <Text className="font-semibold text-background">Review</Text>
            </Pressable>
          </View>

          {/* ---- Loading state ---- */}
          {deckQuery.isLoading && !deck && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color="#D4B25E" />
            </View>
          )}

          {/* ---- Error state ---- */}
          {deckQuery.error && !deck && (
            <View className="rounded-lg bg-danger/20 p-4">
              <Text className="font-semibold text-danger">
                Couldn&apos;t load deck
              </Text>
              <Text className="mt-1 text-foreground">
                {(deckQuery.error as Error).message}
              </Text>
            </View>
          )}

          {/* ---- Build flow ---- */}
          {deck && (
            <View
              style={{
                flexDirection: isWide ? "row" : "column",
                gap: COLUMN_GAP,
                alignItems: "flex-start",
              }}
            >
              <View style={{ width: searchColumnWidth }}>
                <SearchPanel
                  query={searchInput}
                  onQueryChange={setSearchInput}
                  onAddCard={handleAddCard}
                  addingId={
                    addCard.isPending
                      ? addCard.variables?.card_id ?? null
                      : null
                  }
                  getCardLimit={getCardLimit}
                  containerWidth={searchColumnWidth}
                />

                <View className="mt-8">
                  <AiSuggestionsPanel
                    enabled={aiEnabled}
                    onToggle={setAiEnabled}
                    suggestQuery={aiSuggest}
                    analyzeQuery={aiAnalyze}
                    atTargetSize={atTargetSize}
                    targetSize={targetDeckSize(deck.format)}
                    onSuggestionPress={handleSearchForSuggestion}
                    onRefresh={() => {
                      aiSuggest.refetch();
                      // Only kick analyze if the deck is at target — otherwise
                      // refetch on a disabled query just no-ops, but firing
                      // refetch() against a disabled query in v5 still hits the
                      // network. Guard it.
                      if (atTargetSize) aiAnalyze.refetch();
                    }}
                    deckHasContent={deckHasContent}
                    hiddenNames={deckCardNames}
                  />
                </View>
              </View>

              <View style={{ width: deckColumnWidth }}>
                <CurrentDeckPanel
                  deck={deck}
                  isLoading={deckQuery.isLoading}
                  containerWidth={deckColumnWidth}
                  // Mobile: tap opens the stack editor at that card's
                  // index. Wide: tap stays as the existing confirm-then-
                  // remove fast path (hover preview already lets the
                  // user see the card before tapping).
                  onCardPress={isWide ? handleRemoveCard : handleCardTap}
                  // Edit button on each pile header — surfaced only on
                  // mobile, since web has hover previews that cover the
                  // "what's in this pile?" question without a dedicated
                  // editor.
                  onEditPile={isWide ? undefined : handleEditPile}
                />
              </View>
            </View>
          )}

          {addCard.error && (
            <View className="mt-4 rounded-lg bg-danger/20 p-3">
              <Text className="text-sm text-danger">
                Couldn&apos;t add card: {(addCard.error as Error).message}
              </Text>
            </View>
          )}

          {removeCard.error && (
            <View className="mt-4 rounded-lg bg-danger/20 p-3">
              <Text className="text-sm text-danger">
                Couldn&apos;t remove card: {(removeCard.error as Error).message}
              </Text>
            </View>
          )}
        </PageContent>
      </ScrollView>
    </KeyboardAvoidingView>

    {/* Mobile-only stack editor. Tap an Edit button on a pile header
        (or tap any single card in the pile) → opens the swipe carousel
        positioned at the tapped card. From here the user can scroll
        through the pile, see each card full-size, adjust copies, or
        remove the active card. Web users get the existing hover preview
        + tap-to-remove fast path; the editor isn't surfaced there. */}
    {!isWide && (
      <StackEditorSheet
        pile={
          editorSelection
            ? { title: editorSelection.title, cards: editorCards }
            : null
        }
        initialIndex={editorIndex}
        format={deck?.format}
        onClose={closeEditor}
        onChangeCount={handleChangeCount}
        onRemoveCard={handleEditorRemove}
        busy={updateCount.isPending || removeCard.isPending}
      />
    )}
    </View>
  );
}

// ---------- Search panel ----------
//
// Self-contained: owns filter state + pagination internally. Parent only
// hands in the input string (lifted so AI suggestions can write to it)
// and the add-card callback.
//
// Pagination: explicit Prev/Next + "Page X of Y" since infinite scroll
// is awkward in a side-panel-style column and steals focus from the
// rest of the page.

// Card grid layout — single row per page, sized so the cards are
// readable. Previously we rendered 20 cards in a flex-wrap, which
// produced 6+ rows of tiny tiles. Now each page is one row of N cards
// fitting the container exactly:
//   <400px (phone)         → 2 columns
//   400-700px (tablet/web) → 3 columns
//   ≥700px (wide web)      → 4 columns
// Per-tile press-and-hold zoom (in CardSelectTile) makes the smaller
// resting size acceptable — users hold to inspect, tap to add.
const CARD_GAP = 12;

function cardsPerRow(containerWidth: number): number {
  if (containerWidth >= 700) return 4;
  if (containerWidth >= 400) return 3;
  return 2;
}

function SearchPanel({
  query,
  onQueryChange,
  onAddCard,
  addingId,
  getCardLimit,
  containerWidth,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onAddCard: (card: CardDto) => void;
  addingId: string | null;
  getCardLimit: (card: CardDto) => CardLimitInfo;
  containerWidth: number;
}) {
  // Debounce the input → query that actually hits the API.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedQuery(query.trim()),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(t);
  }, [query]);

  // Filter state.
  const [selectedColors, setSelectedColors] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    () => new Set()
  );

  const hasInput =
    debouncedQuery.length > 0 ||
    selectedColors.size > 0 ||
    selectedTypes.size > 0;

  // Column count drives card *width* — how many cards fit visibly across
  // the row. It no longer caps the page size; the user scrolls
  // horizontally to reveal more (see the infinite-scroll fetch below).
  const perRow = useMemo(() => cardsPerRow(containerWidth), [containerWidth]);
  const cardWidth = useMemo(
    () => Math.floor((containerWidth - CARD_GAP * (perRow - 1)) / perRow),
    [containerWidth, perRow]
  );

  // Infinite scroll: TanStack accumulates pages from /cards/search.
  // FlatList's `onEndReached` calls `fetchNextPage()` when the user
  // approaches the right edge. Page size is server-tuned at 20 — chunky
  // enough that we're not refetching every couple of swipes, small
  // enough that the first page hydrates fast.
  const search = useInfiniteSearchCards({
    name: debouncedQuery.length > 0 ? debouncedQuery : undefined,
    colorIdentity:
      selectedColors.size > 0 ? Array.from(selectedColors) : undefined,
    types: selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
    sort: hasInput ? undefined : "first_release_date,desc",
    size: 20,
  });

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = search;

  // Flatten all loaded pages into one card list for the FlatList.
  const cards = useMemo(
    () => data?.pages.flatMap((p) => p.content) ?? [],
    [data]
  );
  const totalCount = data?.pages[0]?.totalElements ?? 0;

  const onToggleColor = (code: string) =>
    setSelectedColors((s) => toggleSetKey(s, code));
  const onToggleType = (t: string) =>
    setSelectedTypes((s) => toggleSetKey(s, t));

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <View>
      <View className="mb-3 flex-row items-baseline justify-between">
        <Text className="text-xs uppercase tracking-wider text-muted">
          Find cards
        </Text>
        <Text className="text-[11px] text-muted">Tap a card to add</Text>
      </View>

      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder="Search by name…"
      />

      {/* Filters — color identity + card type. Horizontal scroll so they
          don't wrap awkwardly in a narrow column. */}
      <View className="mt-3" style={{ gap: 6 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {MTG_COLORS.map((c) => (
            <Chip
              key={c.code}
              label={c.label}
              swatchColor={c.color}
              selected={selectedColors.has(c.code)}
              onPress={() => onToggleColor(c.code)}
            />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {CARD_TYPES.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={selectedTypes.has(t)}
              onPress={() => onToggleType(t)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Result count — pages no longer apply (infinite scroll), so the
          "Page X of Y" indicator goes away. Total still useful as a
          sanity check on filter narrowness. */}
      {data && (
        <View className="mt-3 flex-row items-center">
          <Text className="text-[11px] text-muted">
            {totalCount.toLocaleString()} card{totalCount === 1 ? "" : "s"}
            {hasInput ? " match" : ""}
          </Text>
        </View>
      )}

      {isLoading && (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#D4B25E" />
        </View>
      )}

      {error && (
        <View className="mt-3 rounded-lg bg-danger/20 p-3">
          <Text className="text-sm text-danger">{(error as Error).message}</Text>
        </View>
      )}

      {!isLoading && !error && cards.length === 0 && hasInput && (
        <View className="mt-4 rounded-lg border border-border bg-elevated p-3">
          <Text className="text-sm text-muted">No cards matched.</Text>
        </View>
      )}

      {cards.length > 0 && (
        // Horizontal infinite scroll — replaces the old Prev/Next pagination.
        // FlatList virtualizes off-screen items and fires `onEndReached`
        // when the user nears the right edge, where we fetchNextPage.
        // `snapToInterval = cardWidth + gap` gives a soft snap so the row
        // settles on whole-card boundaries rather than mid-card.
        <FlatList
          horizontal
          data={cards}
          keyExtractor={(card) => card.id}
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 16 }}
          contentContainerStyle={{ gap: CARD_GAP, paddingRight: CARD_GAP }}
          snapToInterval={cardWidth + CARD_GAP}
          decelerationRate="fast"
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          renderItem={({ item: card }) => {
            const limit = getCardLimit(card);
            return (
              <CardSelectTile
                card={card}
                width={cardWidth}
                onPress={() => onAddCard(card)}
                loading={addingId === card.id}
                limit={limit}
              />
            );
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View
                style={{
                  width: cardWidth,
                  aspectRatio: CARD_ASPECT,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator size="small" color="#D4B25E" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// Shared input + tile components ----------

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View
      className="flex-row items-center rounded-full border border-border bg-elevated"
      style={{ paddingHorizontal: 14, height: 44 }}
    >
      <Ionicons
        name="search"
        size={18}
        color={value ? "#D4B25E" : "#9A9AA8"}
      />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9A9AA8"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{
          flex: 1,
          marginLeft: 10,
          color: "#E8E6E3",
          fontSize: 15,
          paddingVertical: 0,
          ...(Platform.OS === "web"
            ? ({ outlineStyle: "none" } as object)
            : {}),
        }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={18} color="#9A9AA8" />
        </Pressable>
      )}
    </View>
  );
}

// MTG card aspect (63 × 88 mm).
const CARD_ASPECT = 63 / 88;

function CardSelectTile({
  card,
  width,
  onPress,
  loading,
  limit,
}: {
  card: CardDto;
  width: number;
  onPress: () => void;
  loading: boolean;
  limit: CardLimitInfo;
}) {
  // Cards at the format's copy cap are visibly disabled — no press, dim
  // tile, and a "×N" badge instead of the gold "+". Cards under the cap
  // but already in the deck (e.g. 2/4 in Standard) still show "+" but
  // also carry a small count chip so the user knows where they stand.
  const disabled = loading || limit.atLimit;
  const hover = useHoverPreviewWithCleanup();

  // Search results carry the full CardDto, so we can pull the largest art
  // available and the most relevant preview metadata directly.
  const imageUri =
    card.default_art?.image_uris?.normal ??
    card.default_art?.image_uris?.large ??
    card.default_art?.image_uris?.small;
  const previewUri =
    card.default_art?.image_uris?.large ??
    card.default_art?.image_uris?.normal ??
    card.default_art?.image_uris?.png ??
    card.default_art?.image_uris?.small;

  const accent = colorIdentityAccent(
    card.default_face?.gameplay_property?.color_identity
  );

  // Press-and-hold zoom (mobile). On web the existing hover preview
  // covers this need, so we skip the modal there. We track whether a
  // long-press fired so the trailing onPress can decide whether to
  // ignore the tap (avoid adding a card after a zoom inspection).
  const [zoomed, setZoomed] = useState(false);
  const longPressedRef = useRef(false);

  // Web hover preview anchor — we measure the tile on hover so the
  // floating preview can sit next to it rather than always pinning
  // top-right. View.measureInWindow returns viewport-relative coords,
  // which is what HoverPreview's `position: fixed` styling expects.
  const wrapperRef = useRef<View>(null);

  const handleLongPress = () => {
    longPressedRef.current = true;
    if (Platform.OS !== "web") setZoomed(true);
  };

  const handlePressOut = () => {
    if (zoomed) setZoomed(false);
    // Don't reset longPressedRef here — onPress fires AFTER onPressOut,
    // and we need the flag intact so onPress knows to skip.
  };

  const handlePress = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (!disabled) onPress();
  };

  const handleHoverIn = () => {
    const payload = {
      id: card.id,
      name: card.name,
      imageUri: previewUri,
      manaCost: card.default_face?.gameplay_property?.mana_cost,
      typeLine: card.default_face?.full_type,
      colors: card.default_face?.gameplay_property?.color_identity,
    };
    // measureInWindow is async-by-callback — show with no anchor first
    // so the preview pops without waiting on the layout round trip, then
    // re-show with the anchor as soon as we have it. The double call is
    // harmless: state replace, same card id, no re-image-fetch.
    wrapperRef.current?.measureInWindow((x, y, w, h) => {
      hover.show(payload, { x, y, width: w, height: h });
    });
  };

  return (
    <Pressable
      ref={wrapperRef as any}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressOut={handlePressOut}
      delayLongPress={350}
      // Web hover preview — Pressable's onHoverIn/onHoverOut only fire on
      // RN-Web. The single Pressable now owns every gesture so the press
      // handlers don't get swallowed by a nested Pressable (the previous
      // CardTile wrap had that bug on native).
      onHoverIn={handleHoverIn}
      onHoverOut={hover.hide}
      style={{
        width,
        opacity: limit.atLimit ? 0.45 : 1,
      }}
    >
      <View style={{ position: "relative" }}>
        {/* Card art tile — inlined here instead of going through
            CardTile so the press gesture stays on the outer Pressable.
            Nested Pressables swallow taps on iOS. */}
        <View
          style={{
            aspectRatio: CARD_ASPECT,
            borderWidth: 2,
            borderColor: accent,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: "#14111E",
          }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ flex: 1 }}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : (
            <View className="flex-1 items-center justify-center p-3">
              <Text
                className="text-center font-brand text-sm text-foreground"
                numberOfLines={3}
              >
                {card.name}
              </Text>
            </View>
          )}
        </View>

        {/* Top-right action / status badge. pointer-events: none so taps
            still register on the underlying card press target. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 30,
            height: 30,
            paddingHorizontal: limit.atLimit ? 8 : 0,
            borderRadius: 15,
            backgroundColor: limit.atLimit
              ? "rgba(42,42,51,0.95)"
              : "rgba(212,178,94,0.95)",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.5,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#0F0F12" />
          ) : limit.atLimit ? (
            <Text className="text-xs font-bold text-foreground">
              ×{limit.current}
            </Text>
          ) : (
            <Ionicons name="add" size={20} color="#0F0F12" />
          )}
        </View>

        {/* Secondary count chip for "in deck but under the cap" — e.g.
            2/4 of a Standard card. Skipped when at-limit (the ×N badge
            already covers it) or when the card isn't in the deck yet. */}
        {!limit.atLimit && limit.current > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 6,
              left: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: "rgba(15,15,18,0.85)",
              borderWidth: 1,
              borderColor: "rgba(212,178,94,0.5)",
            }}
          >
            <Text className="text-[10px] font-semibold text-accent">
              {limit.current}
              {Number.isFinite(limit.max) ? `/${limit.max}` : ""} in deck
            </Text>
          </View>
        )}
      </View>

      {/* Press-and-hold zoom overlay — mobile only. Renders the largest
          available art at ~78% screen width with a dimmed backdrop. The
          Modal dismisses on press-out via state; the backdrop is also
          tap-to-dismiss as a fallback in case onPressOut is missed. */}
      <Modal
        transparent
        visible={zoomed}
        animationType="fade"
        onRequestClose={() => setZoomed(false)}
      >
        <Pressable
          onPress={() => setZoomed(false)}
          className="flex-1 items-center justify-center bg-background/90"
        >
          <View
            style={{
              width: "78%",
              maxWidth: 360,
              aspectRatio: CARD_ASPECT,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: accent,
              backgroundColor: "#14111E",
              shadowColor: "#000",
              shadowOpacity: 0.55,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
            }}
          >
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={{ flex: 1 }}
                contentFit="cover"
                transition={100}
                cachePolicy="memory-disk"
              />
            ) : (
              <View className="flex-1 items-center justify-center p-6">
                <Text
                  className="text-center font-brand text-2xl text-foreground"
                  numberOfLines={3}
                >
                  {card.name}
                </Text>
              </View>
            )}
          </View>
          <Text
            className="mt-4 text-center text-xs uppercase tracking-wider text-muted"
            style={{ opacity: 0.7 }}
          >
            Release to dismiss
          </Text>
        </Pressable>
      </Modal>
    </Pressable>
  );
}

function colorIdentityAccent(colors?: string[]): string {
  if (!colors || colors.length === 0) return "#2A2A33";
  if (colors.length > 1) return "#D4B25E";
  switch (colors[0]) {
    case "W":
      return "#F8F6E8";
    case "U":
      return "#5C9EE5";
    case "B":
      return "#2D2A30";
    case "R":
      return "#D14B3D";
    case "G":
      return "#5BA66B";
    default:
      return "#2A2A33";
  }
}

// ---------- AI suggestions panel ----------

function AiSuggestionsPanel({
  enabled,
  onToggle,
  suggestQuery,
  analyzeQuery,
  atTargetSize,
  targetSize,
  onSuggestionPress,
  onRefresh,
  deckHasContent,
  hiddenNames,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  suggestQuery: ReturnType<typeof useDeckAiSuggest>;
  analyzeQuery: ReturnType<typeof useDeckAiAnalyze>;
  // Whether the deck has reached the format's target size. Drives the
  // "auto-fire analyze" gate and the placeholder copy in the findings
  // section when we haven't run an analysis yet.
  atTargetSize: boolean;
  // The numeric target (100 for Commander, 60 for 60-card formats). Null
  // for unsupported formats — findings section is hidden in that case.
  targetSize: number | null;
  onSuggestionPress: (cardName: string) => void;
  onRefresh: () => void;
  deckHasContent: boolean;
  // Lower-cased names already in the deck — filtered out of the rendered
  // suggestion list so freshly-added cards disappear from the panel.
  hiddenNames: Set<string>;
}) {
  const { data: suggestData, isLoading: suggestLoading, isFetching: suggestFetching, error: suggestError } = suggestQuery;
  const { data: analyzeData, isFetching: analyzeFetching, error: analyzeError } = analyzeQuery;
  const unauthorized = suggestError instanceof ApiError && suggestError.status === 401;

  const allSuggestions = suggestData?.suggestions ?? [];
  const visibleSuggestions = useMemo(
    () =>
      allSuggestions.filter(
        (s) => !hiddenNames.has(s.card_name.toLowerCase())
      ),
    [allSuggestions, hiddenNames]
  );
  const allHidden =
    allSuggestions.length > 0 && visibleSuggestions.length === 0;

  // Refresh button toggles both queries. "Refreshing" means either is in
  // flight, so the spinner reflects the slowest call.
  const showRefresh = enabled && deckHasContent && !unauthorized;
  const refreshing = suggestFetching || analyzeFetching;

  const findings = analyzeData?.issues ?? [];

  return (
    <View>
      <View
        className="flex-row items-center justify-between"
        style={{ gap: 8 }}
      >
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Ionicons name="sparkles" size={16} color="#D4B25E" />
          <Text className="text-xs uppercase tracking-wider text-accent">
            AI suggestions
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          {showRefresh && (
            <Pressable
              onPress={refreshing ? undefined : onRefresh}
              disabled={refreshing}
              accessibilityLabel="Refresh AI suggestions"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: refreshing
                  ? "rgba(212,178,94,0.10)"
                  : "rgba(212,178,94,0.18)",
              }}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#D4B25E" />
              ) : (
                <Ionicons name="refresh" size={15} color="#D4B25E" />
              )}
            </Pressable>
          )}
          <ToggleSwitch value={enabled} onChange={onToggle} />
        </View>
      </View>

      {!enabled && (
        <Text className="mt-2 text-xs text-muted">
          Turn on to get AI recommendations based on what&apos;s already in
          your deck.
        </Text>
      )}

      {enabled && !deckHasContent && (
        <Text className="mt-3 text-sm text-muted">
          Add a few cards first — the AI needs something to riff on.
        </Text>
      )}

      {enabled && deckHasContent && suggestLoading && (
        <View className="mt-3 items-center py-4">
          <ActivityIndicator size="small" color="#D4B25E" />
          <Text className="mt-2 text-xs text-muted">
            Thinking… this can take a few seconds.
          </Text>
        </View>
      )}

      {enabled && unauthorized && (
        <View className="mt-3 rounded-lg border border-border bg-elevated p-3">
          <Text className="text-sm text-foreground">
            Sign in to enable AI suggestions on your deck.
          </Text>
        </View>
      )}

      {enabled && suggestError && !unauthorized && (
        <View className="mt-3 rounded-lg bg-danger/20 p-3">
          <Text className="text-sm text-danger">
            {(suggestError as Error).message}
          </Text>
        </View>
      )}

      {enabled && suggestData?.summary && (
        <View className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-3">
          <Text className="text-sm text-foreground">{suggestData.summary}</Text>
        </View>
      )}

      {enabled && visibleSuggestions.length > 0 && (
        <View className="mt-4" style={{ gap: 8 }}>
          {visibleSuggestions.map((s, i) => (
            <SuggestionRow
              key={`${s.card_name}-${i}`}
              suggestion={s}
              onSearch={() => onSuggestionPress(s.card_name)}
            />
          ))}
        </View>
      )}

      {enabled && allHidden && !refreshing && (
        <View className="mt-4 rounded-lg border border-border bg-elevated p-3">
          <Text className="text-sm text-foreground">
            All suggestions added.
          </Text>
          <Text className="mt-1 text-xs text-muted">
            Tap refresh for a fresh batch.
          </Text>
        </View>
      )}

      {/* Footer pill — surfaces the deep-review feature without making it
          look like a gate on suggestions. Suggestions render above and
          update continuously as the user builds; the full Findings card
          only appears once the deck hits target size. */}
      {enabled && deckHasContent && targetSize != null && !atTargetSize && (
        <View className="mt-4 flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="information-circle-outline" size={14} color="#A39F93" />
          <Text className="text-[11px] text-muted">
            Full deck review unlocks at {targetSize} cards.
          </Text>
        </View>
      )}

      {/* Findings — overall analysis. Only rendered once the deck is at
          target size; before that, a tiny hint footer (above) tells the
          user the feature exists without competing with the live
          suggestions list. */}
      {enabled && deckHasContent && atTargetSize && targetSize != null && (
        <View className="mt-6">
          <View
            className="mb-2 flex-row items-baseline justify-between"
            style={{ gap: 8 }}
          >
            <Text className="text-[11px] uppercase tracking-wider text-muted">
              Findings
            </Text>
            {analyzeData?.summary && (
              <Text className="text-[10px] text-muted">Overall review</Text>
            )}
          </View>

          {analyzeFetching && !analyzeData && (
            <View className="items-center py-4">
              <ActivityIndicator size="small" color="#D4B25E" />
              <Text className="mt-2 text-xs text-muted">
                Reviewing your deck…
              </Text>
            </View>
          )}

          {analyzeError && (
            <View className="rounded-lg bg-danger/20 p-3">
              <Text className="text-sm text-danger">
                {(analyzeError as Error).message}
              </Text>
            </View>
          )}

          {analyzeData?.summary && (
            <View className="mb-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
              <Text className="text-sm text-foreground">
                {analyzeData.summary}
              </Text>
            </View>
          )}

          {findings.length > 0 && (
            <View>
              {findings.map((issue, i) => (
                <IssueRow key={`${issue.topic}-${i}`} issue={issue} />
              ))}
            </View>
          )}

          {!analyzeFetching &&
            !analyzeError &&
            analyzeData &&
            findings.length === 0 && (
              <View className="rounded-lg border border-border bg-elevated p-3">
                <Text className="text-sm text-foreground">
                  No issues spotted. Looks solid.
                </Text>
              </View>
            )}
        </View>
      )}
    </View>
  );
}

function SuggestionRow({
  suggestion,
  onSearch,
}: {
  suggestion: CardSuggestionDto;
  onSearch: () => void;
}) {
  return (
    <Pressable
      onPress={onSearch}
      className="rounded-lg border border-border bg-elevated p-3 hover:bg-border/30 active:bg-border/30"
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 font-semibold text-foreground">
          {suggestion.card_name}
        </Text>
        {suggestion.synergy_score != null && (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: "rgba(212,178,94,0.18)",
            }}
          >
            <Text className="text-[10px] font-semibold text-accent">
              {suggestion.synergy_score}
            </Text>
          </View>
        )}
      </View>
      {suggestion.reason && (
        <Text className="mt-1 text-xs leading-4 text-muted">
          {suggestion.reason}
        </Text>
      )}
    </Pressable>
  );
}

function IssueRow({
  issue,
}: {
  issue: { topic: string; severity: string; reason: string };
}) {
  const sev = issue.severity;
  const tint =
    sev === "ERROR"
      ? "bg-danger/20 border-danger/40"
      : sev === "WARNING"
        ? "bg-accent/15 border-accent/40"
        : "bg-elevated border-border";
  const dotColor =
    sev === "ERROR" ? "#D14B3D" : sev === "WARNING" ? "#D4B25E" : "#9A9AA8";
  return (
    <View className={`mt-2 rounded-lg border p-3 ${tint}`}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <View
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }}
        />
        <Text className="text-xs uppercase tracking-wider text-foreground">
          {issue.topic.replace(/_/g, " ")}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-foreground">{issue.reason}</Text>
    </View>
  );
}

function ToggleSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        backgroundColor: value ? "#D4B25E" : "#2A2A33",
        padding: 2,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: value ? "#0F0F12" : "#9A9AA8",
          alignSelf: value ? "flex-end" : "flex-start",
        }}
      />
    </Pressable>
  );
}

// ---------- Current deck panel ----------

function CurrentDeckPanel({
  deck,
  isLoading,
  containerWidth,
  onCardPress,
  onEditPile,
}: {
  deck: DeckDto;
  isLoading: boolean;
  containerWidth: number;
  // What happens when the user taps a card in the pile. On wide
  // viewports the parent passes the remove handler directly (tap =
  // confirm-then-remove). On mobile, the parent passes a function that
  // opens the stack editor positioned at the tapped card.
  onCardPress: (cardId: string) => void;
  // Per-pile Edit button handler. Mobile-only. Omit to hide the buttons.
  onEditPile?: (cards: DeckCardDto[], title: string) => void;
}) {
  // Compute the count directly from the cards array. The server-side
  // card_count goes stale when entries land with a null cardCategory
  // (which happened on every add before we started sending MAINBOARD),
  // so deriving locally is both faster and more reliable.
  const totalCount = useMemo(() => {
    let total = 0;
    for (const c of deck.cards ?? []) total += c.count ?? 1;
    for (const c of deck.commander ?? []) total += c.count ?? 1;
    return total;
  }, [deck.cards, deck.commander]);

  const isEmpty = totalCount === 0;

  return (
    <View
      className="rounded-xl border border-border"
      style={{ backgroundColor: "#15151A", padding: 16 }}
    >
      <View className="mb-3 flex-row items-baseline justify-between">
        <Text className="text-xs uppercase tracking-wider text-muted">
          Your deck
        </Text>
        <Text className="text-xs text-accent">
          {totalCount} card{totalCount === 1 ? "" : "s"}
        </Text>
      </View>

      {isLoading && (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#D4B25E" />
        </View>
      )}

      {isEmpty && (
        <View className="rounded-lg bg-elevated p-3">
          <Text className="text-sm text-muted">
            Tap a card on the left to add it to your deck.
          </Text>
        </View>
      )}

      {!isEmpty && (
        <DeckPileView
          deck={deck}
          containerWidth={containerWidth - 32}
          onCardPress={onCardPress}
          onEditPile={onEditPile}
        />
      )}
    </View>
  );
}
