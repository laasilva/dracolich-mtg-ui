// Deck creation wizard — step 3.
//
// "Look at your finished deck" surface. Renders the deck as a solitaire-
// style by-type pile gallery. Read-only — adds and removes happen on the
// build step. Back returns to the build page; Finish dismisses the
// wizard and lands on the public deck detail page.

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { DeckCardSheet } from "@/components/deck-card-sheet";
import { DeckPileGrid } from "@/components/deck-pile-grid";
import {
  PageContent,
  WEB_MAX_CONTENT_WIDTH,
} from "@/components/page-content";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/lib/dialogs";
import { showFeedback } from "@/lib/feedback";
import { useDeckById, useDeleteDeck } from "@/lib/queries/decks";

const MOBILE_BREAKPOINT = 768;

const PAGE_PADDING = 24;

export default function DeckReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;

  const deckQuery = useDeckById(id);
  const deleteDeck = useDeleteDeck();
  const deck = deckQuery.data;
  const isOwner = !!user && !!deck?.user_id && deck.user_id === user.userId;

  // Mobile-only preview state — tap a pile card to open the bottom sheet.
  // Read-only on this screen (no Remove button); edits happen at /build.
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);

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

  // Local card count — matches the build page's logic so the badge stays
  // honest when the backend's server-computed count is stale on older
  // entries (see the addCard `MAINBOARD` story in build.tsx).
  const totalCount = useMemo(() => {
    if (!deck) return 0;
    let total = 0;
    for (const c of deck.cards ?? []) total += c.count ?? 1;
    for (const c of deck.commander ?? []) total += c.count ?? 1;
    return total;
  }, [deck]);

  const innerWidth = Math.min(viewportWidth, WEB_MAX_CONTENT_WIDTH) - PAGE_PADDING * 2;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <PageContent style={{ padding: PAGE_PADDING }}>
          {/* Top bar */}
          <View
            className="mb-6 flex-row items-center"
            style={{ gap: 12 }}
          >
            <Pressable
              onPress={() => router.replace(`/decks/${id}/build` as any)}
              className="rounded-md px-2 py-1 hover:bg-elevated active:bg-elevated"
            >
              <Text className="text-sm text-accent">← Back to build</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text className="text-xs uppercase tracking-wider text-muted">
                Reviewing
              </Text>
              <Text
                className="font-brand text-2xl text-foreground"
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
              onPress={() => router.push(`/decks/${id}/finalize` as any)}
              className="rounded-md bg-accent px-4 py-2 hover:bg-accent/90 active:bg-accent/80"
            >
              <Text className="font-semibold text-background">Finish</Text>
            </Pressable>
          </View>


          {/* Quick stats strip */}
          {deck && (
            <View
              className="mb-8 flex-row flex-wrap rounded-xl border border-border"
              style={{
                backgroundColor: "#15151A",
                padding: 16,
                gap: 24,
              }}
            >
              <StatPill label="Format" value={deck.format ?? "—"} />
              <StatPill
                label="Cards"
                value={`${totalCount}${totalCount === 1 ? " card" : " cards"}`}
              />
              {deck.colors && deck.colors.length > 0 && (
                <StatPill label="Colors" value={deck.colors.join(" / ")} />
              )}
              {deck.status && (
                <StatPill label="Status" value={deck.status} />
              )}
            </View>
          )}

          {deckQuery.isLoading && !deck && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color="#D4B25E" />
            </View>
          )}

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

          {deck && (
            <DeckPileGrid
              deck={deck}
              containerWidth={innerWidth}
              // Mobile: tap a card → open preview sheet (read-only).
              // Wide: hover preview already provides the look, so no tap
              // action — keeps the surface fully read-only there.
              onCardPress={isMobile ? setPreviewCardId : undefined}
            />
          )}
        </PageContent>
      </ScrollView>

      {isMobile && (
        <DeckCardSheet
          cardId={previewCardId}
          onClose={() => setPreviewCardId(null)}
        />
      )}
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </Text>
      <Text className="mt-0.5 font-brand text-base text-foreground">
        {value}
      </Text>
    </View>
  );
}
