// Single-card visualization. Atomic unit reused across:
// - Card carousel (mode="carousel"): full card-shaped, image-first
// - Search results / deck contents (mode="list"): horizontal row, thumbnail + meta
//
// Tolerant of missing fields — falls back to a text-only card if no image art
// is available, so the search seed-state never crashes the UI.

import { Image } from "expo-image";
import { Platform, Pressable, Text, View } from "react-native";

import { ManaCost } from "@/components/mana-cost";
import type { CardDto } from "@/lib/queries/cards";

// Standard MTG card aspect ratio: 63mm × 88mm
const CARD_ASPECT = 63 / 88;

interface CardTileProps {
  card: CardDto;
  mode: "carousel" | "list";
  onPress?: () => void;
  // Carousel-mode width (height is derived from aspect ratio)
  width?: number;
}

export function CardTile({ card, mode, onPress, width = 240 }: CardTileProps) {
  if (mode === "carousel") {
    return <CarouselTile card={card} onPress={onPress} width={width} />;
  }
  return <ListTile card={card} onPress={onPress} />;
}

// ---------- Carousel mode ----------
//
// Shows the card image full-size with the MTG card aspect ratio.
// Name + cost overlay at the bottom of the image (Pokemon-TCG-Pocket style).
// Border tinted with the card's color identity for a subtle MTG flavor.

function CarouselTile({
  card,
  onPress,
  width,
}: {
  card: CardDto;
  onPress?: () => void;
  width: number;
}) {
  const imageUri =
    card.default_art?.image_uris?.normal ??
    card.default_art?.image_uris?.large ??
    card.default_art?.image_uris?.small;

  const accent = colorIdentityAccent(
    card.default_face?.gameplay_property?.color_identity
  );
  const manaCost = card.default_face?.gameplay_property?.mana_cost;

  const rarity = card.default_art?.rarity;

  return (
    <Pressable
      onPress={onPress}
      style={{
        width,
        // Subtle mystical halo around every card. The CardCarousel layers a
        // stronger gold glow on the active card on top of this baseline.
        shadowColor: "#9B6BF2",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        ...(Platform.OS === "web"
          ? ({ boxShadow: "0 0 18px rgba(155, 107, 242, 0.25)" } as object)
          : {}),
      }}
    >
      <View
        style={{
          aspectRatio: CARD_ASPECT,
          borderWidth: 2,
          borderColor: accent,
          borderRadius: 16,
          overflow: "hidden",
          // Inner surface for the fallback path — image-loaded path is
          // covered by the <Image> below.
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
          // Fallback when no art — shows a styled "card back" with the name
          <View className="flex-1 items-center justify-center bg-elevated p-4">
            <Text
              className="text-center font-brand text-lg text-foreground"
              numberOfLines={3}
            >
              {card.name}
            </Text>
            {manaCost && (
              <View className="mt-2">
                <ManaCost cost={manaCost} size={16} />
              </View>
            )}
          </View>
        )}

        {/* Rarity indicator — small dot in the bottom-right corner.
            Common omitted (no dot) so common cards don't carry noise. */}
        {rarity && rarity !== "common" && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: rarityColor(rarity),
              borderWidth: 1,
              borderColor: "rgba(0, 0, 0, 0.5)",
            }}
          />
        )}
      </View>
    </Pressable>
  );
}

// Rarity pip colors — match the MTG community convention (silver/gold/orange).
function rarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "uncommon":
      return "#C0C0C0"; // silver
    case "rare":
      return "#D4B25E"; // gold (matches accent)
    case "mythic":
    case "mythic rare":
      return "#F97316"; // mythic orange
    case "special":
      return "#9B6BF2"; // mystical purple (matches primary)
    case "bonus":
      return "#EC4899"; // pink
    default:
      return "#6F6C66";
  }
}

// ---------- List mode ----------
//
// Compact horizontal row for search results / deck listings.
// Thumbnail on the left, meta on the right.

function ListTile({
  card,
  onPress,
}: {
  card: CardDto;
  onPress?: () => void;
}) {
  const thumbUri =
    card.default_art?.image_uris?.small ??
    card.default_art?.image_uris?.normal;

  const accent = colorIdentityAccent(
    card.default_face?.gameplay_property?.color_identity
  );
  const manaCost = card.default_face?.gameplay_property?.mana_cost;
  const typeLine = card.default_face?.full_type;
  const oracleText = card.default_face?.oracle_text;

  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row gap-3 rounded-lg border border-border bg-elevated p-3 hover:bg-border/30 active:bg-border/30"
    >
      {/* Thumbnail */}
      <View
        style={{
          width: 56,
          aspectRatio: CARD_ASPECT,
          borderWidth: 1,
          borderColor: accent,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-surface">
            <Text className="text-[10px] text-muted">No art</Text>
          </View>
        )}
      </View>

      {/* Meta */}
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text
            className="flex-1 font-semibold text-foreground"
            numberOfLines={1}
          >
            {card.name}
          </Text>
          {manaCost && <ManaCost cost={manaCost} size={14} />}
        </View>
        {typeLine && (
          <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
            {typeLine}
          </Text>
        )}
        {oracleText && (
          <Text
            className="mt-1 text-xs text-foreground/80"
            numberOfLines={2}
          >
            {oracleText}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------- Color identity accent ----------
//
// Returns a hex color for the border based on the card's color identity:
// - Single color: the corresponding MTG color
// - Multi-color: gold (accent) — same convention MTG uses for its gold cards
// - Colorless / no identity: neutral border color

function colorIdentityAccent(colors?: string[]): string {
  if (!colors || colors.length === 0) return "#2A2A33"; // border (colorless)
  if (colors.length > 1) return "#D4B25E"; // accent (gold for multi-color)

  // tailwind tokens (mirrors tailwind.config.js → mtg.*)
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
