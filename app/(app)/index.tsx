// Dashboard / landing page.
//
// Layout — modelled after the v0 design exploration:
//   wide (≥1024px): three-column grid.
//     left 2 cols → "Your recent decks" + "Popular decks" sections,
//                   each rendering DeckTile in a wrapping grid.
//     right 1 col → side rail: Card of the Day + Stats panel.
//   medium (768-1023px): same content, but the side rail drops below the
//                         deck sections (single column).
//   narrow (<768px): everything stacks vertically.
//
// Data sources are all real backend endpoints (no mocks):
//   - "Your recent decks" → GET /decks/ (auth-only; hidden for anon visitors)
//   - "Popular decks"     → GET /decks/popular
//   - "Card of the day"   → GET /cards search sorted by release_date DESC, first hit.
//                            Stable across page reloads on the same day (no
//                            randomness — we get the same newest card until
//                            the next card sync ships, which is fine for a
//                            "spotlight" pattern).
//   - Stats panel         → counts derived from the queries above (deck count,
//                            commander count, favorites total).

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { DeckTile } from "@/components/deck-tile";
import { PageContent } from "@/components/page-content";
import { useAuth } from "@/lib/auth";
import { useNewestCards, type CardDto } from "@/lib/queries/cards";
import {
  useMyDecks,
  usePopularDecks,
  type DeckDto,
} from "@/lib/queries/decks";

const DECK_TILE_WIDTH = 180;
const WIDE_BREAKPOINT = 1024;
const TABLET_BREAKPOINT = 768;

export default function Dashboard() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const isTablet = width >= TABLET_BREAKPOINT;

  // Dashboard only shows finished decks in "Your recent decks". Drafts
  // (wizards the user exited without finalizing) live under /account/decks
  // in a dedicated Drafts section so they don't clutter the recents rail.
  const myDecks = useMyDecks({ size: 6, status: "READY_TO_PLAY" });
  const popularDecks = usePopularDecks({ size: 6 });
  const featuredCardQuery = useNewestCards(1);
  const featuredCard = featuredCardQuery.data?.content?.[0];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 64 }}>
      {/* Page-level horizontal padding so content doesn't kiss the viewport
          edge on mobile. PageContent itself caps the column width on web
          but doesn't add gutters; we add them here. */}
      <PageContent style={{ paddingHorizontal: 24 }}>
        {/* ---------- Hero ---------- */}
        <View className="pt-8" style={{ gap: 12 }}>
          {/* {!isTablet && <BrandMark size={56} />} */}
          <Hero username={user?.username} viewportWidth={width} />
          <Text className="text-muted" style={{ fontSize: 15 }}>
            {user
              ? "What are we building today?"
              : "Build, analyze, and refine your Magic: The Gathering decks with AI assistance."}
          </Text>
        </View>

        {/* ---------- Quick actions ---------- */}
        <View
          className="mt-8 flex-row"
          style={{ gap: 16, flexWrap: isTablet ? "nowrap" : "wrap" }}
        >
          <QuickActionCard
            href="/decks/new"
            icon="add-circle-outline"
            title="New deck"
            description="Start a deck from scratch"
            variant="primary"
            wide={isTablet}
          />
          <QuickActionCard
            href="/cards"
            icon="library-outline"
            title="Explore cards"
            description="Browse the full library"
            variant="default"
            wide={isTablet}
          />
          <QuickActionCard
            href="/decks"
            icon="layers-outline"
            title="Browse decks"
            description="Find community inspiration"
            variant="default"
            wide={isTablet}
          />
        </View>

        {/* ---------- Main grid ---------- */}
        <View
          className="mt-10 flex-row"
          style={{ gap: 32, flexWrap: isWide ? "nowrap" : "wrap" }}
        >
          {/* Left column — deck sections */}
          <View style={{ flexGrow: 1, flexBasis: isWide ? 0 : "100%" }}>
            {user && (
              <Section
                icon="time-outline"
                iconColor="#9B6BF2"
                title="Your recent decks"
                href="/account/decks"
                linkLabel="See all"
              >
                <DeckGrid
                  decks={myDecks.data?.content ?? []}
                  loading={myDecks.isLoading}
                  emptyHint="You haven't built any decks yet. Tap “New deck” above to start."
                  tileWidth={DECK_TILE_WIDTH}
                />
              </Section>
            )}
            <Section
              icon="trending-up"
              iconColor="#D4B25E"
              title="Popular decks"
              href="/decks"
              linkLabel="Explore"
              spacingTop={user ? 32 : 0}
            >
              <DeckGrid
                decks={popularDecks.data?.content ?? []}
                loading={popularDecks.isLoading}
                emptyHint="Popular decks will appear here as the community grows."
                tileWidth={DECK_TILE_WIDTH}
              />
            </Section>
          </View>

          {/* Right column — side rail with featured card + stats */}
          <View
            style={{
              flexShrink: 0,
              width: isWide ? 320 : "100%",
              gap: 24,
            }}
          >
            <CardOfTheDay card={featuredCard} loading={featuredCardQuery.isLoading} />
            {user && (
              <StatsPanel
                deckCount={myDecks.data?.totalElements ?? 0}
                commanderCount={
                  myDecks.data?.content?.filter(
                    (d) => d.format === "COMMANDER"
                  ).length ?? 0
                }
                favoritesTotal={
                  myDecks.data?.content?.reduce(
                    (sum, d) => sum + (d.favorites_count ?? 0),
                    0
                  ) ?? 0
                }
              />
            )}
          </View>
        </View>
      </PageContent>
    </ScrollView>
  );
}

// ---------- Hero with v0-style purple-glow + primary username ----------
//
// Font scales with viewport so the long anonymous string "Welcome to
// Dracolich" (19 chars in Cinzel Bold) still fits on one line at iPhone
// widths. The signed-in version is split across two Text nodes inside a
// flex-row, so a long username can wrap to its own line gracefully — the
// "Welcome," half stays short and doesn't need to shrink as aggressively.

function Hero({
  username,
  viewportWidth,
}: {
  username?: string;
  viewportWidth: number;
}) {
  // Tier-based sizing. The anonymous bound is tighter because the string
  // is fixed-length and needs to fit unbroken; the signed-in bound can be
  // slightly larger because flex-wrap handles overflow.
  const anonFontSize =
    viewportWidth >= 1024 ? 40 : viewportWidth >= 768 ? 36 : viewportWidth >= 400 ? 30 : 26;
  const signedInFontSize =
    viewportWidth >= 1024 ? 40 : viewportWidth >= 768 ? 36 : 32;

  const glow =
    Platform.OS === "web"
      ? ({ textShadow: "0 0 24px rgba(155, 107, 242, 0.55)" } as object)
      : null;

  if (username) {
    return (
      <View className="flex-row flex-wrap items-baseline" style={{ gap: 12 }}>
        <Text
          className="font-brand text-primary"
          style={{ fontSize: signedInFontSize, fontWeight: "700", ...glow }}
        >
          Welcome,
        </Text>
        <Text
          className="font-brand text-accent"
          style={{ fontSize: signedInFontSize, fontWeight: "700" }}
        >
          {username}
        </Text>
      </View>
    );
  }
  return (
    <Text
      className="font-brand text-primary"
      numberOfLines={1}
      adjustsFontSizeToFit
      style={{ fontSize: anonFontSize, fontWeight: "700", ...glow }}
    >
      Welcome to Dracolich
    </Text>
  );
}

// ---------- Quick action ----------

function QuickActionCard({
  href,
  icon,
  title,
  description,
  variant,
  wide,
}: {
  href: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  variant: "primary" | "default" | "glow";
  wide: boolean;
}) {
  const isPrimary = variant === "primary";
  const isGlow = variant === "glow";

  // Per-platform glow on the AI / glow tile so it reads as "special".
  const glowStyle = isGlow
    ? {
        shadowColor: "#D4B25E",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        ...(Platform.OS === "web"
          ? ({ boxShadow: "0 0 24px rgba(212, 178, 94, 0.35)" } as object)
          : {}),
      }
    : {};

  const bgClass = isPrimary
    ? "bg-primary"
    : "bg-elevated/60 border border-border";
  const titleColor = isPrimary ? "text-white" : "text-foreground";
  const descColor = isPrimary ? "text-white/80" : "text-muted";
  const iconColor = isPrimary ? "#FFFFFF" : isGlow ? "#D4B25E" : "#9B6BF2";

  return (
    <Link href={href as any} asChild>
      <Pressable
        className={`flex-row items-center rounded-xl p-4 ${bgClass}`}
        // Flat single style object — expo-router <Link asChild> forwards the
        // child style through and React DOM rejects style arrays as
        // CSSStyleDeclaration indices.
        style={{
          flexBasis: wide ? 0 : "100%",
          flexGrow: 1,
          gap: 14,
          ...glowStyle,
        }}
      >
        <View
          className={`items-center justify-center rounded-lg ${
            isPrimary ? "bg-white/20" : "bg-primary/15"
          }`}
          style={{ width: 44, height: 44 }}
        >
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text className={`font-semibold ${titleColor}`} style={{ fontSize: 15 }}>
            {title}
          </Text>
          <Text className={descColor} style={{ fontSize: 12 }}>
            {description}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

// ---------- Section wrapper ----------

function Section({
  icon,
  iconColor,
  title,
  href,
  linkLabel,
  spacingTop = 0,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  title: string;
  // Optional — sections without a meaningful "See all" target render
  // the header without the link.
  href?: string;
  linkLabel?: string;
  spacingTop?: number;
  children: React.ReactNode;
}) {
  // Imperative navigation rather than <Link asChild><Pressable> — the
  // nested-Pressable pattern silently breaks on native iOS (the inner
  // Pressable swallows the tap before it reaches the outer Link). Same
  // workaround used by DeckGrid below.
  const router = useRouter();

  return (
    <View style={{ marginTop: spacingTop }}>
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Ionicons name={icon} size={20} color={iconColor} />
          <Text
            className="font-brand text-foreground"
            style={{ fontSize: 20, fontWeight: "600" }}
          >
            {title}
          </Text>
        </View>
        {href && linkLabel && (
          <Pressable
            onPress={() => router.push(href as any)}
            className="flex-row items-center"
            style={{ gap: 4 }}
          >
            <Text className="text-sm text-muted hover:text-primary">
              {linkLabel}
            </Text>
            <Ionicons name="arrow-forward" size={14} color="#A39F93" />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

// ---------- Deck grid ----------
// 2-3 tiles per row, wrapping, no horizontal scroll. This is closer to v0's
// grid than the horizontal-snap-scroll the dashboard previously used.

function DeckGrid({
  decks,
  loading,
  emptyHint,
  tileWidth,
}: {
  decks: DeckDto[];
  loading: boolean;
  emptyHint: string;
  tileWidth: number;
}) {
  // Imperative navigation rather than <Link asChild><Pressable><DeckTile/>
  // — DeckTile is already a Pressable internally, and on native the inner
  // Pressable captures the touch before it reaches the outer one, leaving
  // the tile visually responsive but functionally inert. Passing onPress
  // straight to DeckTile is the pattern the standalone /decks page uses
  // and the only one that works on iOS/Android.
  const router = useRouter();

  if (loading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color="#9B6BF2" />
      </View>
    );
  }
  if (decks.length === 0) {
    return (
      <View className="items-center justify-center rounded-xl border border-dashed border-border py-10">
        <Text className="text-sm text-muted" style={{ textAlign: "center", paddingHorizontal: 16 }}>
          {emptyHint}
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap" style={{ gap: 16 }}>
      {decks.map((deck) => (
        <DeckTile
          key={deck.id}
          deck={deck}
          width={tileWidth}
          onPress={() => router.push(`/decks/${deck.id}` as any)}
        />
      ))}
    </View>
  );
}

// ---------- Card of the Day ----------

function CardOfTheDay({
  card,
  loading,
}: {
  card: CardDto | undefined;
  loading: boolean;
}) {
  const imageUri =
    card?.default_art?.image_uris?.normal ??
    card?.default_art?.image_uris?.large ??
    card?.default_art?.image_uris?.small;
  const rarity = card?.default_art?.rarity;
  const isMythic = rarity === "mythic" || rarity === "mythic rare";

  return (
    <View className="rounded-xl border border-border p-5"
      style={{
        backgroundColor: "rgba(29, 24, 43, 0.62)",
        ...(Platform.OS === "web"
          ? ({
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            } as object)
          : {}),
      }}
    >
      <View className="mb-3 flex-row items-center" style={{ gap: 8 }}>
        <Ionicons name="sparkles" size={18} color="#D4B25E" />
        <Text
          className="font-brand text-foreground"
          style={{ fontSize: 16, fontWeight: "600" }}
        >
          Card of the day
        </Text>
      </View>

      {loading || !card ? (
        <View className="items-center justify-center py-12">
          {loading ? (
            <ActivityIndicator color="#D4B25E" />
          ) : (
            <Text className="text-sm text-muted">No featured card yet.</Text>
          )}
        </View>
      ) : (
        <Link href={`/cards/${card.id}` as any} asChild>
          <Pressable style={{ alignItems: "center" }}>
            <View
              style={{
                width: "100%",
                aspectRatio: 63 / 88,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: isMythic ? "#F97316" : "#D4B25E",
                shadowColor: isMythic ? "#F97316" : "#D4B25E",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 18,
                backgroundColor: "#14111E",
                ...(Platform.OS === "web"
                  ? ({
                      boxShadow: isMythic
                        ? "0 0 28px rgba(249, 115, 22, 0.45)"
                        : "0 0 28px rgba(212, 178, 94, 0.4)",
                    } as object)
                  : {}),
              }}
            >
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View className="flex-1 items-center justify-center p-4">
                  <Text className="text-center font-brand text-foreground">
                    {card.name}
                  </Text>
                </View>
              )}
            </View>
            <Text
              className="mt-4 text-center font-brand text-foreground"
              style={{ fontSize: 16, fontWeight: "600" }}
              numberOfLines={1}
            >
              {card.name}
            </Text>
            {card.default_face?.full_type && (
              <Text className="text-center text-xs text-muted" numberOfLines={1}>
                {card.default_face.full_type}
              </Text>
            )}
            {rarity && (
              <Text
                className="mt-1 text-center text-xs uppercase tracking-wider"
                style={{ color: isMythic ? "#F97316" : "#D4B25E" }}
              >
                {rarity}
              </Text>
            )}
          </Pressable>
        </Link>
      )}
    </View>
  );
}

// ---------- Stats panel ----------

function StatsPanel({
  deckCount,
  commanderCount,
  favoritesTotal,
}: {
  deckCount: number;
  commanderCount: number;
  favoritesTotal: number;
}) {
  return (
    <View
      className="rounded-xl border border-border p-5"
      style={{
        backgroundColor: "rgba(29, 24, 43, 0.62)",
        ...(Platform.OS === "web"
          ? ({
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            } as object)
          : {}),
      }}
    >
      <Text
        className="mb-4 font-brand text-foreground"
        style={{ fontSize: 16, fontWeight: "600" }}
      >
        Your stats
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <Stat label="Decks" value={deckCount} />
        <Stat label="Commander" value={commanderCount} />
        <Stat label="Favorited" value={favoritesTotal} />
      </View>
      {/* Decorative gradient sliver under the stats — purely visual flourish
          that lifts the panel without competing with the numbers. */}
      <LinearGradient
        colors={["transparent", "rgba(155, 107, 242, 0.35)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: 1, marginTop: 18 }}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 80,
        alignItems: "center",
      }}
    >
      <Text
        className="font-brand text-primary"
        style={{ fontSize: 22, fontWeight: "700" }}
      >
        {value}
      </Text>
      <Text className="text-xs uppercase tracking-wider text-muted">
        {label}
      </Text>
    </View>
  );
}
