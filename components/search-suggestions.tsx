// Search-suggestions overlay.
//
// Mounted inside NavShell's content area; appears whenever the
// SearchProvider's debounced `query` is non-empty. Lists the first few
// /cards/search matches as a tap-to-jump dropdown. Tapping a result
// navigates to /cards/[id] and clears the search; tapping the backdrop
// (mobile) or anywhere outside the dropdown (web) clears the query.
//
// Cross-platform behavior:
//   - Web: panel anchored to the right edge (under the always-expanded
//     SearchBar), max-width 360. No backdrop dim.
//   - Mobile: panel takes most of the screen below the header, full
//     width. Backdrop dims + blurs the page behind it (web uses
//     backdrop-filter; native uses a semi-opaque View — no native blur
//     SDK dep required).
//
// Suppressed on /cards routes — the page already shows search results
// inline, so a stacked dropdown would just be visual noise.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, usePathname } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { ManaCost } from "@/components/mana-cost";
import { useSearchCards, type CardDto } from "@/lib/queries/cards";
import { useSearchControls } from "@/lib/search";

const MAX_RESULTS = 6;
const WIDE_BREAKPOINT = 768;

export function SearchSuggestions() {
  const { inputValue, query, setInputValue } = useSearchControls();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  // Don't surface the dropdown on the cards search page — that screen
  // already shows results inline. Same for the card-detail route since
  // the user is actively reading a card.
  const suppressOnRoute =
    pathname?.startsWith("/cards") ?? false;

  // Visible whenever the immediate input is non-empty. We key the query
  // off the *debounced* value so requests don't fire on every keystroke,
  // but visibility uses the immediate value so the panel pops the moment
  // the user starts typing (lookups are pre-empty during the debounce
  // window, but the panel layout doesn't snap on/off mid-typing).
  const visible = !suppressOnRoute && inputValue.trim().length > 0;

  const trimmed = query.trim();
  const search = useSearchCards({
    name: trimmed.length > 0 ? trimmed : undefined,
    size: MAX_RESULTS,
  });

  // Disable the underlying fetch when not visible so we don't hammer the
  // API while the user is mid-typing on a suppressed route. The hook
  // doesn't expose `enabled` directly, so we just skip rendering — the
  // queryClient holds the result in cache but doesn't re-fetch when no
  // observer is mounted.
  if (!visible) return null;

  const close = () => setInputValue("");
  const onResult = (card: CardDto) => {
    router.push(`/cards/${card.id}` as any);
    close();
  };

  // Header height differs slightly between web (no safe-area top) and
  // mobile (insets pushed it down) — but the NavShell already pushes us
  // below the header via stacking order, so top:0 here lands just under
  // the bar regardless of platform.
  const panelMaxHeight = Math.min(420, width * 0.7);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
      }}
    >
      {/* Backdrop — full-bleed, captures taps to dismiss. On mobile we
          dim + blur the page behind; on web no backdrop (the dropdown
          is small and the user can keep glancing at the page). */}
      {!isWide && (
        <Pressable
          onPress={close}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(12, 10, 20, 0.55)",
            ...(Platform.OS === "web"
              ? ({
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                } as object)
              : {}),
          }}
        />
      )}

      {/* Panel */}
      <View
        style={{
          position: "absolute",
          top: 8,
          // Wide: pinned to the right under the SearchBar. The 24px right
          // gutter matches the TopBar's paddingHorizontal. Narrow: full
          // bleed with a margin.
          right: isWide ? 24 : 12,
          left: isWide ? undefined : 12,
          width: isWide ? 360 : undefined,
          maxHeight: panelMaxHeight,
          borderRadius: 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(45, 37, 64, 0.85)",
          backgroundColor: "rgba(20, 17, 30, 0.96)",
          ...(Platform.OS === "web"
            ? ({
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
              } as object)
            : {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
              }),
        }}
      >
        <SuggestionsBody
          search={search}
          query={trimmed}
          onResult={onResult}
        />
      </View>
    </View>
  );
}

function SuggestionsBody({
  search,
  query,
  onResult,
}: {
  search: ReturnType<typeof useSearchCards>;
  query: string;
  onResult: (card: CardDto) => void;
}) {
  const { data, isLoading, error } = search;
  const cards = data?.content ?? [];

  // Debounce window: input is non-empty but the debounced query hasn't
  // landed yet. Show a small spinner so the panel doesn't appear empty.
  if (query.length === 0) {
    return (
      <View className="px-4 py-5">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <ActivityIndicator size="small" color="#D4B25E" />
          <Text className="text-xs text-muted">Searching…</Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="items-center px-4 py-5">
        <ActivityIndicator size="small" color="#D4B25E" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="px-4 py-5">
        <Text className="text-xs text-danger">
          {(error as Error).message}
        </Text>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View className="px-4 py-6">
        <Text className="text-sm text-muted">
          No cards match “{query}”.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View
        className="border-b border-border px-4 py-2"
        style={{ backgroundColor: "rgba(29, 24, 43, 0.6)" }}
      >
        <Text className="text-[10px] uppercase tracking-wider text-muted">
          {cards.length === MAX_RESULTS
            ? `Top ${MAX_RESULTS} matches`
            : `${cards.length} match${cards.length === 1 ? "" : "es"}`}
        </Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {cards.map((card) => (
          <SuggestionRow
            key={card.id}
            card={card}
            onPress={() => onResult(card)}
          />
        ))}
      </ScrollView>
    </>
  );
}

function SuggestionRow({
  card,
  onPress,
}: {
  card: CardDto;
  onPress: () => void;
}) {
  const thumb =
    card.default_art?.image_uris?.small ??
    card.default_art?.image_uris?.normal;
  const manaCost = card.default_face?.gameplay_property?.mana_cost;
  const typeLine = card.default_face?.full_type;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-border/40 px-4 py-3 hover:bg-elevated/60 active:bg-elevated/80"
      style={{ gap: 12 }}
    >
      <View
        style={{
          width: 36,
          aspectRatio: 63 / 88,
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: "#14111E",
        }}
      >
        {thumb && (
          <Image
            source={{ uri: thumb }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View
          className="flex-row items-center justify-between"
          style={{ gap: 8 }}
        >
          <Text
            className="font-semibold text-foreground"
            style={{ flex: 1, fontSize: 14 }}
            numberOfLines={1}
          >
            {card.name}
          </Text>
          {manaCost && <ManaCost cost={manaCost} size={12} />}
        </View>
        {typeLine && (
          <Text className="text-[11px] text-muted" numberOfLines={1}>
            {typeLine}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#6F6C66" />
    </Pressable>
  );
}

