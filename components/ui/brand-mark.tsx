// Dracolich brand mark — the small gradient tile + optional wordmark used
// in the navbar and on the dashboard. v0's original is a rotated gradient
// square with a "D" centered on top.
//
// We use expo-linear-gradient (already a dep). The rotation is achieved
// with a static transform on the tile + a counter-rotated inner so the
// background stays diagonal but the "D" stays upright.

import { LinearGradient } from "expo-linear-gradient";
import { Platform, Text, View } from "react-native";

interface BrandMarkProps {
  size?: number;
  showWordmark?: boolean;
  // Wordmark text color override. Defaults to the purple-glow treatment v0
  // uses on the navbar. Pass `"foreground"` for plain (e.g. drawer header).
  wordmarkTone?: "glow" | "foreground";
}

export function BrandMark({
  size = 40,
  showWordmark = false,
  wordmarkTone = "glow",
}: BrandMarkProps) {
  return (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <View
        style={{
          width: size,
          height: size,
          position: "relative",
        }}
      >
        {/* Tilted gradient backdrop — purple → gold */}
        <View
          style={{
            position: "absolute",
            inset: 0,
            transform: [{ rotate: "6deg" }],
            borderRadius: size * 0.22,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            colors={["#9B6BF2", "#D4B25E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        </View>
        {/* Upright inner square with the "D" */}
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#0C0A14",
            borderRadius: size * 0.22,
            margin: 2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            className="font-brand font-bold text-primary"
            style={{ fontSize: size * 0.5, lineHeight: size * 0.6 }}
          >
            D
          </Text>
        </View>
      </View>
      {showWordmark && (
        <Text
          className={
            wordmarkTone === "glow"
              ? "font-brand text-xl text-primary"
              : "font-brand text-xl text-foreground"
          }
          style={
            wordmarkTone === "glow" && Platform.OS === "web"
              ? ({ textShadow: "0 0 14px rgba(155, 107, 242, 0.55)" } as object)
              : undefined
          }
        >
          Dracolich
        </Text>
      )}
    </View>
  );
}
