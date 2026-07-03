import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function AccountScreen() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="font-brand text-3xl text-accent">Sign in</Text>
        <Text className="mt-2 text-center text-muted">
          Sign in to save decks under your name and favorite cards.
        </Text>
        <Link href="/login" asChild>
          <Pressable className="mt-6 rounded-lg bg-accent px-6 py-3">
            <Text className="font-semibold text-background">Continue</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <View className="flex-1 p-6">
      <Text className="font-brand text-3xl text-accent">{user.username}</Text>
      <Text className="mt-1 text-muted">{user.accessLevel}</Text>

      <View className="mt-8 gap-2">
        <MenuItem label="My Decks" href="/account/decks" />
        <MenuItem label="Favorite Decks" href="/account/favorites" />
        <MenuItem label="Settings" href="/account/settings" />
      </View>

      <Pressable
        onPress={logout}
        className="mt-12 self-start rounded-lg border border-danger px-6 py-3"
      >
        <Text className="text-danger">Sign out</Text>
      </Pressable>
    </View>
  );
}

function MenuItem({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href as any} asChild>
      <Pressable className="border-b border-border py-3">
        <Text className="text-foreground">{label}</Text>
      </Pressable>
    </Link>
  );
}
