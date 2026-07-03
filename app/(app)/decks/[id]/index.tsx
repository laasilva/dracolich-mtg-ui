// Deck detail page.
//
// Layout:
//   wide (≥768px): hero header on top, body splits into a 2-column grid —
//     deck contents on the left, stats panel on the right. Stats column
//     stays a usable size (min 360px, capped at 480px). Tap a card →
//     opens the side panel.
//   narrow:        single column — header → contents → stats — and the
//     card detail opens as a bottom sheet.
//
// Layout architecture:
//   outer <View flex-1>            ← full-bleed (panel can reach viewport edge)
//     <ScrollView>
//       <PageContent>              ← constrained to 1280px on web
//         hero header, columns
//       </PageContent>
//     </ScrollView>
//     CardDetailPanel/Sheet        ← rendered at root, full viewport

import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { CardDetailPanel } from "@/components/card-detail-panel";
import { CardDetailSheet } from "@/components/card-detail-sheet";
import { DeckContents } from "@/components/deck-contents";
import { DeckHeader } from "@/components/deck-header";
import { DeckStatsPanel } from "@/components/deck-stats-panel";
import {
  PageContent,
  WEB_MAX_CONTENT_WIDTH,
} from "@/components/page-content";
import { useDeckById, useDeckStats } from "@/lib/queries/decks";

const WIDE_BREAKPOINT = 768;
const SIDE_PANEL_WIDTH = 440;
const PAGE_PADDING = 24;
const COLUMN_GAP = 32;

// Stats column sizing — clamped to a usable range. Big enough that the
// mana curve bars don't get crushed, small enough that the cards still
// dominate the page.
const STATS_COLUMN_MIN = 360;
const STATS_COLUMN_MAX = 480;

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= WIDE_BREAKPOINT;

  const deckQuery = useDeckById(id);
  const statsQuery = useDeckStats(id);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const openCard = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
  }, []);
  const closeCard = useCallback(() => setSelectedCardId(null), []);

  // Effective inner column width = capped viewport - paddings. Used to
  // budget the cards/stats split.
  const constrainedViewportWidth = Math.min(viewportWidth, WEB_MAX_CONTENT_WIDTH);
  const innerColumnWidth = constrainedViewportWidth - PAGE_PADDING * 2;
  // Stats column: ~40% of inner, clamped to [MIN, MAX].
  const statsColumnWidth = isWide
    ? Math.max(
        STATS_COLUMN_MIN,
        Math.min(STATS_COLUMN_MAX, Math.round(innerColumnWidth * 0.4))
      )
    : innerColumnWidth;
  const contentsColumnWidth = isWide
    ? innerColumnWidth - COLUMN_GAP - statsColumnWidth
    : innerColumnWidth;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 64 }}
      >
        <PageContent
          style={{ paddingHorizontal: PAGE_PADDING, paddingTop: PAGE_PADDING }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="self-start rounded-md px-2 py-1 hover:bg-elevated active:bg-elevated"
            >
              <Text className="text-sm text-accent">← Back</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/decks/${id}/build` as any)}
              className="flex-row items-center rounded-md border border-accent px-3 py-1.5 hover:bg-accent/15 active:bg-accent/20"
              style={{ gap: 6 }}
            >
              <Text className="text-sm text-accent">Edit deck</Text>
            </Pressable>
          </View>

          {deckQuery.isLoading && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color="#D4B25E" />
            </View>
          )}

          {deckQuery.error && (
            <View className="rounded-lg bg-danger/20 p-4">
              <Text className="font-semibold text-danger">Failed to load deck</Text>
              <Text className="mt-1 text-foreground">
                {(deckQuery.error as Error).message}
              </Text>
            </View>
          )}

          {deckQuery.data && (
            <>
              <DeckHeader deck={deckQuery.data} />

              {/* Body: 2 columns on wide, stacked on narrow. */}
              <View
                style={{
                  marginTop: 24,
                  flexDirection: isWide ? "row" : "column",
                  gap: COLUMN_GAP,
                  alignItems: "flex-start",
                }}
              >
                <View style={{ width: contentsColumnWidth }}>
                  <DeckContents
                    deck={deckQuery.data}
                    onCardPress={openCard}
                    containerWidth={contentsColumnWidth}
                  />
                </View>

                <View style={{ width: statsColumnWidth }}>
                  <Text className="mb-3 font-brand text-base text-accent">
                    Stats
                  </Text>
                  {statsQuery.isLoading && (
                    <View className="items-center py-4">
                      <ActivityIndicator size="small" color="#D4B25E" />
                    </View>
                  )}
                  {statsQuery.error && (
                    <View className="rounded-lg bg-danger/20 p-3">
                      <Text className="text-sm text-danger">
                        Couldn&apos;t load stats:{" "}
                        {(statsQuery.error as Error).message}
                      </Text>
                    </View>
                  )}
                  {statsQuery.data && (
                    <DeckStatsPanel
                      stats={statsQuery.data}
                      chartWidth={statsColumnWidth}
                    />
                  )}
                </View>
              </View>
            </>
          )}
        </PageContent>
      </ScrollView>

      {/* Overlays render OUTSIDE PageContent, so they reach the viewport
          edges regardless of the inner max-width. */}
      {isWide ? (
        <CardDetailPanel
          cardId={selectedCardId}
          onClose={closeCard}
          width={SIDE_PANEL_WIDTH}
        />
      ) : (
        <CardDetailSheet cardId={selectedCardId} onClose={closeCard} />
      )}
    </View>
  );
}
