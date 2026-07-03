// Deck-context card preview — bottom sheet wrapper around
// CardDetailContent with a contextual footer action (e.g. "Remove from
// deck" when used from the build screen).
//
// Why a deck-specific sheet rather than reusing CardDetailSheet:
//   - the /cards browse sheet has no concept of "remove from deck"
//   - the build screen used to wire onCardPress directly to remove, which
//     was awful on mobile (you tap to read the card → it's gone). Opening
//     this sheet gives a preview surface before any destructive action.
//
// The sheet is full-platform (RN-Web also renders it), but the call sites
// open it only on narrow viewports — on wide screens the hover preview
// + click-to-remove on the pile is still the faster path.

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { CardDetailContent } from "@/components/card-detail-content";

interface DeckCardSheetProps {
  // The card to preview. Null = sheet closed.
  cardId: string | null;
  onClose: () => void;
  // Optional: when set, a "Remove from deck" footer button appears that
  // calls this handler. Omit for read-only contexts (review screen).
  onRemove?: (cardId: string) => void;
  // Reflects the parent's pending mutation so the footer button can show
  // its own spinner without flashing through a confirm dialog. Optional.
  removing?: boolean;
}

export function DeckCardSheet({
  cardId,
  onClose,
  onRemove,
  removing = false,
}: DeckCardSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  // Tall single snap point so the card art has room. Matches the
  // CardDetailSheet pattern used on the /cards page.
  const snapPoints = useMemo(() => ["92%"], []);

  useEffect(() => {
    if (cardId) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [cardId]);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.6}
      />
    ),
    []
  );

  const handleRemove = () => {
    if (cardId && onRemove) onRemove(cardId);
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleChange}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#15151A" }}
      handleIndicatorStyle={{ backgroundColor: "#9A9AA8", width: 40 }}
    >
      {cardId && (
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        >
          <CardDetailContent cardId={cardId} scrollable={false} />

          {onRemove && (
            <Pressable
              onPress={removing ? undefined : handleRemove}
              disabled={removing}
              accessibilityLabel="Remove from deck"
              className="mt-6 flex-row items-center justify-center rounded-lg border border-danger/40 px-5 py-3 hover:bg-danger/10 active:bg-danger/20"
              style={{ gap: 8, opacity: removing ? 0.6 : 1 }}
            >
              {removing ? (
                <ActivityIndicator size="small" color="#D14B3D" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#D14B3D" />
              )}
              <Text className="font-semibold text-danger">
                {removing ? "Removing…" : "Remove from deck"}
              </Text>
            </Pressable>
          )}
        </BottomSheetScrollView>
      )}
    </BottomSheet>
  );
}
