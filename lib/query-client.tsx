// TanStack Query setup — sensible defaults for the dracolich stack.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Lazy-init so the client is created once per app, not per render.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30s — most data tolerates brief staleness
            retry: 1, // one retry on failure (network blip), then surface the error
            refetchOnWindowFocus: false, // RN ignores this; on web it's noisy
          },
          mutations: {
            retry: 0, // never silently retry mutations
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
