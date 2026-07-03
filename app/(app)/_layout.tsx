// Layout for the main authenticated/anon-friendly app surface.
// All screens inside (app)/ render inside the NavShell, with the SearchProvider
// scoped to this layout so the nav-header search bar and active screen share
// state (and the query auto-resets on route change).

import { Slot } from "expo-router";

import { NavShell } from "@/components/nav-shell";
import { SearchProvider } from "@/lib/search";

export default function AppLayout() {
  return (
    <SearchProvider>
      <NavShell>
        <Slot />
      </NavShell>
    </SearchProvider>
  );
}
