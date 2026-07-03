// Transient feedback popups — public API.
//
// Pairs with confirmDialog: confirm asks the user a question; feedback
// shows them the outcome of a non-trivial async operation. The flow is
// usually:
//
//   const ok = await confirmDialog({ title: "Delete deck", destructive: true });
//   if (!ok) return;
//   const handle = showFeedback({ kind: "loading", title: "Deleting…" });
//   try {
//     await deleteDeck.mutateAsync(deck.id);
//     handle.update({ kind: "success", title: "Deck deleted", autoCloseMs: 1500 });
//   } catch (e) {
//     handle.update({ kind: "error", title: "Couldn't delete", message: String(e) });
//   }
//
// The Modal stays mounted until autoCloseMs elapses (success) or the
// user taps the dismiss button (error). Loading state is not user-
// dismissible — the await guarantees a terminal state will follow.
//
// FeedbackProvider (in components/feedback-provider.tsx) registers the
// handler. Without it mounted, showFeedback is a no-op that warns in DEV.

export type FeedbackKind = "loading" | "success" | "error";

export interface FeedbackState {
  kind: FeedbackKind;
  title: string;
  message?: string;
  // For success only — milliseconds to auto-close. Defaults to 1500. Set
  // to 0 to require manual dismiss. Ignored for loading + error.
  autoCloseMs?: number;
}

export interface FeedbackHandle {
  // Replace the popup contents — used to transition loading → success/error.
  update: (next: FeedbackState) => void;
  // Force-close immediately (e.g. user navigated away).
  close: () => void;
}

type FeedbackHandler = (initial: FeedbackState) => FeedbackHandle;

let handler: FeedbackHandler | null = null;

export function setFeedbackHandler(fn: FeedbackHandler) {
  handler = fn;
}

export function clearFeedbackHandler() {
  handler = null;
}

const noopHandle: FeedbackHandle = {
  update: () => {},
  close: () => {},
};

export function showFeedback(initial: FeedbackState): FeedbackHandle {
  if (!handler) {
    if (__DEV__) {
      console.warn(
        "showFeedback called before FeedbackProvider was mounted. Wrap your app in <FeedbackProvider>."
      );
    }
    return noopHandle;
  }
  return handler(initial);
}
