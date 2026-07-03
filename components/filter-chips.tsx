// Reusable toggleable filter chip + preset rows for MTG color identity and
// card types. Used in the Cards search screen quick-filter row; the same
// `Chip` will be reused on Decks/Sets when those screens land.
//
// Horizontal scroll so the row never wraps. Tap to toggle. Selected chips
// take the accent color; unselected get a subtle border/elevated bg.

import { Pressable, ScrollView, Text, View } from "react-native";

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  // Optional swatch on the left — used for color-identity chips.
  swatchColor?: string;
}

export function Chip({ label, selected, onPress, swatchColor }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center rounded-full border px-3 py-1.5 ${
        selected
          ? "border-accent bg-accent/20"
          : "border-border bg-elevated hover:bg-border/40 active:bg-border/40"
      }`}
    >
      {swatchColor && (
        <View
          className="mr-1.5 h-3 w-3 rounded-full border border-black/30"
          style={{ backgroundColor: swatchColor }}
        />
      )}
      <Text
        className={`text-sm ${selected ? "text-accent" : "text-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- Presets ----------

// Exported so other surfaces (e.g. the wizard's build page) can render
// their own filter rows without redeclaring the lists.
export const MTG_COLORS = [
  { code: "W", label: "White", color: "#F8F6E8" },
  { code: "U", label: "Blue", color: "#5C9EE5" },
  { code: "B", label: "Black", color: "#2D2A30" },
  { code: "R", label: "Red", color: "#D14B3D" },
  { code: "G", label: "Green", color: "#5BA66B" },
] as const;

export const CARD_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Land",
  "Planeswalker",
  "Battle",
] as const;

interface ChipRowProps {
  selected: Set<string>;
  onToggle: (key: string) => void;
}

export function ColorFilterChips({ selected, onToggle }: ChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-6"
    >
      {MTG_COLORS.map((c) => (
        <Chip
          key={c.code}
          label={c.label}
          swatchColor={c.color}
          selected={selected.has(c.code)}
          onPress={() => onToggle(c.code)}
        />
      ))}
    </ScrollView>
  );
}

export function TypeFilterChips({ selected, onToggle }: ChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-6"
    >
      {CARD_TYPES.map((t) => (
        <Chip
          key={t}
          label={t}
          selected={selected.has(t)}
          onPress={() => onToggle(t)}
        />
      ))}
    </ScrollView>
  );
}

// Small helper to toggle a key in/out of a Set immutably.
// (Pass the result to setState.)
export function toggleSetKey<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}
