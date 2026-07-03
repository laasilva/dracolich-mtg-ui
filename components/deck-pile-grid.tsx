// Wizard step 3 — full-screen solitaire-style by-type pile view.
//
// This is the "look over your finished deck" surface. Cards stack into
// piles per primary type and fan out a little on hover so the player can
// read each card. No editing here — adds and removes live on the build
// page (step 2). Tap "Back to build" to return, "Finish" to leave the
// wizard and land on the deck detail page.
//
// Companion to `deck-pile-view.tsx` (the compact column on the build
// page). The compact view trades animation for density; this one is the
// inverse — bigger cards, polished motion.

import { Image } from "expo-image";
import { useCallback, useMemo, useRef } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useHoverPreviewWithCleanup } from "@/components/hover-preview";
import type { DeckCardDto, DeckDto } from "@/lib/queries/decks";

// Standard MTG card aspect (63mm × 88mm).
const CARD_ASPECT = 63 / 88;

// Peek (vertical offset between stacked cards) as a fraction of card
// height. Web starts at BASE_PEEK and animates up to HOVER_PEEK on
// pile-hover; mobile pins to MOBILE_PEEK since there's no hover trigger
// to drive the fan-out.
const BASE_PEEK_RATIO = 0.2;
const HOVER_PEEK_RATIO = 0.34;
const MOBILE_PEEK_RATIO = 0.26;

// Cap on rendered pile height. Very long piles (30+ lands) compress
// their peek so they don't run off the layout.
const MAX_PILE_HEIGHT = 720;

const MIN_PILE_WIDTH = 150;
const PILE_GAP = 20;

// Type order matches the compact view so the two surfaces feel like the
// same information at different densities.
const TYPE_ORDER = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
  "Other",
];

const PRIMARY_TYPE_PRIORITY = [
  "Land",
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
];

interface DeckPileGridProps {
  deck: DeckDto;
  containerWidth: number;
  // Optional — when provided, a tap on any pile card or the commander
  // calls this with the card id. The review screen uses this to open
  // the mobile preview sheet on tap.
  onCardPress?: (cardId: string) => void;
}

export function DeckPileGrid({
  deck,
  containerWidth,
  onCardPress,
}: DeckPileGridProps) {
  const allCards = deck.cards ?? [];
  const mainboard = allCards.filter(
    (c) => c.card_category == null || c.card_category === "MAINBOARD"
  );
  const sideboard = allCards.filter((c) => c.card_category === "SIDEBOARD");
  const maybeboard = allCards.filter(
    (c) => c.card_category === "MAYBE_BOARD"
  );

  // Pick a column count that keeps piles wider than MIN_PILE_WIDTH and
  // caps at 5 columns even on huge viewports — past that, individual
  // cards get too small to read.
  const cols = Math.max(
    2,
    Math.min(
      5,
      Math.floor((containerWidth + PILE_GAP) / (MIN_PILE_WIDTH + PILE_GAP))
    )
  );
  const pileWidth = Math.floor(
    (containerWidth - PILE_GAP * (cols - 1)) / cols
  );

  return (
    <View>
      {deck.commander && deck.commander.length > 0 && (
        <CommanderHero
          cards={deck.commander}
          containerWidth={containerWidth}
          onCardPress={onCardPress}
        />
      )}

      <PileSection
        title="Mainboard"
        cards={mainboard}
        pileWidth={pileWidth}
        onCardPress={onCardPress}
      />

      {sideboard.length > 0 && (
        <PileSection
          title="Sideboard"
          cards={sideboard}
          pileWidth={pileWidth}
          onCardPress={onCardPress}
        />
      )}

      {maybeboard.length > 0 && (
        <PileSection
          title="Maybeboard"
          cards={maybeboard}
          pileWidth={pileWidth}
          onCardPress={onCardPress}
        />
      )}
    </View>
  );
}

// ---------- Commander hero ----------

function CommanderHero({
  cards,
  containerWidth,
  onCardPress,
}: {
  cards: DeckCardDto[];
  containerWidth: number;
  onCardPress?: (cardId: string) => void;
}) {
  // One commander → big. Two (Partner/Background) → split.
  const heroWidth =
    cards.length === 1
      ? Math.min(280, Math.floor(containerWidth * 0.32))
      : Math.min(220, Math.floor((containerWidth - 24) / 2));

  return (
    <Animated.View
      entering={FadeInDown.duration(550).springify()}
      className="mb-10"
    >
      <View
        className="mb-4 flex-row items-baseline"
        style={{ gap: 10 }}
      >
        <Text className="font-brand text-3xl text-foreground">Commander</Text>
        <Text className="font-brand text-xl text-accent">{cards.length}</Text>
      </View>
      <View
        style={{ height: 2, width: 48, backgroundColor: "#D4B25E", borderRadius: 1, marginBottom: 16 }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        {cards.map((c) => (
          <CommanderCard
            key={c.card_id}
            card={c}
            width={heroWidth}
            onPress={onCardPress ? () => onCardPress(c.card_id) : undefined}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function CommanderCard({
  card,
  width,
  onPress,
}: {
  card: DeckCardDto;
  width: number;
  onPress?: () => void;
}) {
  const imageUri =
    card.image_uri?.large ?? card.image_uri?.normal ?? card.image_uri?.png;
  const accent = colorIdentityAccent(card.colors);
  const hover = useHoverPreviewWithCleanup();
  // Anchor for the floating preview — measureInWindow on hover so the
  // preview floats next to the commander card instead of pinning to the
  // top-right of the viewport.
  const ref = useRef<View>(null);

  // Subtle lift on hover — translateY -4 + shadow grow. Reads as a
  // gentle invitation rather than a button-press affordance.
  const lift = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * lift.value }],
    shadowOpacity: 0.4 + 0.2 * lift.value,
    shadowRadius: 16 + 12 * lift.value,
  }));

  const showAnchoredPreview = () => {
    const payload = {
      id: card.card_id,
      name: card.name,
      imageUri,
      manaCost: card.mana_cost,
      typeLine: card.type_line,
      colors: card.colors,
    };
    ref.current?.measureInWindow((x, y, w, h) => {
      hover.show(payload, { x, y, width: w, height: h });
    });
  };

  return (
    <Animated.View
      style={[
        {
          width,
          aspectRatio: CARD_ASPECT,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: accent,
          overflow: "hidden",
          backgroundColor: "#1C1C24",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
        },
        liftStyle,
      ]}
    >
      <Pressable
        ref={ref as any}
        onPress={onPress}
        onHoverIn={() => {
          lift.value = withTiming(1, { duration: 200 });
          showAnchoredPreview();
        }}
        onHoverOut={() => {
          lift.value = withTiming(0, { duration: 200 });
          hover.hide();
        }}
        style={{ flex: 1 }}
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
      </Pressable>
    </Animated.View>
  );
}

// ---------- Pile section (per board) ----------

function PileSection({
  title,
  cards,
  pileWidth,
  onCardPress,
}: {
  title: string;
  cards: DeckCardDto[];
  pileWidth: number;
  onCardPress?: (cardId: string) => void;
}) {
  const groups = useMemo(() => groupByType(cards), [cards]);
  const total = useMemo(() => totalCardCount(cards), [cards]);

  if (cards.length === 0) return null;

  const piles = TYPE_ORDER.map((t) => {
    const arr = groups.get(t);
    if (!arr || arr.length === 0) return null;
    return { type: t, cards: arr };
  }).filter((p): p is { type: string; cards: DeckCardDto[] } => p !== null);

  return (
    <View className="mb-12">
      <Animated.View
        entering={FadeInDown.duration(450).springify()}
        className="mb-5"
      >
        <View className="flex-row items-baseline" style={{ gap: 10 }}>
          <Text className="font-brand text-3xl text-foreground">{title}</Text>
          <Text className="font-brand text-xl text-accent">{total}</Text>
        </View>
        <View
          className="mt-2"
          style={{
            height: 2,
            width: 48,
            backgroundColor: "#D4B25E",
            borderRadius: 1,
          }}
        />
      </Animated.View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: PILE_GAP,
          alignItems: "flex-start",
        }}
      >
        {piles.map((p, i) => (
          <TypePile
            key={p.type}
            type={p.type}
            cards={p.cards}
            width={pileWidth}
            index={i}
            onCardPress={onCardPress}
          />
        ))}
      </View>
    </View>
  );
}

// ---------- Individual pile ----------

function TypePile({
  type,
  cards,
  width,
  index,
  onCardPress,
}: {
  type: string;
  cards: DeckCardDto[];
  width: number;
  index: number;
  onCardPress?: (cardId: string) => void;
}) {
  const total = totalCardCount(cards);

  // Expand counts so each copy renders as its own tile in the stack.
  const expanded: DeckCardDto[] = useMemo(() => {
    const out: DeckCardDto[] = [];
    for (const c of cards) {
      const n = c.count ?? 1;
      for (let i = 0; i < n; i++) out.push(c);
    }
    return out;
  }, [cards]);

  const cardHeight = width / CARD_ASPECT;

  // Mobile has no hover — render at a slightly-larger static peek so the
  // cards are still readable. Web starts at BASE and animates on hover.
  const initialPeek =
    Platform.OS === "web" ? BASE_PEEK_RATIO : MOBILE_PEEK_RATIO;
  const peek = useSharedValue(initialPeek);

  // Cap the natural peek if the resulting pile would exceed the max
  // height. The peek SV reads the cap in its worklet — that way it
  // applies smoothly across the hover animation, not just at rest.
  const cappedPeekForRatio = useCallback(
    (ratio: number) => {
      "worklet";
      if (expanded.length <= 1) return ratio;
      const naturalHeight = (expanded.length - 1) * cardHeight * ratio + cardHeight;
      if (naturalHeight <= MAX_PILE_HEIGHT) return ratio;
      return Math.max(
        0.05,
        (MAX_PILE_HEIGHT - cardHeight) / ((expanded.length - 1) * cardHeight)
      );
    },
    [cardHeight, expanded.length]
  );

  const handleHoverIn = useCallback(() => {
    if (Platform.OS !== "web") return;
    peek.value = withTiming(cappedPeekForRatio(HOVER_PEEK_RATIO), {
      duration: 240,
    });
  }, [peek, cappedPeekForRatio]);

  const handleHoverOut = useCallback(() => {
    if (Platform.OS !== "web") return;
    peek.value = withTiming(cappedPeekForRatio(initialPeek), {
      duration: 240,
    });
  }, [peek, cappedPeekForRatio, initialPeek]);

  // Pile container height tracks the live peek so it grows/shrinks with
  // the animation — otherwise cards would overflow on hover.
  const containerHeightStyle = useAnimatedStyle(() => {
    if (expanded.length === 0) return { height: 0 };
    const h = (expanded.length - 1) * (cardHeight * peek.value) + cardHeight;
    return { height: h };
  });

  return (
    <Animated.View
      entering={FadeInDown.duration(450).delay(index * 70).springify()}
      style={{ width }}
    >
      <Pressable onHoverIn={handleHoverIn} onHoverOut={handleHoverOut}>
        <View
          className="mb-2 flex-row items-baseline"
          style={{ gap: 8 }}
        >
          <Text
            className="font-brand text-lg text-accent"
            numberOfLines={1}
          >
            {pluralize(type, total)}
          </Text>
          <Text className="text-xs text-muted">{total}</Text>
        </View>

        <Animated.View style={[{ position: "relative" }, containerHeightStyle]}>
          {expanded.map((card, i) => (
            <PileCard
              key={`${card.card_id}-${i}`}
              card={card}
              width={width}
              cardHeight={cardHeight}
              indexInPile={i}
              peek={peek}
              onPress={
                onCardPress ? () => onCardPress(card.card_id) : undefined
              }
            />
          ))}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function PileCard({
  card,
  width,
  cardHeight,
  indexInPile,
  peek,
  onPress,
}: {
  card: DeckCardDto;
  width: number;
  cardHeight: number;
  indexInPile: number;
  peek: SharedValue<number>;
  onPress?: () => void;
}) {
  const imageUri =
    card.image_uri?.normal ??
    card.image_uri?.large ??
    card.image_uri?.small;
  const previewUri =
    card.image_uri?.large ??
    card.image_uri?.normal ??
    card.image_uri?.png ??
    card.image_uri?.small;

  const accent = colorIdentityAccent(card.colors);
  const hover = useHoverPreviewWithCleanup();
  // Anchor ref — measureInWindow on hover so the floating preview can
  // float next to the pile card rather than pinning to the top-right.
  const ref = useRef<View>(null);

  const positionStyle = useAnimatedStyle(() => ({
    top: indexInPile * (cardHeight * peek.value),
  }));

  const handleHoverIn = () => {
    const payload = {
      id: card.card_id,
      name: card.name,
      imageUri: previewUri,
      manaCost: card.mana_cost,
      typeLine: card.type_line,
      colors: card.colors,
    };
    ref.current?.measureInWindow((x, y, w, h) => {
      hover.show(payload, { x, y, width: w, height: h });
    });
  };

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          width,
          aspectRatio: CARD_ASPECT,
          zIndex: indexInPile + 1,
          borderRadius: 10,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: accent,
          backgroundColor: "#1C1C24",
        },
        positionStyle,
      ]}
    >
      <Pressable
        ref={ref as any}
        onPress={onPress}
        onHoverIn={handleHoverIn}
        onHoverOut={hover.hide}
        style={{ flex: 1 }}
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
          <View className="flex-1 items-center justify-center p-2">
            <Text
              className="text-center text-xs text-foreground"
              numberOfLines={2}
            >
              {card.name}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---------- Helpers ----------

function primaryType(typeLine?: string): string {
  if (!typeLine) return "Other";
  const typesPart = typeLine.split("—")[0];
  for (const t of PRIMARY_TYPE_PRIORITY) {
    if (typesPart.includes(t)) return t;
  }
  return "Other";
}

function groupByType(cards: DeckCardDto[]): Map<string, DeckCardDto[]> {
  const groups = new Map<string, DeckCardDto[]>();
  for (const c of cards) {
    const t = primaryType(c.type_line);
    const arr = groups.get(t);
    if (arr) arr.push(c);
    else groups.set(t, [c]);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      const ac = a.cmc ?? 0;
      const bc = b.cmc ?? 0;
      if (ac !== bc) return ac - bc;
      return a.name.localeCompare(b.name);
    });
  }
  return groups;
}

function totalCardCount(cards: DeckCardDto[]): number {
  return cards.reduce((sum, c) => sum + (c.count ?? 1), 0);
}

function pluralize(type: string, count: number): string {
  if (count <= 1) return type;
  if (type === "Sorcery") return "Sorceries";
  return `${type}s`;
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
