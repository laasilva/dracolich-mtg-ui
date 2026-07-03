// Placeholder MTG card back. Generic styling — not the official Wizards back.
// Swap to a real asset (image / SVG) when one is available.

import { Text, View } from "react-native";

const CARD_ASPECT = 63 / 88;

export function CardBack({ width }: { width: number }) {
  return (
    <View
      style={{
        width,
        aspectRatio: CARD_ASPECT,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: "#000",
          borderRadius: 16,
          backgroundColor: "#2A1810",
          padding: 16,
        }}
      >
        <Text
          style={{
            color: "#D4B25E",
            fontSize: 22,
            fontWeight: "900",
            textAlign: "center",
            letterSpacing: 3,
          }}
        >
          MAGIC
        </Text>
        <Text
          style={{
            color: "#D4B25E",
            fontSize: 9,
            textAlign: "center",
            letterSpacing: 2,
            marginTop: 4,
            opacity: 0.8,
          }}
        >
          THE GATHERING
        </Text>
        <View
          style={{
            marginTop: 16,
            width: 50,
            height: 1,
            backgroundColor: "#D4B25E",
            opacity: 0.4,
          }}
        />
      </View>
    </View>
  );
}
