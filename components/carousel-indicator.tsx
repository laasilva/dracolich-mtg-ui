// Carousel position indicator with live tracking + auto-fade.
//
// Reads the carousel's SharedValues (indexSV + translateX) directly so the
// active highlight follows the live drag, not just the committed index.
// Each dot derives its own width/color from its proximity to the live
// position — gives a smooth gold "spotlight" that slides between dots as
// you drag.
//
// Why inline styles instead of className: NativeWind v4 doesn't auto-register
// cssInterop for Animated.View, so className is silently dropped on web.
// Inline styles work on both RN-Web and native.
//
// Auto-fade: visible at full opacity on commit, fades to IDLE_OPACITY after
// IDLE_TIMEOUT of no further commits. Gives the discoverability hint without
// permanent visual noise.

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

interface CarouselIndicatorProps {
  currentIndex: number; // JS state — drives fade timer + counter text
  total: number;
  indexSV: SharedValue<number>; // committed index (UI-thread source of truth)
  translateX: SharedValue<number>; // live drag (px)
  spacing: number; // px between adjacent slots — for live-index math
  onSelect?: (index: number) => void; // tap-to-jump (dots mode only)
}

const DOTS_THRESHOLD = 15;
const IDLE_TIMEOUT = 3000;
const VISIBLE_OPACITY = 1;
const IDLE_OPACITY = 0.35;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 600;

// Theme tokens — kept in sync with tailwind.config.js. Inlined because
// interpolateColor needs literal color strings on the UI thread.
const COLOR_BORDER = "#2A2A33";
const COLOR_ACCENT = "#D4B25E";
const COLOR_MUTED = "#9A9AA8";

const DOT_BASE_SIZE = 6;
const DOT_ACTIVE_WIDTH = 16;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CarouselIndicator({
  currentIndex,
  total,
  indexSV,
  translateX,
  spacing,
  onSelect,
}: CarouselIndicatorProps) {
  // Auto-fade timer driven by JS-side commit changes.
  const opacity = useSharedValue(VISIBLE_OPACITY);
  useEffect(() => {
    opacity.value = withTiming(VISIBLE_OPACITY, { duration: FADE_IN_MS });
    const t = setTimeout(() => {
      opacity.value = withTiming(IDLE_OPACITY, { duration: FADE_OUT_MS });
    }, IDLE_TIMEOUT);
    return () => clearTimeout(t);
  }, [currentIndex, opacity]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (total <= 1) return null;

  if (total <= DOTS_THRESHOLD) {
    return (
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            gap: 6,
          },
          containerStyle,
        ]}
      >
        {Array.from({ length: total }, (_, i) => (
          <Dot
            key={i}
            dotIndex={i}
            indexSV={indexSV}
            translateX={translateX}
            spacing={spacing}
            onPress={onSelect ? () => onSelect(i) : undefined}
          />
        ))}
      </Animated.View>
    );
  }

  return (
    <ProgressBar
      currentIndex={currentIndex}
      total={total}
      indexSV={indexSV}
      translateX={translateX}
      spacing={spacing}
      containerStyle={containerStyle}
    />
  );
}

function Dot({
  dotIndex,
  indexSV,
  translateX,
  spacing,
  onPress,
}: {
  dotIndex: number;
  indexSV: SharedValue<number>;
  translateX: SharedValue<number>;
  spacing: number;
  onPress?: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    // Live index = committed index minus the live drag, normalized by slot width.
    // Drag-left (translateX<0) advances forward, so subtract it.
    const liveIndex = indexSV.value - translateX.value / spacing;
    const distance = Math.abs(liveIndex - dotIndex);
    // proximity = 1 at the active slot, 0 at distance ≥ 1
    const proximity = Math.max(0, 1 - distance);
    const width = DOT_BASE_SIZE + (DOT_ACTIVE_WIDTH - DOT_BASE_SIZE) * proximity;
    return {
      width,
      backgroundColor: interpolateColor(
        proximity,
        [0, 1],
        [COLOR_BORDER, COLOR_ACCENT]
      ),
    };
  });

  const baseStyle = {
    height: DOT_BASE_SIZE,
    borderRadius: DOT_BASE_SIZE / 2,
  };

  if (onPress) {
    return (
      <AnimatedPressable
        // hitSlop gives a 22px click target around the 6px dot
        hitSlop={8}
        onPress={onPress}
        style={[baseStyle, animatedStyle]}
      />
    );
  }
  return <Animated.View style={[baseStyle, animatedStyle]} />;
}

function ProgressBar({
  currentIndex,
  total,
  indexSV,
  translateX,
  spacing,
  containerStyle,
}: {
  currentIndex: number;
  total: number;
  indexSV: SharedValue<number>;
  translateX: SharedValue<number>;
  spacing: number;
  containerStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    const liveIndex = indexSV.value - translateX.value / spacing;
    const progress = total > 1 ? liveIndex / (total - 1) : 0;
    const clamped = Math.max(0, Math.min(1, progress));
    return { width: `${clamped * 100}%` };
  });

  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
          gap: 12,
        },
        containerStyle,
      ]}
    >
      <Text style={{ minWidth: 56, fontSize: 12, color: COLOR_MUTED }}>
        {currentIndex + 1} / {total}
      </Text>
      <View
        style={{
          width: 200,
          height: 4,
          borderRadius: 2,
          backgroundColor: COLOR_BORDER,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            { height: "100%", borderRadius: 2, backgroundColor: COLOR_ACCENT },
            fillStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}
