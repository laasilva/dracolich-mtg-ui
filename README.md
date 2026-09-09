# dracolich-mtg-ui

The frontend for the Dracolich Magic: The Gathering deck-building platform. A single
[Expo](https://expo.dev) codebase targeting **iOS, Android, and web**.

For architecture, shipped feature status, and the cross-platform gotchas list, see
[`CLAUDE.md`](./CLAUDE.md). For the cross-repo picture — service topology, release pipeline, backend
conventions — see the workspace guide at `~/Dev/Dracolich/CLAUDE.md`.

## Prerequisites

- Node 18+
- An `.env` at the project root (copy `.env.example`)

## Get started

```bash
npm install
npx expo start           # dev menu: i = iOS, a = Android, w = web
npx expo start --web     # web only
npx expo start --tunnel  # test on a physical phone over the internet
```

## Configuration

```
EXPO_PUBLIC_API_BASE=https://dev.dracolich.app
```

The `EXPO_PUBLIC_` prefix is required to expose the variable to the bundle, and the value is **baked
in at bundle time** — restart `expo start` after changing it. `lib/env.ts` throws at import time if
it is unset, and fans the base URL out per service.

The usual setup points the app at the deployed dev environment. Pointing it at locally-run services
works too when developing against one.

## Layout

```
app/          expo-router file-based route tree ((app) group is the main shell,
              login/signup are sibling modal routes)
components/   presentational + interactive components
lib/          api client, auth, storage, dialogs, feedback, TanStack Query hooks
assets/       icons and splash images
```

## Stack

Expo SDK 54 · Expo Router 6 · React Native 0.81 · react-native-web 0.21 · NativeWind v4 +
Tailwind 3.4 · TanStack Query 5 · react-hook-form + zod · axios · Reanimated 4 · expo-image ·
expo-secure-store.

## Lint

```bash
npm run lint
```
