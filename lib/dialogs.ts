// Cross-platform confirmation dialog — public API.
//
// The actual UI is rendered by <DialogProvider> at the app root, which
// registers itself via setDialogHandler on mount. Call sites use the
// imperative `confirmDialog(opts)` and await the boolean result.
//
// This indirection keeps the call signature simple while letting us
// swap the visual implementation (themed modal, native, etc.) without
// touching consumers.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type DialogHandler = (opts: ConfirmOptions) => Promise<boolean>;

let handler: DialogHandler | null = null;

export function setDialogHandler(fn: DialogHandler) {
  handler = fn;
}

export function clearDialogHandler() {
  handler = null;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (!handler) {
    // Provider not mounted yet — fail safely. Treat as "cancel."
    if (__DEV__) {
      console.warn(
        "confirmDialog called before DialogProvider was mounted. Wrap your app in <DialogProvider>."
      );
    }
    return Promise.resolve(false);
  }
  return handler(opts);
}
