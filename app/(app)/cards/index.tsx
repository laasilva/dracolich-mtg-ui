// Cards search screen.
//
// Drives the result set from three inputs:
//   1. nav-header SearchBar's debounced query (lib/search → useSearchQuery)
//   2. local color-identity filter chips
//   3. local card-type filter chips
//
// Empty state (no query + no filters): shows the newest 10 cards as a
// "what's just landed" carousel.
//
// Card-press behavior is viewport-aware:
//   wide (≥768px) → opens the slide-in CardDetailPanel on the right
//   narrow         → opens the CardDetailSheet (bottom sheet) over the screen
// Both surfaces share CardDetailContent. Direct deep links to /cards/[id]
// still render the full-screen route.
//
// Exact-name match: when results collapse to exactly one card and its
// name matches the query exactly, opens the same surface as a tap would.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { CardCarousel } from "@/components/card-carousel";
import { CardDetailPanel } from "@/components/card-detail-panel";
import { CardDetailSheet } from "@/components/card-detail-sheet";
import { CardTile } from "@/components/card-tile";
import {
  ColorFilterChips,
  TypeFilterChips,
  toggleSetKey,
} from "@/components/filter-chips";
import { PageContent } from "@/components/page-content";
import { useNewestCards, useSearchCards, type CardDto } from "@/lib/queries/cards";
import { useSearchQuery } from "@/lib/search";

const WIDE_BREAKPOINT = 768;

export default function CardsSearchScreen() {
  const query = useSearchQuery();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= WIDE_BREAKPOINT;

  const [selectedColors, setSelectedColors] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    () => new Set()
  );
  // Active card for the wide-viewport side panel. Null = panel closed.
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const hasFilters = selectedColors.size > 0 || selectedTypes.size > 0;
  const hasInput = query.length > 0 || hasFilters;

  // Two query branches — newest-N when there's no input at all; filtered
  // search otherwise. Both go through TanStack Query so navigation between
  // states stays cache-warm.
  const newest = useNewestCards(10);
  const filtered = useSearchCards({
    name: query || undefined,
    colorIdentity:
      selectedColors.size > 0 ? Array.from(selectedColors) : undefined,
    types: selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
    size: 10,
  });
  const active = hasInput ? filtered : newest;
  const { data, isLoading, error, refetch, isRefetching } = active;

  // Single card-press handler. Both wide and narrow viewports drive the
  // same selectedCardId state — the difference is which presentation
  // (panel vs. sheet) mounts below.
  const openCard = useCallback((card: CardDto | { id: string }) => {
    setSelectedCardId(card.id);
  }, []);

  const closeDetail = useCallback(() => setSelectedCardId(null), []);

  // Exact-name auto-navigate. Same viewport split as a tap.
  useEffect(() => {
    if (!query || !data || data.totalElements !== 1) return;
    const only = data.content[0];
    if (only && only.name.toLowerCase() === query.toLowerCase().trim()) {
      openCard(only);
    }
    // openCard intentionally excluded — its identity churns with viewport
    // and we only want this to fire on new data/query, not on a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query]);

  const onToggleColor = (code: string) =>
    setSelectedColors((s) => toggleSetKey(s, code));
  const onToggleType = (t: string) =>
    setSelectedTypes((s) => toggleSetKey(s, t));

  const subtitle = useMemo(() => {
    if (query) return `Searching for "${query}"`;
    if (hasFilters) return "Filtered cards";
    return "Latest releases";
  }, [query, hasFilters]);

  // When the side panel is open on wide, pad the right side of the scroll
  // content so the results aren't hidden behind the panel.
  const SIDE_PANEL_WIDTH = 440;
  const scrollPaddingRight =
    isWide && selectedCardId ? SIDE_PANEL_WIDTH : 0;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingVertical: 24, paddingRight: scrollPaddingRight }}
        refreshing={isRefetching}
        onRefresh={refetch}
      >
        <PageContent>
          <View className="px-6">
            <Text className="mb-1 font-brand text-3xl text-accent">Cards</Text>
            <Text className="mb-4 text-muted">{subtitle}</Text>
          </View>

          {/* Filter chips — horizontal scroll, padded so they don't clip the
              screen edges. */}
          <View className="mb-3">
            <ColorFilterChips selected={selectedColors} onToggle={onToggleColor} />
          </View>
          <View className="mb-6">
            <TypeFilterChips selected={selectedTypes} onToggle={onToggleType} />
          </View>

          <View className="px-6">
            {isLoading && (
              <View className="items-center py-8">
                <ActivityIndicator size="large" color="#D4B25E" />
              </View>
            )}

            {error && (
              <View className="rounded-lg bg-danger/20 p-4">
                <Text className="font-semibold text-danger">Request failed</Text>
                <Text className="mt-1 text-foreground">
                  {(error as Error).message}
                </Text>
              </View>
            )}
          </View>

          {data && (
            <>
              <View className="mb-4 px-6">
                <Text className="text-sm text-muted">
                  {data.totalElements.toLocaleString()} cards · page{" "}
                  {data.number + 1} of {data.totalPages.toLocaleString()}
                </Text>
              </View>

              {data.content.length === 0 && (
                <View className="mx-6 rounded-lg border border-border bg-elevated p-4">
                  <Text className="text-foreground">No cards matched.</Text>
                </View>
              )}

              {data.content.length > 0 && (
                <>
                  {/* Carousel — tapping centered card opens detail */}
                  <CardCarousel
                    cards={data.content}
                    onCardPress={(card) => openCard(card)}
                  />

                  <View className="mt-8 px-6">
                    <Text className="mb-3 text-xs uppercase tracking-wider text-muted">
                      All results
                    </Text>
                    {data.content.map((card) => (
                      <CardTile
                        key={`list-${card.id}`}
                        card={card}
                        mode="list"
                        onPress={() => openCard(card)}
                      />
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </PageContent>
      </ScrollView>

      {/* Detail surface — viewport picks the presentation. Both are driven
          by selectedCardId; switching size unmounts one and mounts the
          other, but the underlying state survives. */}
      {isWide ? (
        <CardDetailPanel
          cardId={selectedCardId}
          onClose={closeDetail}
          width={SIDE_PANEL_WIDTH}
        />
      ) : (
        <CardDetailSheet cardId={selectedCardId} onClose={closeDetail} />
      )}
    </View>
  );
}
