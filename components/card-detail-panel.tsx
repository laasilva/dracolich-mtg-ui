// Wide-viewport card detail — slides in from the right edge as a panel,
// over the search results. The search results stay interactable on the
// left so the user can keep browsing without losing context.
//
// State machine:
//   cardId === null + nothing mounted   → render nothing
//   cardId !== null                     → mount + animate open
//   cardId changes (non-null → non-null) → swap content in place, no animation
//   cardId becomes null                 → animate closed, then unmount
//
// Mobile gets a different surface (bottom sheet, step 6). On narrow
// viewports the parent should navigate to /cards/[id] instead of
// mounting this component.

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CardDetailContent } from "@/components/card-detail-content";

interface CardDetailPanelProps {
  cardId: string | null;
  onClose: () => void;
  // Fixed width of the slide-in panel. Default 440px feels right at typical
  // desktop sizes; bump for ultrawide.
  width?: number;
}

const OPEN_SPRING = { damping: 22, stiffness: 200 };
const CLOSE_DURATION_MS = 220;

export function CardDetailPanel({
  cardId,
  onClose,
  width = 440,
}: CardDetailPanelProps) {
  // What's actually mounted right now. Diverges from `cardId` only during
  // the closing animation (still mounted while animating out, then unmounted).
  const [renderedCardId, setRenderedCardId] = useState<string | null>(cardId);

  // 0 = fully off-screen right, 1 = fully visible.
  const open = useSharedValue(cardId ? 1 : 0);

  useEffect(() => {
    if (cardId) {
      // Open or swap. If renderedCardId differs, swap content instantly
      // (no animation between cards) and spring open if not already.
      setRenderedCardId(cardId);
      open.value = withSpring(1, OPEN_SPRING);
    } else {
      // Close. Animate out, then unmount.
      open.value = withTiming(
        0,
        { duration: CLOSE_DURATION_MS },
        (finished) => {
          if (finished) {
            runOnJS(setRenderedCardId)(null);
          }
        }
      );
    }
  }, [cardId, open]);

  // translateX = (1 - open) * width — off-screen right when closed.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - open.value) * width }],
  }));

  if (renderedCardId === null) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width,
          backgroundColor: "#15151A",
          borderLeftColor: "#2A2A33",
          borderLeftWidth: 1,
          zIndex: 50,
          // Soft shadow on the left edge so the panel reads as floating
          // above the search results.
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: -8, height: 0 },
        },
        animatedStyle,
      ]}
    >
      {/* Header with close button */}
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Text className="text-xs uppercase tracking-wider text-muted">
          Card detail
        </Text>
        <Pressable
          onPress={onClose}
          className="rounded-full p-2 hover:bg-border/40 active:bg-border/40"
          accessibilityLabel="Close card detail"
        >
          <Ionicons name="close" size={20} color="#E8E6E3" />
        </Pressable>
      </View>

      <CardDetailContent cardId={renderedCardId} />
    </Animated.View>
  );
}
