// Renders a mana-cost string like "{2}{W}{U}" as a row of symbol icons.
// Falls back to the raw text token while the symbol is loading or on error,
// so a missing symbol never blanks out the card.

import { Image } from "expo-image";
import { Text, View } from "react-native";

import { useSymbol } from "@/lib/queries/symbols";

const SYMBOL_RE = /\{[^}]+\}/g;

interface ManaCostProps {
  cost?: string;
  size?: number;
  // alt text on the wrapping View — useful for screen readers
  accessibilityLabel?: string;
}

export function ManaCost({ cost, size = 14, accessibilityLabel }: ManaCostProps) {
  if (!cost) return null;
  const symbols = cost.match(SYMBOL_RE) ?? [];
  if (symbols.length === 0) return null;

  return (
    <View
      className="flex-row items-center"
      style={{ gap: 2 }}
      accessibilityLabel={accessibilityLabel ?? cost}
    >
      {symbols.map((s, i) => (
        <ManaSymbol key={`${s}-${i}`} symbol={s} size={size} />
      ))}
    </View>
  );
}

function ManaSymbol({ symbol, size }: { symbol: string; size: number }) {
  const { data } = useSymbol(symbol);

  if (!data?.svg_uri) {
    // Loading or error → keep the raw token so the cost stays readable
    return (
      <Text
        className="text-muted"
        style={{ fontSize: size, lineHeight: size * 1.2 }}
      >
        {symbol}
      </Text>
    );
  }

  return (
    <Image
      source={{ uri: data.svg_uri }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory-disk"
      accessibilityLabel={data.plaintext}
    />
  );
}
