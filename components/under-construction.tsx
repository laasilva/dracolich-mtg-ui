// "Under construction" placeholder used on routes that exist in the
// nav menu but aren't built yet (Settings, Favorite decks, etc).
// Replaces the dead-end 404 / blank screen with a themed surface so the
// app reads as "coming soon" rather than broken.
//
// Renders a centered card with a hammer icon, a brand-styled title, a
// short body line explaining what's coming, and a back-to-home button.
// Optional secondary action lets the consumer wire a back-to-section link.

import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";

interface UnderConstructionProps {
  title: string;
  message?: string;
  // Optional secondary CTA back to a related section that does exist.
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function UnderConstruction({
  title,
  message,
  secondaryLabel,
  secondaryHref,
}: UnderConstructionProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <View
        className="w-full max-w-md items-center rounded-2xl border border-border p-8"
        style={{
          backgroundColor: "rgba(20, 17, 30, 0.78)",
          ...(Platform.OS === "web"
            ? ({
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: "0 0 32px rgba(155, 107, 242, 0.25)",
              } as object)
            : {
                shadowColor: "#9B6BF2",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 18,
              }),
        }}
      >
        {/* Decorative icon — purple glow on web. */}
        <View
          className="mb-5 items-center justify-center rounded-full bg-primary/15"
          style={{
            width: 72,
            height: 72,
            ...(Platform.OS === "web"
              ? ({ boxShadow: "0 0 28px rgba(155, 107, 242, 0.45)" } as object)
              : {}),
          }}
        >
          <Ionicons name="construct-outline" size={36} color="#9B6BF2" />
        </View>

        <Text
          className="text-center font-brand text-foreground"
          style={{
            fontSize: 26,
            fontWeight: "700",
            ...(Platform.OS === "web"
              ? ({ textShadow: "0 0 16px rgba(155, 107, 242, 0.4)" } as object)
              : {}),
          }}
        >
          {title}
        </Text>
        <Text className="mt-2 text-center text-sm uppercase tracking-wider text-accent">
          Under construction
        </Text>

        <Text className="mt-4 text-center text-muted">
          {message ?? "This corner of Dracolich is still being built. Check back soon — it'll be here."}
        </Text>

        <View
          className="mt-6 flex-row flex-wrap justify-center"
          style={{ gap: 12 }}
        >
          <Link href={"/" as any} asChild>
            <Pressable className="rounded-lg bg-primary px-5 py-2.5 hover:bg-primary/90 active:bg-primary/80">
              <Text className="font-semibold text-white">Back to home</Text>
            </Pressable>
          </Link>
          {secondaryHref && secondaryLabel && (
            <Link href={secondaryHref as any} asChild>
              <Pressable className="rounded-lg border border-border px-5 py-2.5 hover:bg-elevated active:bg-elevated/80">
                <Text className="text-foreground">{secondaryLabel}</Text>
              </Pressable>
            </Link>
          )}
        </View>
      </View>
    </View>
  );
}
