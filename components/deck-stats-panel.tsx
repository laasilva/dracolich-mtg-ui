// Deck stats — custom-rendered visuals (no chart library) so the panel
// matches the rest of the dark/gold theme instead of looking like a
// generic chart-kit page.
//
// - Big number tiles up top: Cards / Lands / Avg CMC
// - Mana curve as gold bars (View-based, no SVG) with the mana-value
//   chip below each bar
// - Color identity as a single horizontal stripe of segments, sized by
//   the backend's normalized percentages
// - Type breakdown as a compact bar list
// - Warnings get a tinted card if any

import { useMemo } from "react";
import { Text, View } from "react-native";

import { ManaCost } from "@/components/mana-cost";
import type { DeckStatsDto } from "@/lib/queries/decks";

interface DeckStatsPanelProps {
  stats: DeckStatsDto;
  // Forwarded by parent for layout coordination, but the new visuals are
  // all flex-based and don't need explicit pixel widths.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chartWidth?: number;
}

const COLOR_HEX: Record<string, string> = {
  W: "#F8F6E8",
  U: "#5C9EE5",
  B: "#5A4F58",
  R: "#D14B3D",
  G: "#5BA66B",
  C: "#9A9AA8",
};

const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

export function DeckStatsPanel({ stats }: DeckStatsPanelProps) {
  return (
    <View>
      <SummaryTiles stats={stats} />

      {stats.mana_curve && (
        <Section title="Mana curve">
          <ManaCurve curve={stats.mana_curve} />
        </Section>
      )}

      {stats.color_pie && Object.keys(stats.color_pie).length > 0 && (
        <Section title="Color identity">
          <ColorStripe pie={stats.color_pie} />
        </Section>
      )}

      {stats.type_breakdown &&
        Object.keys(stats.type_breakdown).length > 0 && (
          <Section title="Types">
            <TypeBars breakdown={stats.type_breakdown} />
          </Section>
        )}

      {stats.warnings && stats.warnings.length > 0 && (
        <View
          className="mt-5 rounded-xl border border-danger/40"
          style={{ backgroundColor: "rgba(209,75,61,0.08)", padding: 12 }}
        >
          <Text className="mb-1 text-xs uppercase tracking-wider text-danger">
            Warnings
          </Text>
          {stats.warnings.map((w, i) => (
            <Text key={i} className="mt-1 text-sm text-foreground">
              • {w}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- Summary tiles ----------

function SummaryTiles({ stats }: { stats: DeckStatsDto }) {
  return (
    <View className="flex-row" style={{ gap: 8 }}>
      <Tile label="Cards" value={String(stats.card_count ?? 0)} />
      <Tile label="Lands" value={String(stats.land_count ?? 0)} />
      <Tile
        label="Avg CMC"
        value={stats.average_cmc != null ? stats.average_cmc.toFixed(2) : "—"}
      />
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-1 items-center rounded-xl border border-border"
      style={{ backgroundColor: "#1C1C24", paddingVertical: 12 }}
    >
      <Text className="font-brand text-2xl text-foreground">{value}</Text>
      <Text className="mt-0.5 text-[10px] uppercase tracking-widest text-muted">
        {label}
      </Text>
    </View>
  );
}

// ---------- Mana curve bars ----------

const CURVE_BAR_HEIGHT = 110;

function ManaCurve({ curve }: { curve: Record<string, number> }) {
  const entries = useMemo(() => {
    const e = Object.entries(curve)
      .map(([k, v]) => [parseInt(k, 10), v] as const)
      .filter(([k]) => Number.isFinite(k))
      .sort((a, b) => a[0] - b[0]);
    if (e.length === 0) return [];
    // Fill gaps so {1:4, 4:2} → {1,2,3,4} (zeros in between).
    const min = e[0][0];
    const max = e[e.length - 1][0];
    const byKey = new Map(e);
    const out: Array<{ cmc: number; count: number }> = [];
    for (let i = min; i <= max; i++) {
      out.push({ cmc: i, count: byKey.get(i) ?? 0 });
    }
    return out;
  }, [curve]);

  const maxCount = useMemo(
    () => entries.reduce((m, e) => Math.max(m, e.count), 0),
    [entries]
  );

  if (entries.length === 0) return null;

  return (
    <View className="flex-row items-end" style={{ gap: 6, height: CURVE_BAR_HEIGHT + 36 }}>
      {entries.map(({ cmc, count }) => {
        const h = maxCount > 0 ? (count / maxCount) * CURVE_BAR_HEIGHT : 0;
        return (
          <View
            key={cmc}
            style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}
          >
            <Text className="mb-1 text-[10px] text-muted">{count}</Text>
            <View
              style={{
                width: "70%",
                height: h,
                borderRadius: 3,
                backgroundColor: "#D4B25E",
                // Subtle inner highlight at the top of each bar so the
                // colored block isn't flat.
                shadowColor: "#D4B25E",
                shadowOpacity: 0.4,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
            <Text className="mt-1.5 text-xs text-foreground">{cmc}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------- Color identity stripe ----------

function ColorStripe({ pie }: { pie: Record<string, number> }) {
  const entries = useMemo(
    () =>
      Object.entries(pie)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a),
    [pie]
  );

  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <View>
      {/* Stripe */}
      <View
        className="flex-row overflow-hidden rounded-lg"
        style={{ height: 22 }}
      >
        {entries.map(([code, v]) => (
          <View
            key={code}
            style={{
              flex: v / total,
              backgroundColor: COLOR_HEX[code] ?? "#9A9AA8",
            }}
          />
        ))}
      </View>
      {/* Legend */}
      <View
        className="mt-2 flex-row flex-wrap"
        style={{ gap: 10 }}
      >
        {entries.map(([code, v]) => (
          <View key={code} className="flex-row items-center" style={{ gap: 4 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: COLOR_HEX[code] ?? "#9A9AA8",
              }}
            />
            <Text className="text-xs text-foreground">
              {COLOR_LABELS[code] ?? code}
            </Text>
            <Text className="text-xs text-muted">
              {Math.round((v / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------- Type breakdown bars ----------

function TypeBars({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = useMemo(
    () => Object.entries(breakdown).sort(([, a], [, b]) => b - a),
    [breakdown]
  );
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);
  if (entries.length === 0) return null;

  return (
    <View style={{ gap: 6 }}>
      {entries.map(([type, count]) => (
        <View key={type} className="flex-row items-center" style={{ gap: 8 }}>
          <Text
            className="w-24 text-xs text-foreground"
            numberOfLines={1}
          >
            {type}
          </Text>
          <View
            className="flex-1 overflow-hidden rounded-sm"
            style={{ height: 10, backgroundColor: "#2A2A33" }}
          >
            <View
              style={{
                width: `${max > 0 ? (count / max) * 100 : 0}%`,
                height: "100%",
                backgroundColor: "#D4B25E",
              }}
            />
          </View>
          <Text className="w-6 text-right text-xs text-muted">{count}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- Section wrapper ----------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-6">
      <Text className="mb-3 text-[11px] uppercase tracking-widest text-muted">
        {title}
      </Text>
      {children}
    </View>
  );
}
