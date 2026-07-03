// Root layout — wraps everything in providers (Query, Auth, SafeArea).
// Imports global.css to bootstrap NativeWind.
//
// Font loading: Cinzel is the brand display face (matches v0's design
// exploration). We block the splash screen on the font load so headings
// don't pop in after the first frame. If the load fails (e.g. offline on
// a fresh native install), we proceed anyway with the serif fallback.

import "../global.css";

import {
  Cinzel_400Regular,
  Cinzel_600SemiBold,
  Cinzel_700Bold,
  useFonts,
} from "@expo-google-fonts/cinzel";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text as RNText } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DialogProvider } from "@/components/dialog-provider";
import { FeedbackProvider } from "@/components/feedback-provider";
import { HoverPreviewProvider } from "@/components/hover-preview";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/lib/query-client";

// Make Cinzel the default font for every <Text> across the app, matching
// the v0 design exploration. NativeWind's tailwind.config maps font-sans →
// Cinzel for class-based styling, but Text that doesn't reach a className
// (or that explicitly merges its own style) falls back to platform default
// — patching defaultProps catches those cases on native. Web inherits from
// `body { font-family: ... }` in global.css.
//
// This must run after fonts are loaded, but defaultProps mutation needs to
// happen before any Text renders. Setting it module-side (synchronous on
// import) is the simplest way that works — fontFamily is just a string,
// so it's harmless before the font file is registered (Text just uses the
// fallback serif until the font loads).
const defaultTextProps = (RNText as any).defaultProps ?? {};
(RNText as any).defaultProps = {
  ...defaultTextProps,
  style: [{ fontFamily: "Cinzel_400Regular" }, defaultTextProps.style].filter(
    Boolean
  ),
};

SplashScreen.preventAutoHideAsync().catch(() => {
  // Pre-mount race — already auto-hid. Safe to ignore.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cinzel_400Regular,
    Cinzel_600SemiBold,
    Cinzel_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <DialogProvider>
              <FeedbackProvider>
                <HoverPreviewProvider>
                  <StatusBar style="light" />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: "#0C0A14" },
                    }}
                  >
                    <Stack.Screen name="(app)" />
                    <Stack.Screen name="login" options={{ presentation: "modal" }} />
                    <Stack.Screen name="signup" options={{ presentation: "modal" }} />
                  </Stack>
                </HoverPreviewProvider>
              </FeedbackProvider>
            </DialogProvider>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
