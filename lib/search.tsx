// Global search state — shared between the nav-header SearchBar and the
// active screen. The SearchBar writes the immediate input value here; the
// active screen reads the debounced query and feeds it to its data hook.
//
// Auto-resets on pathname change so a search query from /cards doesn't
// carry into /decks. Mounted in app/(app)/_layout.tsx so it covers every
// route inside the app shell.

import { usePathname } from "expo-router";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface SearchContextValue {
  // Immediate value — synced to the input on every keystroke.
  inputValue: string;
  setInputValue: (v: string) => void;
  // Debounced value — what pages should use for API calls.
  query: string;
}

const SearchContext = createContext<SearchContextValue | null>(null);

// Same window as the previous SearchBar internal debounce.
const DEBOUNCE_MS = 300;

export function SearchProvider({ children }: { children: ReactNode }) {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const pathname = usePathname();

  // Reset on top-level section change only. Navigating /cards → /cards/[id]
  // keeps the query (the user might want to return to the search results
  // with the query intact); /cards → /decks resets.
  const section = pathname.split("/")[1] ?? "";
  useEffect(() => {
    setInputValue("");
    setQuery("");
  }, [section]);

  // Debounce inputValue → query.
  useEffect(() => {
    const t = setTimeout(() => setQuery(inputValue), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [inputValue]);

  return (
    <SearchContext.Provider value={{ inputValue, setInputValue, query }}>
      {children}
    </SearchContext.Provider>
  );
}

/**
 * Current debounced search query. Pages use this to drive their API calls.
 * Returns "" when no provider is mounted (safe default for non-app routes).
 */
export function useSearchQuery(): string {
  return useContext(SearchContext)?.query ?? "";
}

/**
 * Immediate input value + setter. The nav-header SearchBar uses this; most
 * pages should use useSearchQuery() instead.
 */
export function useSearchControls(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearchControls must be used within a SearchProvider");
  }
  return ctx;
}
