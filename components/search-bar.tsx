// Reusable expand-on-tap search bar.
//
// Controlled component: `value` + `onChangeText` are the source of truth.
// Caller is responsible for debouncing (when the bar lives in the nav header,
// the SearchProvider in `lib/search.tsx` does this centrally).
//
// Collapsed state: 44px icon button. Tap to expand into a full-width input
// with a clear/close affordance on the right. Two-stage trailing button:
// - while value has content → tap clears (keeps the bar open)
// - while value is empty    → tap collapses back to the icon
//
// Used identically by the Cards, Decks, and Sets screens via the nav header.

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  TextInput,
  useWindowDimensions,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  // Skip the collapse-to-icon affordance — render expanded immediately.
  alwaysExpanded?: boolean;
  // Maximum expanded width. Defaults to filling the row up to 480px.
  maxWidth?: number;
  // Focus the input on mount when alwaysExpanded. No effect when collapsed.
  autoFocus?: boolean;
  // Observer: fires when the bar transitions between collapsed/expanded.
  // Useful for parents that want to hide other header content while search
  // is open (e.g., the brand title on the mobile header).
  onExpandedChange?: (expanded: boolean) => void;
}

const COLLAPSED_WIDTH = 44;
const HEIGHT = 44;
const EXPAND_SPRING = { damping: 18, stiffness: 200 };

// Theme tokens — kept inline rather than via className so they work on
// Reanimated wrappers (NativeWind v4 doesn't auto-cssInterop Animated.View).
const BG = "#1C1C24";
const BORDER = "#2A2A33";
const FG = "#E8E6E3";
const MUTED = "#9A9AA8";
const ACCENT = "#D4B25E";

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search",
  alwaysExpanded = false,
  maxWidth,
  autoFocus = false,
  onExpandedChange,
}: SearchBarProps) {
  const [expanded, setExpanded] = useState(alwaysExpanded);
  const inputRef = useRef<TextInput>(null);
  const { width: screenWidth } = useWindowDimensions();

  const resolvedMaxWidth = maxWidth ?? Math.min(screenWidth - 32, 480);

  // Notify parent on expansion changes.
  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  // Optional autoFocus when starting expanded.
  useEffect(() => {
    if (autoFocus && alwaysExpanded) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [autoFocus, alwaysExpanded]);

  // 0 = collapsed (icon only), 1 = fully expanded.
  const open = useSharedValue(alwaysExpanded ? 1 : 0);

  const expand = () => {
    if (expanded) return;
    setExpanded(true);
    open.value = withSpring(1, EXPAND_SPRING);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const finishCollapse = () => {
    setExpanded(false);
  };

  const collapseOrClear = () => {
    // Tap with content → clear (stays open). Tap empty → collapse.
    if (value.length > 0) {
      onChangeText("");
      return;
    }
    if (alwaysExpanded) return;
    inputRef.current?.blur();
    open.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishCollapse)();
    });
  };

  // Container width animates between collapsed (icon-sized) and full.
  const containerStyle = useAnimatedStyle(() => ({
    width: COLLAPSED_WIDTH + open.value * (resolvedMaxWidth - COLLAPSED_WIDTH),
  }));

  // Input + trailing X fade in/out with the expansion.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: open.value,
  }));

  const hasValue = value.length > 0;

  return (
    <Animated.View
      style={[
        {
          height: HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: BG,
          borderColor: BORDER,
          borderWidth: 1,
          borderRadius: HEIGHT / 2,
          overflow: "hidden",
        },
        containerStyle,
      ]}
    >
      <Pressable
        onPress={expanded ? undefined : expand}
        style={{
          height: HEIGHT,
          width: COLLAPSED_WIDTH,
          alignItems: "center",
          justifyContent: "center",
        }}
        accessibilityLabel={expanded ? undefined : "Open search"}
        accessibilityRole={expanded ? undefined : "button"}
      >
        <Ionicons
          name="search"
          size={20}
          color={hasValue ? ACCENT : MUTED}
        />
      </Pressable>

      {expanded && (
        <Animated.View
          style={[
            {
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
            },
            contentStyle,
          ]}
        >
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={MUTED}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => inputRef.current?.blur()}
            style={{
              flex: 1,
              height: HEIGHT,
              fontSize: 16,
              color: FG,
              paddingVertical: 0,
              ...(Platform.OS === "web"
                ? ({ outlineStyle: "none" } as object)
                : {}),
            }}
          />
          {/* Trailing button — clears the input when there's content, or
              collapses the bar back to the icon when empty. When the bar is
              always-expanded (web), the "close" affordance is useless when
              empty (nothing to collapse, nothing to clear) so we skip it
              entirely in that case. */}
          {(hasValue || !alwaysExpanded) && (
            <Pressable
              onPress={collapseOrClear}
              style={{
                height: HEIGHT,
                width: COLLAPSED_WIDTH,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityLabel={hasValue ? "Clear search" : "Close search"}
              accessibilityRole="button"
            >
              <Ionicons
                name={hasValue ? "close-circle" : "close"}
                size={20}
                color={MUTED}
              />
            </Pressable>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}
