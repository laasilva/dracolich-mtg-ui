// Stack editor — mobile-only pile editor.
//
// Opens as a bottom sheet over the build screen. Renders the cards in one
// pile (e.g. all Creatures) as a horizontal-swipe carousel: drag/swipe
// left-right to walk through the stack, see the full art for the active
// card, and adjust copies or remove cards with the action row at the
// bottom.
//
// Format-aware count controls (taken straight from the build screen's
// per-card limit logic):
//   - COMMANDER: non-basic → max 1, +/- disabled (singleton — only Delete works).
//                basic land → +/- enabled (unlimited copies allowed).
//   - STANDARD / MODERN / PIONEER / PAUPER: max 4 for non-basics, basics unlimited.
//   - Other formats: no client-side cap; backend rules engine is the
//     final word.
//
// Why the same `getCardLimit(card)` shape isn't reused 1:1 — the build
// screen's helper expects a `CardDto` (full card record from the search
// hook). Here we only have the lighter `DeckCardDto` snapshot embedded
// on the deck. The type-line and format inputs are the same shape
// though, so the math reuses the same `maxCopiesPerCard` logic via the
// helper exported below.
//
// Swipe: a native `ScrollView` with `pagingEnabled` + `snapToInterval`.
// FlatList would virtualize for huge piles, but typical piles are
// 4-30 cards — well within ScrollView's range, and it gives us the
// drag-vs-pan-down arbitration `BottomSheet` expects (the sheet only
// dismisses on a vertical drag from the handle).

import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { ManaCost } from "@/components/mana-cost";
import type { DeckCardDto } from "@/lib/queries/decks";

// Standard MTG aspect (63 × 88 mm).
const CARD_ASPECT = 63 / 88;

// Cap a basic land's display max at something sane — the backend
// doesn't enforce a ceiling, but a 4-digit count chip would look odd.
const BASIC_LAND_DISPLAY_CAP = 99;

export interface StackEditorSheetProps {
  // Active when non-null. The parent owns this state so the editor can
  // close cleanly on success and re-open when a different pile is tapped.
  pile: { title: string; cards: DeckCardDto[] } | null;
  // Card to focus on open (0-indexed within `pile.cards`). Defaults to 0.
  initialIndex?: number;
  format?: string;
  onClose: () => void;
  // Mutation callbacks — the parent wires these to the existing
  // useAddCardToDeck / useUpdateCardCount / useRemoveCardFromDeck
  // mutations so deck state stays consistent with the build screen.
  onChangeCount: (cardId: string, count: number) => Promise<void> | void;
  onRemoveCard: (cardId: string) => Promise<void> | void;
  // Whether a mutation is currently in flight (drives the action-row
  // spinner). The parent passes the aggregate of all three mutations'
  // pending states.
  busy?: boolean;
}

export function StackEditorSheet({
  pile,
  initialIndex = 0,
  format,
  onClose,
  onChangeCount,
  onRemoveCard,
  busy = false,
}: StackEditorSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const scrollRef = useRef<ScrollView>(null);
  const snapPoints = useMemo(() => ["95%"], []);

  // Track which card is active. Initialized from the prop; updated on
  // user-driven scroll.
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Sheet measures itself once it lays out — we need its inner width to
  // size the carousel pages.
  const [innerWidth, setInnerWidth] = useState(0);

  // Open/close the sheet when `pile` flips between null and present.
  useEffect(() => {
    if (pile) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [pile]);

  // Reset focus index whenever the pile changes (different category, or
  // re-opened from a card tap with a new index).
  useEffect(() => {
    if (pile) setActiveIndex(initialIndex);
    // `initialIndex` recomputes when the parent passes a fresh value,
    // so depend on both inputs.
  }, [pile, initialIndex]);

  // Once we know `innerWidth`, scroll to the initial card so opening at
  // a non-zero index lands correctly. (ScrollView's `contentOffset` prop
  // would be cleaner but doesn't update when the index changes after
  // mount.)
  useEffect(() => {
    if (!pile || innerWidth === 0) return;
    scrollRef.current?.scrollTo({
      x: initialIndex * innerWidth,
      animated: false,
    });
  }, [pile, initialIndex, innerWidth]);

  // Close the editor if the pile drops to 0 cards (e.g. user removed the
  // last copy). Avoids a blank carousel.
  useEffect(() => {
    if (pile && pile.cards.length === 0) onClose();
  }, [pile, onClose]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (innerWidth === 0) return;
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / innerWidth);
      // setState gating — RN's onMomentumScrollEnd is more correct than
      // onScroll for snap detection, but onScroll keeps the indicator
      // dots in sync mid-drag. Use `Math.round` + same-value guard.
      setActiveIndex((prev) => (prev === idx ? prev : idx));
    },
    [innerWidth]
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.6}
      />
    ),
    []
  );

  // Clamp activeIndex defensively — if a card was just removed, the
  // bounds may shift before the next render commits.
  const cards = pile?.cards ?? [];
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, cards.length - 1));
  const activeCard = cards[safeIndex];

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#15151A" }}
      handleIndicatorStyle={{ backgroundColor: "#9A9AA8", width: 40 }}
    >
      {pile && (
        <BottomSheetView style={{ flex: 1 }}>
          {/* Header — pile title + count + close icon */}
          <View
            className="flex-row items-center justify-between px-5 pt-2 pb-4"
            style={{ gap: 12 }}
          >
            <View style={{ flex: 1 }}>
              <Text className="text-[10px] uppercase tracking-wider text-muted">
                Editing
              </Text>
              <Text
                className="font-brand text-xl text-foreground"
                numberOfLines={1}
              >
                {pile.title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close stack editor"
              className="rounded-full p-2 hover:bg-elevated active:bg-elevated/80"
            >
              <Ionicons name="close" size={24} color="#E8E6E3" />
            </Pressable>
          </View>

          {/* Card carousel — pages snap to the sheet's content width. */}
          <View
            style={{ flex: 1 }}
            onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}
          >
            {innerWidth > 0 && (
              <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={innerWidth}
                decelerationRate="fast"
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={{ flex: 1 }}
              >
                {cards.map((card, i) => (
                  <CardPage
                    key={`${card.card_id}-${i}`}
                    card={card}
                    width={innerWidth}
                    isActive={i === safeIndex}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          {/* Pagination indicator */}
          {cards.length > 1 && (
            <PaginationDots
              count={cards.length}
              activeIndex={safeIndex}
            />
          )}

          {/* Action row */}
          {activeCard && (
            <ActionRow
              card={activeCard}
              format={format}
              busy={busy}
              onChangeCount={onChangeCount}
              onRemoveCard={onRemoveCard}
            />
          )}
        </BottomSheetView>
      )}
    </BottomSheet>
  );
}

// ---------- One card "page" of the carousel ----------

function CardPage({
  card,
  width,
  isActive,
}: {
  card: DeckCardDto;
  width: number;
  isActive: boolean;
}) {
  // Largest image we have. ScrollView snap pages get sized to the sheet
  // width and the card centers within that, sized to fit vertically.
  const imageUri =
    card.image_uri?.large ??
    card.image_uri?.normal ??
    card.image_uri?.png ??
    card.image_uri?.small;

  return (
    <View
      style={{
        width,
        flex: 1,
        alignItems: "center",
        justifyContent: "flex-start",
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          // Card slot scales with the page width but doesn't blow up
          // arbitrarily large on tablets. Capped at 360 wide so even at
          // landscape orientations the card stays "card-shaped" rather
          // than stretching to fill.
          width: Math.min(width - 40, 360),
          aspectRatio: CARD_ASPECT,
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 2,
          borderColor: colorIdentityAccent(card.colors),
          backgroundColor: "#1C1C24",
          // Active page gets a subtle purple glow so the user can tell
          // which page is "armed" for the action row below.
          shadowColor: isActive ? "#9B6BF2" : "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isActive ? 0.5 : 0.3,
          shadowRadius: isActive ? 18 : 8,
        }}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        ) : (
          <View className="flex-1 items-center justify-center p-4">
            <Text
              className="text-center font-brand text-lg text-foreground"
              numberOfLines={3}
            >
              {card.name}
            </Text>
          </View>
        )}
      </View>

      {/* Name + type strip below the art so the user knows what they're
          looking at even when art is washed-out or borderless. */}
      <View
        style={{
          marginTop: 14,
          alignItems: "center",
          paddingHorizontal: 8,
        }}
      >
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text
            className="font-brand text-foreground"
            style={{ fontSize: 18, fontWeight: "700", textAlign: "center" }}
            numberOfLines={2}
          >
            {card.name}
          </Text>
          {card.mana_cost && <ManaCost cost={card.mana_cost} size={14} />}
        </View>
        {card.type_line && (
          <Text
            className="mt-1 text-center text-xs text-muted"
            numberOfLines={1}
          >
            {card.type_line}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------- Action row ----------

function ActionRow({
  card,
  format,
  busy,
  onChangeCount,
  onRemoveCard,
}: {
  card: DeckCardDto;
  format?: string;
  busy: boolean;
  onChangeCount: (cardId: string, count: number) => Promise<void> | void;
  onRemoveCard: (cardId: string) => Promise<void> | void;
}) {
  const count = card.count ?? 1;
  const max = maxCopiesPerCard(format, card.type_line);
  const canIncrement = !busy && count < max;
  const canDecrement = !busy && count > 1;

  return (
    <View
      className="border-t border-border px-5 pt-4 pb-6"
      style={{ backgroundColor: "#15151A" }}
    >
      <View
        className="flex-row items-center justify-between"
        style={{ gap: 16 }}
      >
        {/* Delete — removes all copies of this card from the deck */}
        <Pressable
          onPress={busy ? undefined : () => onRemoveCard(card.card_id)}
          disabled={busy}
          accessibilityLabel="Remove card from deck"
          className="flex-row items-center justify-center rounded-full border border-danger/40 px-5 py-3 hover:bg-danger/10 active:bg-danger/20"
          style={{ gap: 8, opacity: busy ? 0.5 : 1 }}
        >
          <Ionicons name="trash-outline" size={18} color="#D14B3D" />
          <Text className="font-semibold text-danger">Remove</Text>
        </Pressable>

        {/* Count adjuster — disabled if the format caps copies at 1
            for non-basics (Commander). Basic lands always editable. */}
        <View
          className="flex-row items-center"
          style={{ gap: 4 }}
        >
          <CountButton
            icon="remove"
            disabled={!canDecrement}
            onPress={() => onChangeCount(card.card_id, count - 1)}
            accessibilityLabel="Decrease copies"
          />
          <View
            className="items-center justify-center rounded-lg border border-border bg-elevated"
            style={{ minWidth: 64, height: 44, paddingHorizontal: 12 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#D4B25E" />
            ) : (
              <>
                <Text className="font-brand text-xl text-foreground">
                  {count}
                </Text>
                <Text
                  className="text-[9px] uppercase tracking-wider text-muted"
                  style={{ marginTop: -2 }}
                >
                  {count === 1 ? "copy" : "copies"}
                </Text>
              </>
            )}
          </View>
          <CountButton
            icon="add"
            disabled={!canIncrement}
            onPress={() => onChangeCount(card.card_id, count + 1)}
            accessibilityLabel="Add a copy"
          />
        </View>
      </View>

      {/* Format hint — clarifies why +/- is disabled. Singleton formats
          phrase it differently than basic-land overrides. */}
      <CountHint
        count={count}
        max={max}
        canIncrement={canIncrement}
        canDecrement={canDecrement}
        format={format}
        typeLine={card.type_line}
      />
    </View>
  );
}

function CountButton({
  icon,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  icon: "add" | "remove";
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-full border ${
        disabled
          ? "border-border/40 bg-elevated/40"
          : "border-border bg-elevated hover:bg-border/40 active:bg-border/40"
      }`}
      style={{ width: 44, height: 44 }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={disabled ? "#6B6B78" : "#E8E6E3"}
      />
    </Pressable>
  );
}

function CountHint({
  count,
  max,
  canIncrement,
  canDecrement,
  format,
  typeLine,
}: {
  count: number;
  max: number;
  canIncrement: boolean;
  canDecrement: boolean;
  format?: string;
  typeLine?: string;
}): ReactNode {
  // No hint while editing is possible in both directions.
  if (canIncrement && canDecrement) return null;

  const isBasic = !!typeLine?.includes("Basic Land");
  if (max === 1 && !isBasic && format === "COMMANDER") {
    return (
      <Text className="mt-3 text-center text-[11px] text-muted">
        Commander is singleton — only basic lands can have multiple copies.
      </Text>
    );
  }
  if (!canIncrement && count >= max && Number.isFinite(max)) {
    return (
      <Text className="mt-3 text-center text-[11px] text-muted">
        {max} copies is the maximum for this format.
      </Text>
    );
  }
  if (!canDecrement && count === 1) {
    return (
      <Text className="mt-3 text-center text-[11px] text-muted">
        Use Remove to take the last copy out of the deck.
      </Text>
    );
  }
  return null;
}

// ---------- Pagination dots ----------

function PaginationDots({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  // Many-card piles (lands in Commander) would explode the dot row. Cap
  // visible dots at 9 with a centered window around the active one.
  const visibleWindow = 9;
  const half = Math.floor(visibleWindow / 2);
  const start = Math.max(0, Math.min(count - visibleWindow, activeIndex - half));
  const dots = Array.from({ length: Math.min(visibleWindow, count) }).map(
    (_, i) => start + i
  );

  return (
    <View
      className="flex-row items-center justify-center py-2"
      style={{ gap: 6 }}
    >
      {start > 0 && (
        <Text className="text-[10px] text-muted" style={{ marginRight: 2 }}>
          …
        </Text>
      )}
      {dots.map((i) => (
        <View
          key={i}
          style={{
            width: i === activeIndex ? 16 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === activeIndex ? "#D4B25E" : "#3A3A45",
          }}
        />
      ))}
      {start + dots.length < count && (
        <Text className="text-[10px] text-muted" style={{ marginLeft: 2 }}>
          …
        </Text>
      )}
      <Text
        className="ml-3 text-[11px] text-muted"
        style={{ minWidth: 48, textAlign: "right" }}
      >
        {activeIndex + 1} / {count}
      </Text>
    </View>
  );
}

// ---------- Helpers ----------

// Format-aware copy cap. Mirrors the build screen's logic so behavior
// matches between the two surfaces.
function maxCopiesPerCard(format?: string, typeLine?: string): number {
  if (typeLine && typeLine.includes("Basic Land")) return BASIC_LAND_DISPLAY_CAP;
  switch (format) {
    case "COMMANDER":
      return 1;
    case "STANDARD":
    case "MODERN":
    case "PIONEER":
    case "PAUPER":
      return 4;
    default:
      return Number.POSITIVE_INFINITY;
  }
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
