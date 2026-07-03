/** @type {import('tailwindcss').Config} */
//
// Mystical dark fantasy theme. Existing token names kept stable so prior
// surfaces keep rendering; values tuned toward a deeper, purple-tinted
// palette to match the v0 design exploration.
//
// New tokens added:
//   - `primary` family — mystical purple, used for headlines, CTA, glow ring
//   - `glow.*` — color tokens used as shadowColor on iOS/web (Android can't tint shadows)
//   - `font-display` alias — Cinzel when loaded, serif fallback while loading
//
// The MTG color identity palette stays as-is so existing card/deck pip helpers
// (CardTile, DeckTile, FilterChips) don't need to change.
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surfaces — deeper, with a violet undertone so glow effects read
        // mystical rather than neon. Hex values are RN-safe (RN doesn't
        // understand oklch).
        background: "#0C0A14",
        surface: "#14111E",
        elevated: "#1D182B",
        border: "#2D2540",

        // Foreground tones
        foreground: "#ECE9DF",
        muted: "#A39F93",
        subtle: "#6F6C66",

        // Primary — mystical purple (new). Used for headlines, primary CTAs,
        // glow rings, gradient stops.
        primary: {
          DEFAULT: "#9B6BF2",
          muted: "#6F4DAE",
          foreground: "#FFFFFF",
        },

        // Accent — golden mystical (kept from previous palette, also v0's gold).
        accent: {
          DEFAULT: "#D4B25E",
          muted: "#8A7340",
          foreground: "#0C0A14",
        },

        // MTG color identity (unchanged — card/deck pip helpers depend on these)
        mtg: {
          white: "#F8F6E8",
          blue: "#5C9EE5",
          black: "#2D2A30",
          red: "#D14B3D",
          green: "#5BA66B",
          colorless: "#A5A5A5",
        },

        // State colors
        danger: "#D14B3D",
        success: "#5BA66B",
        warning: "#D4B25E",

        // Glow tints — used as `shadowColor` on iOS/web; Android falls back
        // to elevation (untintable). The 0.4 alpha is baked into the
        // rgba string consumers pass directly to shadowColor since Tailwind
        // can't synthesize alpha from a hex token at the RN style layer.
        glow: {
          purple: "#9B6BF2",
          gold: "#D4B25E",
          blue: "#5C9EE5",
        },
      },
      fontFamily: {
        // Cinzel is loaded in app/_layout.tsx via @expo-google-fonts/cinzel.
        // Mirrors the v0 design exploration where Cinzel is the entire app's
        // font (not just brand surfaces). `sans` is the tailwind default —
        // overriding it makes every `<Text>` that doesn't specify a font
        // class inherit Cinzel automatically. Native gets the same default
        // via a Text.defaultProps patch in app/_layout.tsx.
        sans: ["Cinzel_400Regular", "Cinzel", "serif"],
        brand: ["Cinzel_700Bold", "Cinzel", "serif"],
        display: ["Cinzel_700Bold", "Cinzel", "serif"],
        body: ["Cinzel_400Regular", "Cinzel", "serif"],
      },
      borderRadius: {
        // v0 uses 0.75rem (12px) as the base. We'll keep tailwind defaults
        // but expose a "mystical" radius for special surfaces.
        mystical: "14px",
      },
    },
  },
  plugins: [],
};
