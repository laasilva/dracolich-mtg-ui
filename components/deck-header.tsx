// Cinematic deck-detail header.
//
// Uses the commander's `art_crop` (or the first card's, as fallback) as a
// full-bleed banner background, dimmed with a vertical gradient so the
// overlaid title + tags read cleanly. Deck name renders large in the
// brand serif over the gradient — feels like the cover of a book, not a
// list-page heading.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import type { DeckCardDto, DeckDto } from "@/lib/queries/decks";

interface DeckHeaderProps {
  deck: DeckDto;
}

// Hero height — wide enough to look cinematic but not eat half the page.
const HERO_HEIGHT = 220;

export function DeckHeader({ deck }: DeckHeaderProps) {
  const bannerUri = pickBannerUri(deck);
  const accent = aggregateColorAccent(deck.colors);

  return (
    <View
      style={{
        height: HERO_HEIGHT,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: "#15151A",
        // Soft accent glow around the hero — gives the banner the same
        // "active card" feel as the carousel.
        shadowColor: accent,
        shadowOpacity: 0.35,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      {/* Background art — anchored to the top since the painted-art portion
          of an MTG card lives in the upper half. */}
      {bannerUri ? (
        <Image
          source={{ uri: bannerUri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          contentPosition="top"
          transition={250}
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: "#1C1C24" }}
        >
          <Text className="font-brand text-2xl text-muted">
            {deck.format ?? "Deck"}
          </Text>
        </View>
      )}

      {/* Two-stop gradient: subtle top vignette + heavy bottom for text. */}
      <LinearGradient
        colors={[
          "rgba(15,15,18,0.35)",
          "rgba(15,15,18,0.05)",
          "rgba(15,15,18,0.65)",
          "rgba(15,15,18,0.92)",
        ]}
        locations={[0, 0.35, 0.7, 1]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      />

      {/* Bottom overlay: title + meta row. */}
      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 16,
        }}
      >
        <Text
          className="font-brand text-foreground"
          style={{
            fontSize: 32,
            lineHeight: 36,
            // White text + soft drop shadow so it reads regardless of the
            // art behind it.
            textShadowColor: "rgba(0,0,0,0.6)",
            textShadowRadius: 8,
          }}
          numberOfLines={2}
        >
          {deck.name}
        </Text>

        <View
          className="mt-2 flex-row flex-wrap items-center"
          style={{ gap: 8 }}
        >
          {deck.format && <Tag label={deck.format} variant="accent" />}
          {deck.status && deck.status !== "READY" && (
            <Tag label={deck.status} />
          )}
          {deck.visibility && deck.visibility !== "PUBLIC" && (
            <Tag label={deck.visibility} />
          )}
          <ColorIdentity colors={deck.colors} />
          {deck.favorites_count != null && deck.favorites_count > 0 && (
            <View className="flex-row items-center" style={{ gap: 3 }}>
              <Ionicons name="heart" size={13} color="#D14B3D" />
              <Text className="text-xs text-foreground">
                {deck.favorites_count.toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------- Helpers ----------

function pickBannerUri(deck: DeckDto): string | undefined {
  const commander = deck.commander?.[0];
  const fromCommander = imageFor(commander);
  if (fromCommander) return fromCommander;
  // Fallback: art from the first card.
  return imageFor(deck.cards?.[0]);
}

function imageFor(card?: DeckCardDto): string | undefined {
  if (!card?.image_uri) return undefined;
  // art_crop is wide-aspect just-the-painting; perfect for a banner.
  return (
    card.image_uri.art_crop ?? card.image_uri.large ?? card.image_uri.normal
  );
}

function Tag({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: "neutral" | "accent";
}) {
  const cls =
    variant === "accent"
      ? "rounded-full border border-accent bg-accent/30 px-2.5 py-0.5"
      : "rounded-full border border-white/30 bg-black/40 px-2.5 py-0.5";
  const textCls =
    variant === "accent"
      ? "text-[10px] font-semibold uppercase tracking-widest text-accent"
      : "text-[10px] uppercase tracking-widest text-foreground";
  return (
    <View className={cls}>
      <Text className={textCls}>{label.replace(/_/g, " ")}</Text>
    </View>
  );
}

function ColorIdentity({ colors }: { colors?: string[] }) {
  if (!colors || colors.length === 0) {
    return <Tag label="Colorless" />;
  }
  return (
    <View className="flex-row" style={{ gap: 4 }}>
      {colors.map((c) => (
        <View
          key={c}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colorHex(c),
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.5)",
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

function aggregateColorAccent(colors?: string[]): string {
  if (!colors || colors.length === 0) return "#2A2A33";
  if (colors.length > 1) return "#D4B25E";
  return colorHex(colors[0]);
}
