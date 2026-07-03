// Pokemon-TCG-Pocket-style swipeable card stack.
//
// Showpiece interactions:
// - Pan gesture with kinetic-inertia projection → fast multi-card scrolls
// - Tap a side card to navigate to it
// - Auto-fading position indicator below the stack
// - Mouse-tilt parallax on the active card (web)
// - Soft gold glow on the active card (iOS / web; Android no-op)
// - Haptic feedback on commits (mobile only — no-op on web)
//
// Source of truth for the active card is a SharedValue (`indexSV`), updated
// atomically on the UI thread. JS state mirrors it (one frame later) so the
// render window can shift accordingly.

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue
} from "react-native-reanimated";

import { CardBack } from "@/components/card-back";
import { CardTile } from "@/components/card-tile";
import { CarouselIndicator } from "@/components/carousel-indicator";
import type { CardDto } from "@/lib/queries/cards";

// "Deck-flip" mode: cards on this side of the active are face-down. As they
// cross the active position they flip face-up. "none" (default) = all face-up.
type BackFacingSide = "left" | "right" | "none";

interface CardCarouselProps {
  cards: CardDto[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onCardPress?: (card: CardDto) => void;
  // Width of the active card. Defaults to ~65% of viewport, capped at 280px.
  cardWidth?: number;
  // Show the auto-fading dots/progress-bar position indicator below the stack.
  showIndicator?: boolean;
  // Render cards on this side as face-down (flip as they cross to active).
  // Default "none" = all cards face-up (search-results UX).
  backFacingSide?: BackFacingSide;
}

// Cards rendered relative to the active index. The window must be wide
// enough that any "fast scroll" multi-card jump still has the target card
// already mounted at commit time — otherwise the new center pops in a
// frame later when JS state catches up and re-renders.
//
// ORDER MATTERS: sorted by |offset| descending so the active card (offset 0)
// is rendered last. iOS doesn't reliably honor animated zIndex from
// Reanimated worklets (zIndex changes per frame don't propagate to UIView
// layer order), so it falls back to render order: later children sit on top.
// With this order, the active card is always above the pile and fan.
const VISIBLE_OFFSETS = [-5, 5, -4, 4, -3, 3, -2, 2, -1, 1, 0];

const SPACING_FACTOR = 0.5;
const SWIPE_COMMIT_FRACTION = 0.18;
const VELOCITY_DECAY = 0.15;
const COMMIT_SPRING = { damping: 20, stiffness: 180 };
const SNAP_BACK_SPRING = { damping: 16, stiffness: 220 };
const EDGE_RESISTANCE = 0.3;

// Max tilt of the active card (degrees) under full mouse offset.
const PARALLAX_TILT = 14;

// Active-card gold glow — soft halo via shadow. iOS/web only; Android can't
// color shadows, so it's a no-op there.
const GLOW_COLOR = "#D4B25E";
const GLOW_MAX_OPACITY = 0.3;
const GLOW_MAX_RADIUS = 28;

// Side cards get a black darkening overlay to look like they're in the
// active card's shadow. Active card has 0 overlay; opacity scales with
// distance from center.
const SHADOW_OVERLAY_MAX_OPACITY = 0.25;

// Card radius — must match CardTile's rounded-2xl (16px) so the overlay
// clips to the card's silhouette.
const CARD_RADIUS = 10;

// Pile-mode geometry. When backFacingSide is set, cards beyond the active
// position on that side collapse into a stacked face-down "draw pile"
// instead of fanning out.
// - PILE_DEPTH_Y_STAGGER: each card behind the top of the pile drops this
//   many px, giving the stack visible depth without spreading horizontally.
// - PILE_VISIBLE_DEPTH: how many cards into the pile to render solidly
//   before fading them out (keeps the stack from rendering 50 deep).
const PILE_DEPTH_Y_STAGGER = 3;
const PILE_VISIBLE_DEPTH = 4;

// Haptics are mobile-only. expo-haptics on web throws → wrap with Platform check.
const isMobile = Platform.OS === "ios" || Platform.OS === "android";
function tickHaptic() {
  if (!isMobile) return;
  Haptics.selectionAsync().catch(() => {});
}
function thudHaptic() {
  if (!isMobile) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function CardCarousel({
  cards,
  initialIndex = 0,
  onIndexChange,
  onCardPress,
  cardWidth: cardWidthProp,
  showIndicator = true,
  backFacingSide = "none",
}: CardCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = cardWidthProp ?? Math.min(screenWidth * 0.65, 280);
  const cardHeight = cardWidth * (88 / 63);
  const spacing = cardWidth * SPACING_FACTOR;

  // SV is the source of truth (UI thread); JS state mirrors it for rendering.
  const indexSV = useSharedValue(initialIndex);
  const translateX = useSharedValue(0);
  const [index, setIndex] = useState(initialIndex);

  // Parallax tilt — mouse-driven on web; idle (0) on mobile until we wire gyro.
  // Range: -1..1 horizontal/vertical offset of cursor from wrapper center.
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  // Mirror SV → JS state. ~1 frame lag is acceptable; the render window has
  // a buffer to cover it.
  useAnimatedReaction(
    () => indexSV.value,
    (current, prev) => {
      if (prev !== null && current !== prev) {
        runOnJS(setIndex)(current);
      }
    }
  );

  const lastIndex = cards.length - 1;

  const notifyChange = useCallback(
    (newIndex: number) => {
      onIndexChange?.(newIndex);
    },
    [onIndexChange]
  );

  // Tap-to-navigate (for side cards). Updates SV directly, then springs the
  // visual back to 0 from a compensating offset so cards animate smoothly to
  // their new resting positions.
  const navigateTo = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= cards.length) return;
      const current = indexSV.value;
      if (targetIndex === current) return;
      const delta = targetIndex - current;
      indexSV.value = targetIndex;
      translateX.value = translateX.value + delta * spacing;
      translateX.value = withSpring(0, COMMIT_SPRING);
      setIndex(targetIndex);
      onIndexChange?.(targetIndex);
      if (Math.abs(delta) > 1) thudHaptic();
      else tickHaptic();
    },
    [cards.length, spacing, onIndexChange, indexSV, translateX]
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      let dx = e.translationX;
      const i = indexSV.value;
      if ((i === 0 && dx > 0) || (i === lastIndex && dx < 0)) {
        dx = dx * EDGE_RESISTANCE;
      }
      translateX.value = dx;
    })
    .onEnd((e) => {
      const dx = e.translationX;
      const vx = e.velocityX;
      const i = indexSV.value;

      const projection = dx + vx * VELOCITY_DECAY;
      const direction = Math.sign(projection);
      const projectedSlots = Math.abs(projection) / spacing;

      let desiredSlots = 0;
      if (projectedSlots >= SWIPE_COMMIT_FRACTION) {
        desiredSlots = direction * Math.max(1, Math.round(projectedSlots));
      }

      const newIndex = Math.max(
        0,
        Math.min(lastIndex, i - desiredSlots)
      );
      const delta = newIndex - i;

      if (delta !== 0) {
        indexSV.value = newIndex;
        translateX.value = dx + delta * spacing;
        translateX.value = withSpring(0, COMMIT_SPRING);
        runOnJS(notifyChange)(newIndex);
        if (Math.abs(delta) > 1) {
          runOnJS(thudHaptic)();
        } else {
          runOnJS(tickHaptic)();
        }
      } else {
        translateX.value = withSpring(0, SNAP_BACK_SPRING);
      }
    });

  // Web mouse-tilt: native DOM listeners on the wrapper's underlying div.
  // Why not RN-Web's <View onMouseMove>: that prop is silently flaky inside
  // a GestureDetector — sometimes events don't propagate. Native listeners
  // attached via ref bypass React's synthetic-event layer entirely.
  const wrapperRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = wrapperRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.getBoundingClientRect !== "function") return;

    const onMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      // Direct write — no withTiming. mousemove fires at 60+ Hz, so the
      // cursor itself smooths the input; adding even 30ms of damping shows
      // up as visible lag because every sample restarts the tween.
      tiltX.value = Math.max(-1, Math.min(1, dx));
      tiltY.value = Math.max(-1, Math.min(1, dy));
    };
    const onLeave = () => {
      tiltX.value = withSpring(0);
      tiltY.value = withSpring(0);
    };

    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, [tiltX, tiltY]);

  if (cards.length === 0) return null;

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          ref={wrapperRef}
          className="w-full items-center justify-center"
          style={{
            height: cardHeight + 32,
            ...(Platform.OS === "web"
              ? ({
                  touchAction: "pan-y",
                  userSelect: "none",
                  cursor: "grab",
                } as object)
              : {}),
          }}
        >
          {VISIBLE_OFFSETS.map((offset) => {
            const cardIndex = index + offset;
            if (cardIndex < 0 || cardIndex >= cards.length) return null;
            const card = cards[cardIndex];
            const isCenter = offset === 0;
            const onPress = isCenter
              ? onCardPress
                ? () => onCardPress(card)
                : undefined
              : () => navigateTo(cardIndex);
            return (
              <CardInStack
                key={card.id}
                card={card}
                cardIndex={cardIndex}
                indexSV={indexSV}
                translateX={translateX}
                tiltX={tiltX}
                tiltY={tiltY}
                spacing={spacing}
                cardWidth={cardWidth}
                onPress={onPress}
                backFacingSide={backFacingSide}
              />
            );
          })}
        </View>
      </GestureDetector>
      {showIndicator && (
        <CarouselIndicator
          currentIndex={index}
          total={cards.length}
          indexSV={indexSV}
          translateX={translateX}
          spacing={spacing}
          onSelect={navigateTo}
        />
      )}
    </View>
  );
}

interface CardInStackProps {
  card: CardDto;
  cardIndex: number;
  indexSV: SharedValue<number>;
  translateX: SharedValue<number>;
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  spacing: number;
  cardWidth: number;
  onPress?: () => void;
  backFacingSide: BackFacingSide;
}

function CardInStack({
  card,
  cardIndex,
  indexSV,
  translateX,
  tiltX,
  tiltY,
  spacing,
  cardWidth,
  onPress,
  backFacingSide,
}: CardInStackProps) {
  const cardHeight = cardWidth * (88 / 63);

  // 1 = right is the pile, -1 = left is the pile, 0 = no pile (all face-up fan).
  const flipSign =
    backFacingSide === "right" ? 1 : backFacingSide === "left" ? -1 : 0;

  // Layout: asymmetric in pile mode.
  //   "Open side" (sideEffective <= 0): regular fan, face-up
  //   "Draw transition" (0 < sideEffective <= 1): smoothly slides between
  //     the active position and the top of the pile, flipping mid-way
  //   "Pile" (sideEffective > 1): stacked at fixed X with a Y stagger to
  //     show pile depth, face-down
  // Where sideEffective = flipSign * effective (positive when card is on
  // the pile-facing side).
  const animatedStyle = useAnimatedStyle(() => {
    const offset = cardIndex - indexSV.value;
    const effective = offset + translateX.value / spacing;
    const absEff = Math.abs(effective);
    const proximity = Math.max(0, 1 - absEff);

    const sideEffective = flipSign === 0 ? -1 : flipSign * effective;

    let tx: number;
    let ty: number;
    let scale: number;
    let rotateZ_deg: number;
    let cardOpacity: number;

    if (sideEffective <= 0) {
      // Open side OR flip disabled — original fan layout
      tx = effective * spacing;
      ty = 0;
      scale = interpolate(absEff, [0, 1, 2], [1, 0.86, 0.74], "clamp");
      rotateZ_deg = effective * 6;
      cardOpacity = interpolate(
        absEff,
        [0, 1, 2, 2.6],
        [1, 0.85, 0.45, 0],
        "clamp"
      );
    } else if (sideEffective <= 1) {
      // Draw transition — slides smoothly from center (sideEff=0) to pile (sideEff=1)
      tx = effective * spacing;
      ty = 0;
      scale = 1;
      rotateZ_deg = 0;
      cardOpacity = 1;
    } else {
      // In the pile — fixed X, Y staggered to show stack depth
      tx = flipSign * spacing;
      ty = (sideEffective - 1) * PILE_DEPTH_Y_STAGGER;
      scale = 1;
      rotateZ_deg = 0;
      // Fade out cards deeper than PILE_VISIBLE_DEPTH so the stack doesn't
      // render 50 deep
      cardOpacity = interpolate(
        sideEffective,
        [1, PILE_VISIBLE_DEPTH, PILE_VISIBLE_DEPTH + 1],
        [1, 1, 0],
        "clamp"
      );
    }

    // Parallax tilt — only the active card; fades with proximity
    const parallaxRotateY = tiltX.value * PARALLAX_TILT * proximity;
    const parallaxRotateX = -tiltY.value * PARALLAX_TILT * proximity;

    // Flip rotation: face-up at center, face-down on the pile side.
    // Linear from 0° at sideEff=0 to 180° at sideEff>=1.
    const flipRotation =
      flipSign === 0
        ? 0
        : Math.min(180, Math.max(0, sideEffective * 180));

    return {
      transform: [
        { perspective: 800 },
        { translateX: tx },
        { translateY: ty },
        { scale },
        { rotateZ: `${rotateZ_deg}deg` },
        { rotateX: `${parallaxRotateX}deg` },
        // Parallax + flip both rotate around Y; combined here.
        { rotateY: `${parallaxRotateY + flipRotation}deg` },
      ],
      opacity: cardOpacity,
      zIndex: 1000 - Math.round(absEff * 100),
      shadowColor: GLOW_COLOR,
      shadowOpacity: GLOW_MAX_OPACITY * proximity,
      shadowRadius: GLOW_MAX_RADIUS * proximity,
      shadowOffset: { width: 0, height: 0 },
    };
  });

  // Front face visibility — opacity-based, NOT backfaceVisibility.
  // Why: RN's backfaceVisibility doesn't reliably hide faces without
  // transform-style: preserve-3d, which RN doesn't expose. Computing the
  // visibility ourselves in a worklet is bulletproof cross-platform.
  const frontFaceStyle = useAnimatedStyle(() => {
    if (flipSign === 0) return { opacity: 1 };
    const offset = cardIndex - indexSV.value;
    const effective = offset + translateX.value / spacing;
    const sideEffective = flipSign * effective;
    const flipRotation = Math.min(180, Math.max(0, sideEffective * 180));
    // Front faces viewer when rotation < 90° (we're in the first half-flip)
    return { opacity: flipRotation < 90 ? 1 : 0 };
  });

  const backFaceStyle = useAnimatedStyle(() => {
    if (flipSign === 0) return { opacity: 0 };
    const offset = cardIndex - indexSV.value;
    const effective = offset + translateX.value / spacing;
    const sideEffective = flipSign * effective;
    const flipRotation = Math.min(180, Math.max(0, sideEffective * 180));
    return { opacity: flipRotation >= 90 ? 1 : 0 };
  });

  const overlayStyle = useAnimatedStyle(() => {
    const offset = cardIndex - indexSV.value;
    const effective = offset + translateX.value / spacing;
    const proximity = Math.max(0, 1 - Math.abs(effective));
    return { opacity: (1 - proximity) * SHADOW_OVERLAY_MAX_OPACITY };
  });

  const showBackFace = flipSign !== 0;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: cardWidth,
          height: cardHeight,
        },
        animatedStyle,
      ]}
    >
      {/* Front face — visible when flipRotation < 90° (or flip disabled) */}
      <Animated.View style={[StyleSheet.absoluteFillObject, frontFaceStyle]}>
        <CardTile
          card={card}
          mode="carousel"
          width={cardWidth}
          onPress={onPress}
        />
      </Animated.View>

      {/* Back face — pre-rotated 180° so it appears upright once the parent
          rotates past 90°. Only rendered when flip mode is on. Pressable so
          taps still navigate when the back is showing. */}
      {showBackFace && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { transform: [{ rotateY: "180deg" }] },
            backFaceStyle,
          ]}
        >
          <Pressable onPress={onPress}>
            <CardBack width={cardWidth} />
          </Pressable>
        </Animated.View>
      )}

      {/* Darkening overlay — sits flat on top, dims whichever face is showing */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "#000", borderRadius: CARD_RADIUS },
          overlayStyle,
        ]}
      />
    </Animated.View>
  );
}
