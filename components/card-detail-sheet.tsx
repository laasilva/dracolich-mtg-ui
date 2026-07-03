// Mobile / narrow-viewport card detail — full-screen bottom sheet.
//
// Same body as the wide-viewport CardDetailPanel (both use CardDetailContent);
// just a different presentation. Drag-down-to-dismiss + tap-backdrop-to-dismiss
// are the close affordances; the parent only needs to clear `cardId` to drive
// the same state machine.
//
// Why @gorhom/bottom-sheet:
// - de-facto RN bottom-sheet library, plays well with Reanimated 4
// - handles the awkward scroll-vs-pan coordination (drag the sheet down when
//   the inner ScrollView is at offset 0, otherwise scroll the content)
// - declarative `index` prop + ref-based control work side by side

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { CardDetailContent } from "@/components/card-detail-content";

interface CardDetailSheetProps {
  cardId: string | null;
  onClose: () => void;
}

export function CardDetailSheet({ cardId, onClose }: CardDetailSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);

  // Single tall snap point — the sheet covers most of the screen so the
  // card art has room. enablePanDownToClose lets the user dismiss with a
  // simple downward drag.
  const snapPoints = useMemo(() => ["92%"], []);

  // Open when cardId becomes non-null, close otherwise. snapToIndex(0)
  // opens to the first (only) snap point; close() drives the sheet back to -1.
  useEffect(() => {
    if (cardId) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [cardId]);

  // When the sheet animates to the closed state (index -1), tell the parent
  // to clear its state. Without this the parent state and sheet state can
  // drift if the user dismisses via drag instead of programmatic close.
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

  return (
    <BottomSheet
      ref={sheetRef}
      // index -1 = closed at mount. The useEffect above drives it open.
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
          {/* scrollable=false because BottomSheetScrollView already provides
              the scroll container — nesting a regular ScrollView inside
              breaks the sheet's drag-vs-scroll coordination. */}
          <CardDetailContent cardId={cardId} scrollable={false} />
        </BottomSheetScrollView>
      )}
    </BottomSheet>
  );
}
