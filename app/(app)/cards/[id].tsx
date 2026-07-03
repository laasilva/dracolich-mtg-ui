// Full-screen card detail.
//
// Used by:
//   - narrow viewports (mobile), where the side panel doesn't fit
//   - direct deep links to /cards/{id}
//
// The wide-viewport in-app navigation from /cards uses the slide-in
// CardDetailPanel instead and never lands here.

import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { CardDetailContent } from "@/components/card-detail-content";

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  if (!id) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-foreground">No card id provided.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-6 pt-4">
        <Pressable
          onPress={() => router.back()}
          className="self-start rounded-md px-3 py-1.5 hover:bg-elevated active:bg-elevated"
        >
          <Text className="text-sm text-accent">← Back</Text>
        </Pressable>
      </View>

      <CardDetailContent cardId={id} />
    </View>
  );
}
