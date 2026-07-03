// Art-tile mosaic for deck contents.
//
// Each card is a single tile whose face is the card's `art_crop` (just the
// painting — no frame, no rules text). Name + count + mana cost sit in a
// subtle bottom overlay so the art owns the visual.
//
// Tiles tilt toward the cursor on web (same parallax trick as the carousel),
// lift on press, and glow gold around the edges when active. Multi-column
// wrap layout so a 60-card section fills the column densely instead of
// scrolling forever as a single list.
//
// Tap a tile → calls onCardPress with the card id; the parent opens the
// shared CardDetailPanel/Sheet.

import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ManaCost } from "@/components/mana-cost";
import type { DeckCardDto } from "@/lib/queries/decks";

interface DeckArtMosaicProps {
  cards: DeckCardDto[];
  onCardPress?: (cardId: string) => void;
  // Width to size tiles for. Caller passes the column width so tiles fit
  // cleanly without overflow.
  containerWidth: number;
}

// Tile shapes — art_crop is roughly 4:3 horizontal (~1.37:1).
const TILE_ASPECT = 1.37;
const TILE_GAP = 8;
// Target tile widths — we pick the smallest that fits >= 2 per row.
const TILE_TARGET_WIDTHS = {
  narrow: 150, // mobile
  wide: 180,   // wide viewport columns
};

export function DeckArtMosaic({
  cards,
  onCardPress,
  containerWidth,
}: DeckArtMosaicProps) {
  // Pick tile width: compute how many fit per row at the target size, then
  // distribute the remaining space so tiles fill the row exactly.
  const target =
    containerWidth < 500
      ? TILE_TARGET_WIDTHS.narrow
      : TILE_TARGET_WIDTHS.wide;
  const perRow = Math.max(2, Math.floor(containerWidth / (target + TILE_GAP)));
  const tileWidth = Math.floor(
    (containerWidth - TILE_GAP * (perRow - 1)) / perRow
  );

  return (
    <View
      className="flex-row flex-wrap"
      style={{ gap: TILE_GAP }}
    >
      {cards.map((card) => (
        <ArtTile
          key={`${card.card_id}-${card.card_category ?? "MAIN"}`}
          card={card}
          width={tileWidth}
          onPress={onCardPress ? () => onCardPress(card.card_id) : undefined}
        />
      ))}
    </View>
  );
}

interface ArtTileProps {
  card: DeckCardDto;
  width: number;
  onPress?: () => void;
}

const MAX_TILT_DEG = 8;
const ENTER_SPRING = { damping: 18, stiffness: 220 };
const LEAVE_SPRING = { damping: 14, stiffness: 180 };

function ArtTile({ card, width, onPress }: ArtTileProps) {
  const art = card.image_uri?.art_crop ?? card.image_uri?.small;
  const tilePixelHeight = width / TILE_ASPECT;

  // tiltX/tiltY range -1..1 — cursor offset from tile center. lift > 0 when
  // the cursor is anywhere over the tile (so the tile rises slightly on hover).
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const lift = useSharedValue(0);

  const wrapperRef = useRef<View>(null);

  // Web-only: native DOM mouse listeners on the tile div. Same pattern we
  // use in the carousel — RN-Web synthetic onMouseMove is flaky inside
  // gesture-laden parents, native listeners are bulletproof.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = wrapperRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.getBoundingClientRect !== "function") return;

    const onMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      tiltX.value = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      tiltY.value = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
    };
    const onEnter = () => {
      lift.value = withSpring(1, ENTER_SPRING);
    };
    const onLeave = () => {
      tiltX.value = withTiming(0, { duration: 180 });
      tiltY.value = withTiming(0, { duration: 180 });
      lift.value = withSpring(0, LEAVE_SPRING);
    };

    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, [tiltX, tiltY, lift]);

  const animatedStyle = useAnimatedStyle(() => {
    const rotateY = tiltX.value * MAX_TILT_DEG;
    const rotateX = -tiltY.value * MAX_TILT_DEG;
    const scale = 1 + lift.value * 0.04;
    const translateY = -lift.value * 4;
    return {
      transform: [
        { perspective: 700 },
        { translateY },
        { scale },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
      ],
      shadowColor: "#D4B25E",
      shadowOpacity: lift.value * 0.55,
      shadowRadius: lift.value * 18,
      shadowOffset: { width: 0, height: 0 },
    };
  });

  // Border accent based on card color identity.
  const accent = aggregateColorAccent(card.colors);

  return (
    <Animated.View
      ref={wrapperRef}
      style={[
        {
          width,
          height: tilePixelHeight,
          borderRadius: 10,
          // Web: hide the focus outline + signal a clickable area.
          ...(Platform.OS === "web"
            ? ({ cursor: "pointer" } as object)
            : {}),
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          borderRadius: 10,
          overflow: "hidden",
          borderWidth: 1.5,
          borderColor: accent,
          backgroundColor: "#1C1C24",
        }}
      >
        {art ? (
          <Image
            source={{ uri: art }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}

        {/* Bottom name + cost band */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 8,
            paddingVertical: 6,
            backgroundColor: "rgba(15,15,18,0.82)",
          }}
        >
          <Text
            className="font-semibold text-foreground"
            numberOfLines={1}
            style={{ fontSize: 12 }}
          >
            {card.name}
          </Text>
          <View className="mt-0.5 flex-row items-center justify-between">
            <Text className="text-[10px] uppercase tracking-wider text-muted">
              {(card.count ?? 1) > 1 ? `×${card.count}` : ""}
            </Text>
            {card.mana_cost && <ManaCost cost={card.mana_cost} size={10} />}
          </View>
        </View>

        {/* Top-right count badge for multiples — easy to scan when looking
            for which cards have 4-ofs in a Standard deck. */}
        {(card.count ?? 1) > 1 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              minWidth: 22,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 11,
              backgroundColor: "rgba(212, 178, 94, 0.95)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: "#0F0F12",
              }}
            >
              ×{card.count}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function aggregateColorAccent(colors?: string[]): string {
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
