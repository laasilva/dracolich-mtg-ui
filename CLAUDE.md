# dracolich-mtg-ui

Phase 4 frontend for the MTG deck builder. Single Expo codebase targeting **iOS, Android, and web**. Replaces the scrapped `dracolich-ui` (which served the unrelated D&D compendium).

Vision spec lives in memory (`project_mtg_ui_vision.md`); this file documents the **shipped implementation** and durable cross-platform patterns.

## Stack

- **Expo SDK 54** + Expo Router 6 (file-based routing, modal stacks)
- **React Native 0.81** + **React Native Web 0.21** (one codebase → 3 platforms)
- **NativeWind v4** + Tailwind 3.4 (RN-flavored Tailwind with `className` prop)
- **TanStack Query 5** for server state, **react-hook-form + zod** for forms
- **expo-secure-store** (native) + `localStorage` (web) for tokens
- **expo-image** for caching MTG card art
- **react-native-reanimated 4** for drawer / dialog animations
- **axios** for HTTP, single instance with JWT interceptor
- Node 18+ required.

## Build & Run

```bash
npm install
npx expo start              # opens dev menu (i = iOS, a = Android, w = web)
npx expo start --web        # web only
npx expo start --tunnel     # for testing on a phone over the internet
```

`.env` (project root) — note the `EXPO_PUBLIC_` prefix is required to expose the var to the bundle:

```
EXPO_PUBLIC_API_BASE=https://dev.dracolich.app
```

The base URL fans out per-service inside `lib/api.ts` (`/dracolich/mtg-library/...`, `/dracolich/user/...`, etc.).

## Routing

`expo-router` reads `app/` as a route tree:

```
app/
├── _layout.tsx                 root: providers + Stack with login/signup as modals
├── login.tsx                   modal route
├── signup.tsx                  modal route
└── (app)/                      route group — wrapped in NavShell
    ├── _layout.tsx             renders <NavShell><Slot /></NavShell>
    ├── index.tsx               (home — TBD)
    ├── cards.tsx               cards list (currently API smoke test + CardTile preview)
    ├── decks.tsx               (TBD)
    └── sets.tsx                (TBD)
```

The `(app)` group is the authenticated/main app shell. Login/signup are siblings rendered as modals so navigating to them doesn't lose the underlying app state.

## Provider stack (`app/_layout.tsx`)

Order matters — outer providers are visible to inner ones:

```
GestureHandlerRootView           reanimated needs this at the absolute root
  SafeAreaProvider               useSafeAreaInsets for notches/status bar
    QueryProvider                TanStack Query client
      AuthProvider               JWT state + login/register/logout
        DialogProvider           themed confirm() replacement
          Stack                  expo-router stack with modal screens
```

## Auth flow (`lib/auth.tsx`)

- `useAuth()` exposes `{ user, login, register, logout, isLoading }`
- Tokens stored via `lib/storage.ts` (cross-platform: SecureStore on native, localStorage on web)
- JWT decoded client-side to populate `user` (id, username) — verification stays server-side
- `register()` returns `{ autoSignedIn: true } | { autoSignedIn: false; message: string }` so the signup screen knows whether to close the modal or show "check your email"
- `logout()` is gated by a themed confirm dialog (see `confirmDialog` below)
- Refresh-token rotation: deferred. Current behavior is "JWT expires → 401 → user re-logs in"

## Themed confirm dialog (`lib/dialogs.ts` + `components/dialog-provider.tsx`)

**Why it exists**: `Alert.alert` from RN core silently drops the buttons array on RN-Web — clicking "Confirm" or "Cancel" does nothing on web. Native window.confirm is also off-theme.

**Pattern**: register-handler. `DialogProvider` mounts an RN `<Modal>` and registers a handler via `setDialogHandler`. Anywhere in the tree:

```tsx
const ok = await confirmDialog({
  title: "Sign out?",
  message: "You'll need to sign in again.",
  confirmText: "Sign out",
  destructive: true,
});
if (ok) await logout();
```

The Modal is `transparent` + `animationType="fade"`; the inner card uses Reanimated `FadeIn` for a subtle scale-up. Backdrop tap = cancel. Works identically on iOS, Android, and web (RN's `<Modal>` renders as a fixed overlay on web).

## Responsive nav (`components/nav-shell.tsx`)

Single component picks layout from `useWindowDimensions()`:

- `width >= 768`: top horizontal bar (web/tablet)
- `width < 768`: hamburger header opens a left-slide drawer

**Account menu is the same component on both** (`TopBarAccountMenu`) — popover-style dropdown anchored to the avatar icon. Mobile drawer is nav-only (Cards/Decks/Sets).

**Critical layering rules** (learned the hard way — don't drift from these):

1. **Header needs `zIndex: 100, position: "relative"`** so the dropdown layers above content. Without `position`, `zIndex` is ignored on web.
2. **NativeWind's `relative` class is unreliable on iOS** for positioning anchors. Use inline `style={{ position: "relative" }}`.
3. **Dropdown state lives in `NavShell`**, not the dropdown component. The click-outside backdrop is a sibling of `children` rendered in the content area, so taps anywhere in the page close it. Keep state lifted.
4. **Drawer backdrop and content are siblings** inside the drawer's `<View>`. Putting `onTouchStart={onClose}` on a parent that wraps the Pressable links fires before the link's `onPress` and breaks navigation — separate them.

## Core API client (`lib/api.ts`)

- Single axios instance with `Authorization: Bearer <jwt>` interceptor
- Helpers per service: `api.user(...)`, `api.mtgLibrary(...)`, `api.deckBuilder(...)` — each prefixes the path with the right service base
- All services return forge's `DmdResponse<T>` envelope; the helper unwraps `.payload` automatically and throws `ApiError` on `success: false` or HTTP error
- Use `ApiError` instances at call sites for typed error messages — no need to dig into axios error shape

## Card display (`components/card-tile.tsx`)

Single atomic component with two modes:

- `mode="carousel"` — full MTG aspect ratio (63/88), image-first, color-identity border, name + cost overlay (Pokemon-TCG-Pocket style)
- `mode="list"` — 56px thumbnail + meta row (name, cost, type, 2-line oracle excerpt)

Tolerant of missing data: falls back to a styled "card back" with name + cost when `default_art.image_uris` is absent. Color-identity accent helper maps `["W"|"U"|"B"|"R"|"G"]` to MTG hex tones; multi-color → gold (`#D4B25E`); colorless → neutral border.

`expo-image` with `cachePolicy="memory-disk"` keeps re-renders cheap on the cards screen.

## Theme (`tailwind.config.js`)

Mystical / dark by default (light theme deferred):

| Token | Hex | Use |
|-------|-----|-----|
| `background` | `#0F0F12` | App background |
| `surface` | `#15151A` | Header, drawer panel |
| `elevated` | `#1C1C24` | Cards, dropdowns |
| `border` | `#2A2A33` | Hairlines, neutral accents |
| `foreground` | `#E8E6E3` | Primary text |
| `muted` | `#9A9AA8` | Secondary text |
| `accent` | `#D4B25E` | Brand gold (highlights, multi-color cards) |
| `danger` | (red) | Destructive actions |
| `mtg.{white,blue,black,red,green,colorless}` | per MTG | Color-identity accents |

Brand serif (Beleren-style) on the nav header only (`font-brand`). Body uses system stack.

## Cross-platform gotchas — durable list

These have bitten us at least once each. Trust this list before re-deriving:

1. **`Alert.alert` button arrays drop silently on RN-Web** → use the themed `confirmDialog`.
2. **NativeWind `relative` is unreliable on iOS as a positioning anchor** → inline `style={{ position: "relative" }}`.
3. **`zIndex` requires `position` on web** → set both, or layering breaks.
4. **`onTouchStart` on parent fires before child `onPress`** → keeps Pressable links from navigating. Separate backdrops from interactive content as siblings.
5. **`expo-secure-store` is native-only** → `lib/storage.ts` falls back to `localStorage` on web. Token format must be a string (SecureStore rejects non-string values silently on iOS).
6. **CORS preflight** for the API: deck-builder-api / user-api / mtg-library-api need `localhost:8081` (Expo web) and the deployed Expo URL in `CORS_ALLOWED_ORIGINS`. K8s secret in `dracolich-dev` namespace.
7. **`EXPO_PUBLIC_*` env vars are baked at bundle time** → restart `expo start` after changing `.env`.
8. **Reanimated 4 needs `react-native-worklets`** as a peer (already in package.json) — without it, `entering`/`exiting` props no-op silently.
9. **NativeWind v4 doesn't auto-`cssInterop` on `Animated.View`** → `className` is silently dropped on web. Use inline styles for any animated wrapper that needs flex/layout (the indicator hit this — dots rendered vertical instead of row).
10. **expo-image renders SVG cross-platform on SDK 54** without needing `react-native-svg`. Confirmed via the mana-symbol icons (Scryfall `svg_uri` from mtg-library-api).
11. **Browser-native `<img>` drag intercepts pointer events on web** → blocks `Gesture.Pan`. Fix with `-webkit-user-drag: none` on `img` (in `global.css`). Also `overscroll-behavior-x: none` on `html, body` to kill the macOS swipe-back gesture; `touch-action: pan-y` + `userSelect: none` on the carousel wrapper itself.
12. **RN-Web's `<View onMouseMove>` is silently flaky inside `GestureDetector`** → events sometimes don't propagate. For mouse-tracking on web, attach a native `addEventListener("mousemove", ...)` via `useEffect` on the underlying div instead.
13. **`withTiming(80ms)` on every `mousemove` causes visible lag** because each sample restarts the tween. For cursor-driven SVs, write directly to `.value` — the cursor's own movement smooths the input.
14. **iOS doesn't reliably propagate animated `zIndex` from a Reanimated worklet to UIView layer order during in-flight animations.** Values update in JS but UIKit doesn't re-rasterize layer order until the spring settles. *Multiple workarounds tried (static zIndex, deferred spring via useEffect, dual-layer rendering with static parent zIndex) all had trade-offs* — see Phase 4.2 carousel notes below. Currently shipping animated `zIndex` + render-order reorder (`VISIBLE_OFFSETS` sorted by `|offset|` descending so active is rendered last). Web works correctly; iOS has a brief mid-spring layering glitch that's a known limitation to revisit when pile mode actually ships in Phase 4.3.
15. **RN's `backfaceVisibility: "hidden"` doesn't reliably hide faces** without `transform-style: preserve-3d`, which RN doesn't expose. For card-flip effects, hide faces by computing opacity in a worklet (e.g., `opacity: rotation < 90 ? 1 : 0`) instead of relying on `backfaceVisibility`.

## Status

**Phase 4.1 — Foundation**: ✅ done. Auth flow, nav, theming, API client, dialog system, env config, splash routing.

**Phase 4.2 — Cards**: in progress.
- [x] `CardTile` (carousel + list)
- [x] Cards screen smoke test rendering both modes
- [x] `ManaCost` + `useSymbol` query — SVG mana symbols via mtg-library-api `/symbols`
- [x] `CardCarousel` (the showpiece — see notes below)
- [x] `CarouselIndicator` (auto-fading dots / progress bar with live SV-driven highlight)
- [x] `CardBack` (placeholder MTG-style face-down asset)
- [ ] Search bar + filter chips
- [ ] Cards search screen (paginated)
- [ ] Card detail — web (right rail slide-in)
- [ ] Card detail — mobile (bottom sheet)
- [ ] Art-version scroller (needs `GET /cards/{id}/arts` on mtg-library-api — backend gap)

### CardCarousel notes

`components/card-carousel.tsx` is the Phase 4.2 showpiece. Built features:

- **Pan-driven swipe with kinetic-inertia projection** — drag distance + velocity together determine how many cards to advance; hard flicks reliably scroll 3-5 cards.
- **Tap-to-navigate** — tap any side card to jump to it; spring animates from a compensating offset so cards stay visually in place at the moment of commit.
- **Live position indicator** (`CarouselIndicator`) — dots when ≤15 cards, progress bar otherwise. Each dot's width/color smoothly interpolates by proximity to the live SV-derived position (not just the committed index). Auto-fades to 35% opacity 3s after the last commit.
- **Mouse-tilt parallax on web** — active card's `rotateX/rotateY` chases cursor offset from wrapper center. Native DOM `addEventListener("mousemove", ...)` on the wrapper's underlying div (RN-Web's synthetic `onMouseMove` is unreliable inside `GestureDetector`). Direct write to SV (no `withTiming`) for snappy follow.
- **Active-card gold glow** — animated `shadowColor/Opacity/Radius` keyed to proximity. iOS / web only; Android can't color shadows.
- **Side-card dim overlay** — sibling `<Animated.View>` over each `CardTile` with black background, opacity inversely proportional to proximity. Makes side cards read as "in the active card's shadow."
- **Haptic feedback on commits** — `expo-haptics` `selectionAsync` for single-card moves, `impactAsync(Light)` for multi-card jumps. No-op on web.
- **Pile mode** (`backFacingSide="left" | "right" | "none"`, default `"none"`) — opt-in deck-flip UX where cards on the specified side are face-down in a stacked draw pile, fan on the other side. Built but **has known iOS visual issues** (animated zIndex during the spring after a swipe doesn't propagate to UIView layer order, causing the active card to sit under the pile briefly). Tried several fixes (static zIndex, deferred spring, dual-layer rendering); all had trade-offs that broke web or didn't fully fix iOS. Currently shipping the simplest version that works on web; iOS pile-mode polish deferred to Phase 4.3 when we actually use this on the deck-builder screen.

Key constants in the file (tunable): `SPACING_FACTOR` (slot width), `SWIPE_COMMIT_FRACTION` (min projection to commit), `VELOCITY_DECAY` (kinetic-inertia coefficient), `PARALLAX_TILT` (max degrees on mouse hover), `GLOW_*` / `SHADOW_OVERLAY_MAX_OPACITY` (visual intensity), `VISIBLE_OFFSETS` (render window — sorted by `|offset|` descending so active renders last for iOS layer-order fallback).

**Phase 4.3 — Decks**: not started.

**Phase 4.4 — Sets**: not started.

**Phase 4.5 — Ship to stores**: not started.

## Backend gaps blocking the frontend

Capture here so we don't lose them:

- `mtg-library-api`: `GET /cards/{id}/arts` (or `arts: []` on the detail response) — currently only `defaultArt` ships, breaks the art-version scroller.
- `mtg-library-api`: `/{id}` route eats `/search` on some matches → add a regex constraint or reorder.
- `dracolich-mtg-deck-builder-api`: favorite-cards endpoint (planned post-Phase 4 per vision memo).
- `dracolich-user-api`: username → userId lookup, so public profile URLs can be `/users/{username}/...` instead of opaque IDs.
