// Hover-to-zoom card preview — web-only.
//
// A single floating preview pane lives at the app root. Card tiles call
// `show(card, anchor?)` on hover-in and `hide()` on hover-out via the
// `useHoverPreview` hook.
//
// Positioning:
//   - When the caller passes an `anchor` (viewport-relative {x, y, w, h}
//     of the hovered element), the overlay floats *next to* that element
//     — picking the side (right of element if there's room, otherwise
//     left) and aligning vertically with it (clamped to viewport edges).
//   - When no anchor is given, falls back to the legacy "pinned to the
//     top-right of the viewport" position. Other surfaces in the app
//     still use this when they haven't been ported to measure.
//
// Mobile is intentionally a no-op: there's no hover concept on touch
// devices, and `onHoverIn`/`onHoverOut` from RN's Pressable don't fire
// there anyway. The provider stays in the tree so consumers can call
// the hook unconditionally.

import { usePathname } from "expo-router";
import { Image } from "expo-image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dimensions,
  Platform,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { ManaCost } from "@/components/mana-cost";

// Standard MTG card aspect (63mm × 88mm).
const CARD_ASPECT = 63 / 88;
const PREVIEW_WIDTH = 340;
// Gap between the hovered element and the floating preview when anchored.
const ANCHOR_GAP = 16;
// Min margin between the preview and the viewport edges.
const VIEWPORT_MARGIN = 16;

export interface HoverPreviewCard {
  // Used as the React key so quick hover-flicks across tiles re-mount the
  // image rather than animating a half-loaded one.
  id: string;
  name: string;
  imageUri?: string;
  manaCost?: string;
  typeLine?: string;
  // Color identity for the border accent. Optional — falls back to neutral.
  colors?: string[];
}

// Viewport-relative rectangle of the element the preview should hug.
// Sourced from `View.measureInWindow` on the hovered Pressable.
export interface HoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreviewContextValue {
  show: (card: HoverPreviewCard, anchor?: HoverAnchor) => void;
  hide: () => void;
}

const PreviewContext = createContext<PreviewContextValue>({
  show: () => {},
  hide: () => {},
});

interface ActivePreview {
  card: HoverPreviewCard;
  anchor?: HoverAnchor;
}

export function HoverPreviewProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActivePreview | null>(null);
  const pathname = usePathname();

  const show = useCallback(
    (card: HoverPreviewCard, anchor?: HoverAnchor) =>
      setActive({ card, anchor }),
    []
  );
  const hide = useCallback(() => setActive(null), []);

  // Stranded-preview guards. The hovered Pressable normally fires
  // `onHoverOut` when the cursor leaves, but several real-world cases
  // skip that handler — the element unmounts (route nav, FlatList
  // virtualization), the cursor leaves the document, or the user
  // switches windows. Each of these would leave the preview stuck on
  // screen until they happen to re-hover something. These effects
  // catch every common case.

  // Route change → hide. Even within the same tab, navigating between
  // /cards and /decks unmounts the source under the cursor without
  // firing hover-out.
  useEffect(() => {
    setActive(null);
  }, [pathname]);

  // Web-only: cursor leaves the viewport entirely (out the top, into
  // dev tools, into another tab). RN's hover events don't fire on
  // document-level mouseleave.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onLeave = () => setActive(null);
    // visibilitychange catches tab switches; mouseleave catches the
    // cursor exiting via any edge of the window.
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, []);

  // Web-only: Escape dismisses, matching the convention for other
  // floating UI in the app.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<PreviewContextValue>(
    () => ({ show, hide }),
    [show, hide]
  );

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {Platform.OS === "web" && active && (
        <PreviewOverlay card={active.card} anchor={active.anchor} />
      )}
    </PreviewContext.Provider>
  );
}

export function useHoverPreview() {
  return useContext(PreviewContext);
}

/**
 * Helper that wraps useHoverPreview with an auto-hide on unmount.
 *
 * Returned `show` / `hide` mirror the provider's API but track whether
 * THIS component is currently the source of the preview. If the source
 * unmounts while still hovering (FlatList virtualizes the card out of
 * view, parent rerenders away the row, etc.), the cleanup fires `hide`
 * — without this the preview would sit there stranded until the user
 * happened to hover something else.
 *
 * Source components should use this instead of the raw `useHoverPreview`
 * when there's any chance the element could disappear mid-hover.
 */
export function useHoverPreviewWithCleanup() {
  const ctx = useContext(PreviewContext);
  const hoveringRef = useRef(false);

  const show = useCallback(
    (card: HoverPreviewCard, anchor?: HoverAnchor) => {
      hoveringRef.current = true;
      ctx.show(card, anchor);
    },
    [ctx]
  );
  const hide = useCallback(() => {
    hoveringRef.current = false;
    ctx.hide();
  }, [ctx]);

  useEffect(() => {
    return () => {
      // Only hide if we were the active source. If another component
      // took over the preview between our last show and our unmount,
      // we'd flag false here and leave their preview alone.
      if (hoveringRef.current) ctx.hide();
    };
    // ctx is stable enough for unmount cleanup; provider creates it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { show, hide };
}

function PreviewOverlay({
  card,
  anchor,
}: {
  card: HoverPreviewCard;
  anchor?: HoverAnchor;
}) {
  const accent = colorIdentityAccent(card.colors);
  // Subscribe to viewport changes so the preview re-clamps on resize.
  // useWindowDimensions is reactive in RN-Web; Dimensions.get is a
  // synchronous fallback if the hook returns stale 0 width during the
  // first render (rare, but seen in some Expo Web setups).
  const dims = useWindowDimensions();
  const viewportWidth =
    dims.width > 0 ? dims.width : Dimensions.get("window").width;
  const viewportHeight =
    dims.height > 0 ? dims.height : Dimensions.get("window").height;

  // Card visual size — the height matters for vertical clamping.
  const previewHeight = PREVIEW_WIDTH / CARD_ASPECT;

  const pos = useMemo(() => {
    // Legacy fallback — no anchor → top-right pinned (matches the
    // pre-anchor behavior so consumers that haven't been ported don't
    // shift).
    if (!anchor) {
      return { top: 88, right: 24, left: undefined as number | undefined };
    }

    // Horizontal: prefer the right side of the anchor; flip to the left
    // when there isn't room. If neither side fits, clamp against the
    // viewport edge so the preview is still visible (slightly overlaps
    // the anchor in that case — acceptable for very narrow viewports).
    const spaceRight =
      viewportWidth - (anchor.x + anchor.width) - VIEWPORT_MARGIN;
    const spaceLeft = anchor.x - VIEWPORT_MARGIN;
    let left: number;
    if (spaceRight >= PREVIEW_WIDTH + ANCHOR_GAP) {
      left = anchor.x + anchor.width + ANCHOR_GAP;
    } else if (spaceLeft >= PREVIEW_WIDTH + ANCHOR_GAP) {
      left = anchor.x - PREVIEW_WIDTH - ANCHOR_GAP;
    } else {
      // Center horizontally as a last resort (very narrow viewport).
      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          viewportWidth - PREVIEW_WIDTH - VIEWPORT_MARGIN,
          anchor.x + (anchor.width - PREVIEW_WIDTH) / 2
        )
      );
    }

    // Vertical: align the preview's top with the anchor's top by default,
    // then clamp so it doesn't run off the top/bottom of the viewport.
    const idealTop = anchor.y;
    const maxTop = viewportHeight - previewHeight - VIEWPORT_MARGIN;
    const top = Math.max(VIEWPORT_MARGIN, Math.min(maxTop, idealTop));

    return { top, left, right: undefined as number | undefined };
  }, [anchor, viewportWidth, viewportHeight, previewHeight]);

  return (
    <View
      pointerEvents="none"
      // position: "fixed" isn't in RN's style typing but RN-Web passes it
      // through to the underlying div. Cast keeps TS quiet.
      style={
        {
          position: "fixed",
          top: pos.top,
          left: pos.left,
          right: pos.right,
          width: PREVIEW_WIDTH,
          zIndex: 9999,
        } as object
      }
    >
      <View
        style={{
          aspectRatio: CARD_ASPECT,
          borderRadius: 20,
          borderWidth: 2,
          borderColor: accent,
          overflow: "hidden",
          backgroundColor: "#1C1C24",
          shadowColor: "#000",
          shadowOpacity: 0.55,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        {card.imageUri ? (
          <Image
            key={card.id}
            source={{ uri: card.imageUri }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={100}
            cachePolicy="memory-disk"
          />
        ) : (
          <View className="flex-1 items-center justify-center p-6">
            <Text
              className="text-center font-brand text-2xl text-foreground"
              numberOfLines={3}
            >
              {card.name}
            </Text>
            {card.manaCost && (
              <View className="mt-3">
                <ManaCost cost={card.manaCost} size={20} />
              </View>
            )}
            {card.typeLine && (
              <Text className="mt-2 text-center text-sm text-muted">
                {card.typeLine}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
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
