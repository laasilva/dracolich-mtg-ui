// DialogProvider — registers the global confirmDialog handler and renders
// the themed modal when active.
//
// Uses RN's <Modal> for cross-platform full-screen rendering:
// - iOS/Android: presented above the app
// - Web: rendered as a fixed-position overlay at the document root
//
// Animations: the Modal itself fades in/out via animationType. The card
// content uses Reanimated for a subtle scale-up entrance.

import { ReactNode, useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import {
  ConfirmOptions,
  clearDialogHandler,
  setDialogHandler,
} from "@/lib/dialogs";

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    setDialogHandler(
      (opts) =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          setActive(opts);
        })
    );
    return clearDialogHandler;
  }, []);

  const finish = (result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setActive(null);
  };

  return (
    <>
      {children}
      <Modal
        visible={!!active}
        transparent
        animationType="fade"
        onRequestClose={() => finish(false)}
      >
        {active && (
          <View className="flex-1 items-center justify-center p-6">
            {/* Backdrop — tap to dismiss as cancel */}
            <Pressable
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              className="bg-background/80"
              onPress={() => finish(false)}
            />

            {/* Card */}
            <Animated.View
              entering={FadeIn.duration(150)}
              className="w-full max-w-md rounded-2xl border border-border bg-elevated p-6"
              style={{ zIndex: 1 }}
            >
              <Text className="mb-2 font-brand text-xl text-accent">
                {active.title}
              </Text>
              {active.message && (
                <Text className="mb-6 text-foreground">{active.message}</Text>
              )}

              <View className="flex-row justify-end gap-3">
                <Pressable
                  onPress={() => finish(false)}
                  className="rounded-lg px-4 py-2.5 hover:bg-border/40 active:bg-border/40"
                >
                  <Text className="text-foreground">
                    {active.cancelText ?? "Cancel"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => finish(true)}
                  className={`rounded-lg px-4 py-2.5 ${
                    active.destructive
                      ? "bg-danger hover:bg-danger/90 active:bg-danger/80"
                      : "bg-accent hover:bg-accent/90 active:bg-accent/80"
                  }`}
                >
                  <Text
                    className={
                      active.destructive
                        ? "font-semibold text-foreground"
                        : "font-semibold text-background"
                    }
                  >
                    {active.confirmText ?? "Confirm"}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        )}
      </Modal>
    </>
  );
}
