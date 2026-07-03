// Cross-platform glow primitive.
//
// v0's design uses CSS `box-shadow` with large blur radii to give surfaces
// a mystical halo. RN doesn't have a direct equivalent — iOS uses the
// shadow* prop family, Android only supports `elevation` (untinted), and
// web maps shadow* back to box-shadow.
//
// We expose a single `<Glow>` wrapper that produces the closest possible
// equivalent per platform:
//   - iOS:    `shadowColor + shadowOpacity + shadowRadius` (tinted)
//   - Web:    same → React Native Web translates to box-shadow w/ blur+color
//   - Android: `elevation` only — color is dropped (system constraint).
//             Surfaces that *rely* on the color (e.g. mythic rarity gold)
//             should also paint a subtle border or background tint so
//             Android users still get the semantic.
//
// `intensity` controls the shadow radius; `size` controls offset (we use
// 0 by default so it reads as a halo rather than a drop shadow). Tokens:
//
//   color:     "purple" | "gold" | "blue"  (matches tailwind glow.* tokens)
//   intensity: "sm" | "md" | "lg"
//
// Usage:
//   <Glow color="purple" intensity="md">
//     <View className="rounded-xl bg-elevated p-6">...</View>
//   </Glow>
//
// The wrapper does NOT clip its children — children must round their own
// corners. This is intentional: clipping the glow would defeat the halo.

import { Platform, View, type ViewProps } from "react-native";

const GLOW_HEX: Record<GlowColor, string> = {
  purple: "#9B6BF2",
  gold: "#D4B25E",
  blue: "#5C9EE5",
};

const INTENSITY: Record<GlowIntensity, { radius: number; opacity: number; elevation: number }> = {
  sm: { radius: 8, opacity: 0.35, elevation: 4 },
  md: { radius: 18, opacity: 0.45, elevation: 8 },
  lg: { radius: 32, opacity: 0.55, elevation: 14 },
};

export type GlowColor = "purple" | "gold" | "blue";
export type GlowIntensity = "sm" | "md" | "lg";

interface GlowProps extends ViewProps {
  color?: GlowColor;
  intensity?: GlowIntensity;
}

export function Glow({
  color = "purple",
  intensity = "md",
  style,
  children,
  ...rest
}: GlowProps) {
  const { radius, opacity, elevation } = INTENSITY[intensity];
  const hex = GLOW_HEX[color];

  // Web also accepts a literal CSS box-shadow string — and that gives us a
  // proper outer halo with no offset, which RN-Web doesn't fully synthesize
  // from shadow* props alone. So on web we set it via a style prop that
  // RN-Web's StyleSheet passes through as a raw CSS property.
  const webShadow =
    Platform.OS === "web"
      ? ({
          // boxShadow is honored by RN-Web. Listed AFTER the shadow* fallback
          // below so it wins on web.
          boxShadow: `0 0 ${radius * 1.5}px ${hex}${Math.round(opacity * 255)
            .toString(16)
            .padStart(2, "0")}, 0 0 ${radius * 3}px ${hex}${Math.round(opacity * 0.5 * 255)
            .toString(16)
            .padStart(2, "0")}`,
        } as object)
      : null;

  // Merge into a single style object rather than passing an array. Some
  // wrappers in this codebase (expo-router <Link asChild>) forward the style
  // prop straight through to React DOM, which fails on a raw array because
  // CSSStyleDeclaration rejects indexed setters.
  const mergedStyle = Object.assign(
    {
      // shadow* — iOS native renderer. Android ignores color, uses elevation.
      shadowColor: hex,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation,
    },
    webShadow,
    // `style` from props might itself be an array; flatten if so.
    Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style
  );

  return (
    <View style={mergedStyle} {...rest}>
      {children}
    </View>
  );
}
