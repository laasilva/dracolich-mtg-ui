// Deck composition — art mosaic grouped by primary card type.
//
// The visual is the card art (just the painting, no frame), arranged in
// a multi-column wrap grid. Section headings are big and brand-font, with
// a thin gold accent rule underneath, so the page reads as "gallery
// curated by type" instead of "database list view."
//
// Each tile handles its own hover effects (parallax tilt + lift + glow),
// taps bubble up to the parent which opens the shared card detail surface.

import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { CardTile } from "@/components/card-tile";
import { DeckArtMosaic } from "@/components/deck-art-mosaic";
import type { CardDto } from "@/lib/queries/cards";
import type { DeckCardDto, DeckDto } from "@/lib/queries/decks";

interface DeckContentsProps {
  deck: DeckDto;
  // Caller-supplied tap handler — receives the card id. Used by the parent
  // to open the shared CardDetailPanel (wide) / CardDetailSheet (narrow).
  onCardPress?: (cardId: string) => void;
  // Width of the column this content lives in. Drives the mosaic tile
  // sizing so we fit cleanly into the layout.
  containerWidth: number;
}

export function DeckContents({
  deck,
  onCardPress,
  containerWidth,
}: DeckContentsProps) {
  const allCards = deck.cards ?? [];
  const mainboard = allCards.filter(
    (c) => c.card_category === undefined || c.card_category === "MAINBOARD"
  );
  const sideboard = allCards.filter((c) => c.card_category === "SIDEBOARD");
  const maybeboard = allCards.filter((c) => c.card_category === "MAYBE_BOARD");

  return (
    <View>
      {deck.commander && deck.commander.length > 0 && (
        <View className="mb-8">
          <SectionTitle text="Commander" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {deck.commander.map((card) => (
              <Pressable
                key={card.card_id}
                onPress={() => onCardPress?.(card.card_id)}
              >
                <CardTile
                  card={adaptDeckCard(card)}
                  mode="carousel"
                  width={220}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <BoardSection
        title="Mainboard"
        cards={mainboard}
        onCardPress={onCardPress}
        containerWidth={containerWidth}
      />

      {sideboard.length > 0 && (
        <BoardSection
          title="Sideboard"
          cards={sideboard}
          onCardPress={onCardPress}
          containerWidth={containerWidth}
        />
      )}

      {maybeboard.length > 0 && (
        <BoardSection
          title="Maybeboard"
          cards={maybeboard}
          onCardPress={onCardPress}
          containerWidth={containerWidth}
        />
      )}
    </View>
  );
}

// ---------- Sections ----------

const TYPE_ORDER: string[] = [
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

function BoardSection({
  title,
  cards,
  onCardPress,
  containerWidth,
}: {
  title: string;
  cards: DeckCardDto[];
  onCardPress?: (cardId: string) => void;
  containerWidth: number;
}) {
  if (cards.length === 0) return null;
  const groups = useMemo(() => groupByType(cards), [cards]);
  const total = useMemo(() => totalCardCount(cards), [cards]);

  return (
    <View className="mb-8">
      <SectionTitle text={title} count={total} />
      {TYPE_ORDER.map((type) => {
        const group = groups.get(type);
        if (!group || group.length === 0) return null;
        return (
          <TypeBlock
            key={type}
            type={type}
            cards={group}
            onCardPress={onCardPress}
            containerWidth={containerWidth}
          />
        );
      })}
    </View>
  );
}

function TypeBlock({
  type,
  cards,
  onCardPress,
  containerWidth,
}: {
  type: string;
  cards: DeckCardDto[];
  onCardPress?: (cardId: string) => void;
  containerWidth: number;
}) {
  const count = totalCardCount(cards);
  return (
    <View className="mb-6">
      <View
        className="mb-3 flex-row items-baseline"
        style={{ gap: 8 }}
      >
        <Text className="font-brand text-xl text-accent">
          {pluralize(type, count)}
        </Text>
        <Text className="text-sm text-muted">{count}</Text>
      </View>
      <DeckArtMosaic
        cards={cards}
        onCardPress={onCardPress}
        containerWidth={containerWidth}
      />
    </View>
  );
}

function SectionTitle({ text, count }: { text: string; count?: number }) {
  return (
    <View className="mb-4">
      <View
        className="flex-row items-baseline"
        style={{ gap: 10 }}
      >
        <Text className="font-brand text-2xl text-foreground">{text}</Text>
        {count != null && (
          <Text className="font-brand text-base text-accent">{count}</Text>
        )}
      </View>
      {/* Thin gold accent rule under the section title — gives the page
          architectural weight without heavy chrome. */}
      <View
        className="mt-1.5"
        style={{
          height: 2,
          width: 36,
          backgroundColor: "#D4B25E",
          borderRadius: 1,
        }}
      />
    </View>
  );
}

// ---------- Helpers ----------

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
    arr.sort((a, b) => a.name.localeCompare(b.name));
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

function adaptDeckCard(c: DeckCardDto): CardDto {
  return {
    id: c.card_id,
    oracle_id: "",
    name: c.name,
    multiface: false,
    default_face: {
      name: c.name,
      full_type: c.type_line,
      gameplay_property: {
        mana_cost: c.mana_cost,
        mana_value: c.cmc,
        colors: c.colors,
        color_identity: c.colors,
      },
    },
    default_art: {
      image_uris: c.image_uri,
    },
  };
}
