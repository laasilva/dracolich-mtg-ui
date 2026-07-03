// Web-only max-width wrapper for a page's main content column.
//
// Pages drop this inside their ScrollView (or directly inside their root
// View) around the *main content only* — overlays like the card detail
// panel or bottom sheet should sit OUTSIDE this wrapper so they keep
// reaching the viewport edges on wide monitors.
//
// On mobile (iOS/Android) it's a transparent passthrough — the maxWidth
// is gated behind Platform.OS === "web".

import { Platform, View } from "react-native";
import type { ViewProps, ViewStyle } from "react-native";

// Same cap as the nav-shell's TopBar uses, so chrome and content align.
export const WEB_MAX_CONTENT_WIDTH = 1280;

export function PageContent({
  children,
  style,
  ...rest
}: ViewProps) {
  return (
    <View
      {...rest}
      style={[styles.base, isWeb ? styles.constrained : null, style]}
    >
      {children}
    </View>
  );
}

const isWeb = Platform.OS === "web";

// No flex:1 in the base — PageContent is most often dropped inside a
// ScrollView's contentContainer where flex:1 fights the content-sized
// container. Pages that need flex:1 (rare) can pass it via the style prop.
const styles: { base: ViewStyle; constrained: ViewStyle } = {
  base: {
    width: "100%",
  },
  constrained: {
    maxWidth: WEB_MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
};
