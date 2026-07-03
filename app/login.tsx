// Login modal — username/password form against user-api POST /auth/login.

import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, router } from "expo-router";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { BrandMark } from "@/components/ui/brand-mark";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.username, values.password);
      // Successful login — close the modal and the app's auth state updates everywhere
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sign in failed. Please try again.";
      setServerError(msg);
    }
  }

  return (
    // KeyboardAvoidingView lifts the form above the on-screen keyboard so
    // focused inputs stay visible while typing. iOS uses "padding" (the
    // host view adds bottom padding); Android handles it natively via the
    // window soft input mode. Web no-ops. ScrollView inside lets users
    // scroll past the form if it grows taller than the visible area.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
      className="bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="w-full max-w-md self-center rounded-2xl border border-border p-8"
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
        <View className="mb-6 items-center">
          <BrandMark size={48} />
        </View>
        <Text
          className="mb-2 text-center font-brand text-foreground"
          style={{
            fontSize: 28,
            fontWeight: "700",
            ...(Platform.OS === "web"
              ? ({ textShadow: "0 0 20px rgba(155, 107, 242, 0.4)" } as object)
              : {}),
          }}
        >
          Sign in
        </Text>
        <Text className="mb-8 text-center text-muted">
          Welcome back to Dracolich
        </Text>

        <FormField
          name="username"
          label="Username"
          control={control}
          error={errors.username?.message}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <FormField
          name="password"
          label="Password"
          control={control}
          error={errors.password?.message}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        {serverError && (
          <View className="mb-4 rounded-lg bg-danger/20 p-3">
            <Text className="text-sm text-danger">{serverError}</Text>
          </View>
        )}

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className={`mt-2 items-center rounded-lg py-3 ${
            isSubmitting ? "bg-primary/60" : "bg-primary"
          }`}
          style={
            isSubmitting
              ? undefined
              : Platform.OS === "web"
                ? ({ boxShadow: "0 0 18px rgba(155, 107, 242, 0.5)" } as object)
                : {
                    shadowColor: "#9B6BF2",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 12,
                  }
          }
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="font-semibold text-white">Sign in</Text>
          )}
        </Pressable>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-muted">Don&apos;t have an account? </Text>
          <Link href="/signup" replace asChild>
            <Pressable>
              <Text className="text-accent">Sign up</Text>
            </Pressable>
          </Link>
        </View>

        <Pressable
          onPress={() => router.back()}
          className="mt-8 items-center"
        >
          <Text className="text-sm text-muted">Cancel</Text>
        </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
