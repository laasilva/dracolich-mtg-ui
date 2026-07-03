// Sign up modal — username/email/password form against user-api POST /auth/register.

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

// Glass card surface — translucent over the body radial gradient on web,
// alpha-blended over the solid bg on native. Mirrors the v0 auth surfaces.
const CARD_SURFACE_STYLE = {
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
};

const PRIMARY_BUTTON_GLOW = Platform.OS === "web"
  ? ({ boxShadow: "0 0 18px rgba(155, 107, 242, 0.5)" } as object)
  : {
      shadowColor: "#9B6BF2",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
    };

const schema = z
  .object({
    username: z
      .string()
      .min(3, "At least 3 characters")
      .max(30, "At most 30 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

type FormValues = z.infer<typeof schema>;

export default function SignUpScreen() {
  const { register } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSuccessMessage(null);
    try {
      const result = await register({
        username: values.username,
        email: values.email,
        password: values.password,
      });

      if (result.autoSignedIn) {
        // Auto-login path — close the modal, app reflects the new auth state
        if (router.canGoBack()) router.back();
        else router.replace("/");
      } else {
        // Confirmation-email path — show the message, leave the modal up
        setSuccessMessage(result.message);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Registration failed. Please try again.";
      setServerError(msg);
    }
  }

  // Success state takes over the modal once the account is created
  if (successMessage) {
    return (
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
            style={CARD_SURFACE_STYLE}
          >
            <View className="mb-6 items-center">
              <BrandMark size={48} />
            </View>
            <Text
              className="mb-2 text-center font-brand text-foreground"
              style={{ fontSize: 26, fontWeight: "700" }}
            >
              Check your email
            </Text>
            <Text className="mb-8 text-center text-muted">{successMessage}</Text>
            <Link href="/login" replace asChild>
              <Pressable
                className="mt-2 items-center rounded-lg bg-primary py-3"
                style={PRIMARY_BUTTON_GLOW}
              >
                <Text className="font-semibold text-white">Go to sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
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
          style={CARD_SURFACE_STYLE}
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
          Create account
        </Text>
        <Text className="mb-8 text-center text-muted">
          Start building your decks
        </Text>

        <FormField
          name="username"
          label="Username"
          control={control}
          error={errors.username?.message}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <FormField
          name="email"
          label="Email"
          control={control}
          error={errors.email?.message}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
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
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <FormField
          name="confirmPassword"
          label="Confirm password"
          control={control}
          error={errors.confirmPassword?.message}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password-new"
          textContentType="newPassword"
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
          style={isSubmitting ? undefined : PRIMARY_BUTTON_GLOW}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="font-semibold text-white">Create account</Text>
          )}
        </Pressable>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-muted">Already have an account? </Text>
          <Link href="/login" replace asChild>
            <Pressable>
              <Text className="text-accent">Sign in</Text>
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
