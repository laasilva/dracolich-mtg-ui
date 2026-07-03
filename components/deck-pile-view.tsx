// Solitaire-style by-type pile view. Each card type gets its own vertical
// pile; cards stack with only their top strip (name + cost) peeking out,
// the way you'd fan a deck across a felt table.
//
// Used in the build screen's "Your deck" column to keep the page from
// growing endlessly as cards are added — a 60-card pile is ~360px tall
// instead of ~1800px in mosaic mode. The full wizard step 3 review will
// share this layout, just at a larger scale.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";

import { useHoverPreviewWithCleanup } from "@/components/hover-preview";
import type { DeckCardDto, DeckDto } from "@/lib/queries/decks";

// Standard MTG card aspect (63mm × 88mm).
const CARD_ASPECT = 63 / 88;

// Natural peek between cards in a pile, as a fraction of card height. Tuned
// so the card name + mana cost band at the top of the art stays visible.
const PEEK_RATIO = 0.22;

// Cap on a pile's rendered height. Long piles (e.g. 30+ lands) compress
// their peek instead of growing unbounded — the pile reads as one stack
// rather than a wall of cards.
const MAX_PILE_HEIGHT = 360;

// Type order matches DeckContents so the two views feel like the same
// information at different densities.
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

interface DeckPileViewProps {
  deck: DeckDto;
  // Tap on an individual pile card. Build screen wires this to either
  // the legacy remove flow (web) or to opening the stack editor at that
  // card's index (mobile).
  onCardPress?: (cardId: string) => void;
  // Per-type Edit button handler. When provided, each pile header
  // surfaces an "Edit" pencil button that calls this with the cards in
  // that pile and a display title. Build screen wires this to open the
  // StackEditorSheet on mobile. Omit to hide the button.
  onEditPile?: (cards: DeckCardDto[], title: string) => void;
  // Available horizontal space — drives how many piles we fit per row.
  containerWidth: number;
}

export function DeckPileView({
  deck,
  onCardPress,
  onEditPile,
  containerWidth,
}: DeckPileViewProps) {
  const allCards = deck.cards ?? [];
  const mainboard = allCards.filter(
    (c) => c.card_category === undefined || c.card_category === "MAINBOARD"
  );
  const sideboard = allCards.filter((c) => c.card_category === "SIDEBOARD");
  const maybeboard = allCards.filter((c) => c.card_category === "MAYBE_BOARD");

  return (
    <View>
      {deck.commander && deck.commander.length > 0 && (
        // Commander row intentionally omits the Edit button — the commander
        // is baked in at deck creation and there's no in-place edit
        // endpoint yet. The single-card tap still opens the preview if
        // the parent wires it.
        <CommanderRow
          cards={deck.commander}
          onCardPress={onCardPress}
          containerWidth={containerWidth}
        />
      )}

      <PileBoard
        title="Mainboard"
        cards={mainboard}
        onCardPress={onCardPress}
        onEditPile={onEditPile}
        containerWidth={containerWidth}
      />

      {sideboard.length > 0 && (
        <PileBoard
          title="Sideboard"
          cards={sideboard}
          onCardPress={onCardPress}
          onEditPile={onEditPile}
          containerWidth={containerWidth}
        />
      )}

      {maybeboard.length > 0 && (
        <PileBoard
          title="Maybeboard"
          cards={maybeboard}
          onCardPress={onCardPress}
          onEditPile={onEditPile}
          containerWidth={containerWidth}
        />
      )}
    </View>
  );
}

function CommanderRow({
  cards,
  onCardPress,
  containerWidth,
}: {
  cards: DeckCardDto[];
  onCardPress?: (cardId: string) => void;
  containerWidth: number;
}) {
  const width = Math.min(160, Math.floor(containerWidth * 0.45));
  return (
    <View className="mb-5">
      <SectionLabel text="Commander" count={cards.length} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {cards.map((c) => (
          <PileCard
            key={c.card_id}
            card={c}
            width={width}
            top={0}
            zIndex={1}
            position="relative"
            onPress={() => onCardPress?.(c.card_id)}
          />
        ))}
      </View>
    </View>
  );
}

function PileBoard({
  title,
  cards,
  onCardPress,
  onEditPile,
  containerWidth,
}: {
  title: string;
  cards: DeckCardDto[];
  onCardPress?: (cardId: string) => void;
  onEditPile?: (cards: DeckCardDto[], title: string) => void;
  containerWidth: number;
}) {
  const groups = useMemo(() => groupByType(cards), [cards]);
  const total = useMemo(() => totalCardCount(cards), [cards]);

  if (cards.length === 0) return null;

  // Column count tiers — picked so the cards stay readable AND the per-
  // pile Edit button has room to render at a usable tap size.
  //   - phone (<380px column): 1 col. Each pile gets the full content
  //     width; the user scrolls vertically through piles. Previously
  //     this was 2 cols at ~142px which made everything cramped.
  //   - phone-wide / tablet portrait (380-580): 2 cols.
  //   - tablet landscape / desktop (>=580): 3 cols.
  const PILE_GAP = 12;
  const targetCols =
    containerWidth >= 580 ? 3 : containerWidth >= 380 ? 2 : 1;
  const pileWidth = Math.max(
    120,
    Math.floor((containerWidth - PILE_GAP * (targetCols - 1)) / targetCols)
  );

  const piles = TYPE_ORDER.map((t) => {
    const arr = groups.get(t);
    if (!arr || arr.length === 0) return null;
    return { type: t, cards: arr };
  }).filter((p): p is { type: string; cards: DeckCardDto[] } => p !== null);

  return (
    <View className="mb-6">
      <SectionLabel
        text={title}
        count={total}
        // Top-level board edit currently disabled — the per-type Edit
        // buttons below are the precise entry points. Leaving the
        // top-level button off keeps the header uncluttered.
      />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: PILE_GAP,
        }}
      >
        {piles.map((p) => (
          <TypePile
            key={p.type}
            type={p.type}
            cards={p.cards}
            width={pileWidth}
            onCardPress={onCardPress}
            onEdit={
              onEditPile
                ? () => onEditPile(p.cards, pluralize(p.type, totalCardCount(p.cards)))
                : undefined
            }
          />
        ))}
      </View>
    </View>
  );
}

function TypePile({
  type,
  cards,
  width,
  onCardPress,
  onEdit,
}: {
  type: string;
  cards: DeckCardDto[];
  width: number;
  onCardPress?: (cardId: string) => void;
  onEdit?: () => void;
}) {
  const total = totalCardCount(cards);

  // Expand counts — a card with count 3 shows as three stacked instances,
  // since the visual metaphor is "fan the deck out" not "list each unique."
  const expanded: DeckCardDto[] = useMemo(() => {
    const out: DeckCardDto[] = [];
    for (const c of cards) {
      const n = c.count ?? 1;
      for (let i = 0; i < n; i++) out.push(c);
    }
    return out;
  }, [cards]);

  const cardHeight = width / CARD_ASPECT;
  const naturalPeek = cardHeight * PEEK_RATIO;

  // The pile-height cap scales with the card itself. A fixed 360px cap
  // worked fine when piles were ~140px wide (cardHeight ≈ 200, well
  // under 360), but bigger cards on phone (1-col → 295px wide →
  // cardHeight ≈ 410) would punch through the cap on the very first
  // card, collapsing the peek to a sliver. Letting the cap grow with
  // the card keeps multi-copy piles legible at any width.
  const maxPileHeight = Math.max(MAX_PILE_HEIGHT, cardHeight + 200);

  // Squeeze peek if the natural pile would blow past the max height —
  // very long piles compact instead of running off the layout.
  const peek =
    expanded.length > 1 &&
    naturalPeek * (expanded.length - 1) + cardHeight > maxPileHeight
      ? Math.max(8, (maxPileHeight - cardHeight) / (expanded.length - 1))
      : naturalPeek;

  const pileHeight =
    expanded.length > 0 ? peek * (expanded.length - 1) + cardHeight : 0;

  return (
    <View style={{ width }}>
      <View
        className="mb-2 flex-row items-center justify-between"
        style={{ gap: 8 }}
      >
        <View
          className="flex-row items-baseline"
          style={{ gap: 6, flex: 1 }}
        >
          <Text
            className="font-brand text-base text-accent"
            numberOfLines={1}
          >
            {pluralize(type, total)}
          </Text>
          <Text className="text-xs text-muted">{total}</Text>
        </View>
        {onEdit && (
          // Pill-style Edit button — icon + label, gold-tinted background,
          // ~36px hit target so it's reliably tappable on mobile (the
          // previous icon-only version was 26px and effectively invisible).
          <Pressable
            onPress={onEdit}
            accessibilityLabel={`Edit ${pluralize(type, total)} pile`}
            className="flex-row items-center rounded-full border border-accent/40 px-3 py-1.5 hover:bg-accent/15 active:bg-accent/25"
            style={{ gap: 6, backgroundColor: "rgba(212, 178, 94, 0.08)" }}
          >
            <Ionicons name="create-outline" size={14} color="#D4B25E" />
            <Text className="text-xs font-semibold text-accent">Edit</Text>
          </Pressable>
        )}
      </View>
      <View style={{ height: pileHeight, position: "relative" }}>
        {expanded.map((card, i) => (
          <PileCard
            key={`${card.card_id}-${i}`}
            card={card}
            width={width}
            top={i * peek}
            zIndex={i + 1}
            position="absolute"
            onPress={() => onCardPress?.(card.card_id)}
          />
        ))}
      </View>
    </View>
  );
}

function PileCard({
  card,
  width,
  top,
  zIndex,
  position,
  onPress,
}: {
  card: DeckCardDto;
  width: number;
  top: number;
  zIndex: number;
  position: "absolute" | "relative";
  onPress: () => void;
}) {
  const imageUri =
    card.image_uri?.normal ??
    card.image_uri?.large ??
    card.image_uri?.small;

  const accent = colorIdentityAccent(card.colors);
  const hover = useHoverPreviewWithCleanup();
  // Prefer the largest image we have for the zoom — pile thumbs use
  // `normal`, so falling through to `large` gives crisper preview text.
  const previewUri =
    card.image_uri?.large ??
    card.image_uri?.normal ??
    card.image_uri?.png ??
    card.image_uri?.small;

  // Measure the tile on hover so the floating preview floats *next* to it
  // rather than always pinning top-right. `measureInWindow` is callback-
  // async; the preview pops one frame later than a synchronous show().
  const ref = useRef<View>(null);
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
    <Pressable
      ref={ref as any}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={hover.hide}
      style={{
        position,
        top: position === "absolute" ? top : undefined,
        left: position === "absolute" ? 0 : undefined,
        width,
        aspectRatio: CARD_ASPECT,
        zIndex,
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: "#1C1C24",
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
        <View className="flex-1 items-center justify-center p-2">
          <Text
            className="text-center text-[10px] text-foreground"
            numberOfLines={2}
          >
            {card.name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function SectionLabel({
  text,
  count,
  onEdit,
}: {
  text: string;
  count: number;
  onEdit?: () => void;
}) {
  return (
    <View
      className="mb-3 flex-row items-center justify-between"
      style={{ gap: 8 }}
    >
      <View className="flex-row items-baseline" style={{ gap: 8 }}>
        <Text className="text-[11px] uppercase tracking-wider text-muted">
          {text}
        </Text>
        <Text className="text-[11px] text-accent">{count}</Text>
      </View>
      {onEdit && (
        <Pressable
          onPress={onEdit}
          accessibilityLabel={`Edit ${text}`}
          className="flex-row items-center rounded-full px-2 py-1 hover:bg-elevated active:bg-elevated/80"
          style={{ gap: 4 }}
        >
          <Ionicons name="create-outline" size={12} color="#D4B25E" />
          <Text className="text-[10px] uppercase tracking-wider text-accent">
            Edit
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Helpers ----------

// Exported so consumers (e.g. the build screen) can group cards by the
// same primary-type bucket DeckPileView uses for its piles.
export function primaryType(typeLine?: string): string {
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
  // Sort by CMC then name — gives each pile a natural mana-curve gradient
  // (cheapest in front) that reads at a glance.
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
