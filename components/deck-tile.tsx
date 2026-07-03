// Single-deck visualization. Card-shaped (matches MTG aspect 63/88) so it
// reuses the same visual rhythm as CardTile in carousel mode — the Decks
// browse page renders two horizontal rows of these.
//
// Cover image priority:
//   1. First commander's art (`commander[0].image_uri`)
//   2. First card's art (`cards[0].image_uri`)
//   3. Styled placeholder with the format name
//
// Bottom-of-card overlay carries the deck name + format + a row of small
// color-identity pips so a deck is recognizable at a glance.

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, Pressable, Text, View } from "react-native";

import type { DeckCardDto, DeckDto } from "@/lib/queries/decks";

const CARD_ASPECT = 63 / 88;

interface DeckTileProps {
  deck: DeckDto;
  onPress?: () => void;
  // Width drives the height via the card aspect ratio.
  width?: number;
}

export function DeckTile({ deck, onPress, width = 180 }: DeckTileProps) {
  const cover = pickCoverImage(deck);
  // The backend's `colors` field is sometimes empty even on decks that
  // clearly have colored cards (commander/cards present but the
  // aggregate hasn't been recomputed). Fall back to a client-side
  // aggregate over commander + cards so the tile never reads as
  // "Colorless" when the deck plainly isn't.
  const resolvedColors = resolveDeckColors(deck);
  const accent = aggregateColorAccent(resolvedColors);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width,
        // Mystical purple halo. Tinted to the accent color when the deck is
        // multi-color so the highlight matches the border.
        shadowColor: accent === "#D4B25E" ? "#D4B25E" : "#9B6BF2",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
        ...(Platform.OS === "web"
          ? ({
              boxShadow: `0 0 22px ${accent === "#D4B25E" ? "rgba(212, 178, 94, 0.30)" : "rgba(155, 107, 242, 0.30)"}`,
            } as object)
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
          backgroundColor: "#14111E",
        }}
      >
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          // No usable artwork — solid styled background with the format text.
          <View className="flex-1 items-center justify-center bg-elevated p-3">
            <Text className="text-center text-xs uppercase tracking-widest text-muted">
              {deck.format ?? "Deck"}
            </Text>
          </View>
        )}

        {/* Bottom overlay — real linear gradient (transparent → solid) so the
            title text reads against dark or light art without the flat band
            covering more art than necessary. */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(12, 10, 20, 0)", "rgba(12, 10, 20, 0.92)"]}
          locations={[0, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 10,
            paddingTop: 28,
            paddingBottom: 8,
          }}
        >
          <Text
            className="font-brand text-foreground"
            numberOfLines={1}
            style={{ fontSize: 14, fontWeight: "700" }}
          >
            {deck.name}
          </Text>
          <View className="mt-1 flex-row items-center justify-between">
            <Text className="text-[10px] uppercase tracking-wider text-accent">
              {deck.format ?? ""}
            </Text>
            <ColorPips colors={resolvedColors} />
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

// ---------- Helpers ----------

// Aggregate color identity from commander + cards. Preserves the WUBRG
// canonical order so "WU" decks render their pips in the same order
// across the app regardless of the source data ordering.
const WUBRG: ReadonlyArray<string> = ["W", "U", "B", "R", "G"];

function resolveDeckColors(deck: DeckDto): string[] {
  // Backend-provided field wins when populated — it accounts for
  // commander color identity rules that pure card aggregation misses
  // (e.g. cards with non-mana hybrid symbols).
  if (deck.colors && deck.colors.length > 0) return deck.colors;

  const collected = new Set<string>();
  for (const c of deck.commander ?? []) {
    for (const col of c.colors ?? []) collected.add(col);
  }
  for (const c of deck.cards ?? []) {
    for (const col of c.colors ?? []) collected.add(col);
  }
  return WUBRG.filter((c) => collected.has(c));
}

function pickCoverImage(deck: DeckDto): string | undefined {
  const commander = deck.commander?.[0];
  const fromCommander = pickFromImageMap(commander?.image_uri);
  if (fromCommander) return fromCommander;
  const first = deck.cards?.[0];
  return pickFromImageMap(first?.image_uri);
}

function pickFromImageMap(map?: Record<string, string>): string | undefined {
  if (!map) return undefined;
  // Prefer art_crop (just the artwork, no frame) since the tile is small
  // and the frame would be unreadable. Fall back to normal/large/small.
  return map.art_crop ?? map.normal ?? map.large ?? map.small;
}

// Tiny circles representing each color in the deck's color identity.
function ColorPips({ colors }: { colors?: string[] }) {
  if (!colors || colors.length === 0) {
    return (
      <Text className="text-[10px] text-muted">Colorless</Text>
    );
  }
  return (
    <View className="flex-row" style={{ gap: 3 }}>
      {colors.map((c) => (
        <View
          key={c}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colorHex(c),
            borderWidth: 0.5,
            borderColor: "rgba(0,0,0,0.4)",
          }}
        />
      ))}
    </View>
  );
}

function colorHex(code: string): string {
  switch (code) {
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

// Aggregate accent: single color → that color; multi → gold; none → border.
function aggregateColorAccent(colors?: string[]): string {
  if (!colors || colors.length === 0) return "#2A2A33";
  if (colors.length > 1) return "#D4B25E";
  return colorHex(colors[0]);
}

// Re-export the type so callers can import everything from this module.
export type { DeckCardDto };
