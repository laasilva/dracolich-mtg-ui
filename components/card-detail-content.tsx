// Reusable card-detail content body. Used by both the wide-viewport
// side panel (`CardDetailPanel`) and the full-screen `/cards/[id]` route,
// so both surfaces stay in lock-step.
//
// Renders: art (current printing), name + mana cost, type line, oracle
// text, flavor text (from the active printing, switches when the user
// picks a different art version), power/toughness, and the art-versions
// row.
//
// Art-versions data is currently stubbed — the seeder uses Scryfall's
// `oracle_cards` bulk which only produces one printing per oracle card.
// When the seeder grows to `default_cards`/`all_cards`, swap the placeholder
// for a real `useCardArts(cardId)` call returning ArtPropertyDto[].

import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { CardTile } from "@/components/card-tile";
import { ManaCost } from "@/components/mana-cost";
import { useCardById, type CardArtDto, type CardDto } from "@/lib/queries/cards";

interface CardDetailContentProps {
  cardId: string;
  // Inset for scrollable container. Useful for the side panel which has its
  // own internal padding vs. the full-screen route which respects safe-area.
  // Pass false to skip the outer ScrollView (when wrapped in one already).
  scrollable?: boolean;
}

export function CardDetailContent({
  cardId,
  scrollable = true,
}: CardDetailContentProps) {
  const { data: card, isLoading, error } = useCardById({ id: cardId });

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator size="large" color="#D4B25E" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="rounded-lg bg-danger/20 p-4">
        <Text className="font-semibold text-danger">Failed to load card</Text>
        <Text className="mt-1 text-foreground">{(error as Error).message}</Text>
      </View>
    );
  }

  if (!card) return null;

  const Wrapper = scrollable ? ScrollView : View;
  return (
    <Wrapper
      className="flex-1"
      contentContainerClassName={scrollable ? "p-6 pb-12" : undefined}
    >
      <CardBody card={card} />
    </Wrapper>
  );
}

function CardBody({ card }: { card: CardDto }) {
  // Single-source-of-truth list of art printings. When the backend grows a
  // `/cards/{id}/arts` endpoint, replace this with the hook result.
  const arts: CardArtDto[] = useMemo(
    () => (card.default_art ? [card.default_art] : []),
    [card.default_art]
  );
  const [activeArtIndex, setActiveArtIndex] = useState(0);
  const activeArt = arts[activeArtIndex] ?? card.default_art;

  const face = card.default_face;
  const gp = face?.gameplay_property;

  // Per-printing flavor text wins over the face's; falls back to the face
  // for printings that have no flavor of their own.
  const flavorText = activeArt?.flavor_text ?? face?.flavor_text;

  return (
    <View className="items-center">
      {/* Display the active printing's art via CardTile's carousel-mode shape.
          We synthesize a partial CardDto with the active art swapped in so
          the same component handles all the styling. */}
      <CardTile
        card={{ ...card, default_art: activeArt }}
        mode="carousel"
        width={260}
      />

      <View className="mt-6 w-full max-w-md">
        <Text className="font-brand text-2xl text-foreground">{card.name}</Text>

        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {gp?.mana_cost && <ManaCost cost={gp.mana_cost} size={16} />}
          {face?.full_type && (
            <Text className="text-muted">{face.full_type}</Text>
          )}
        </View>

        {face?.oracle_text && (
          <Text className="mt-4 leading-5 text-foreground">
            {face.oracle_text}
          </Text>
        )}

        {flavorText && (
          <Text className="mt-3 italic leading-5 text-muted">{flavorText}</Text>
        )}

        {gp?.power != null && gp?.toughness != null && (
          <View className="mt-4 self-start rounded-md border border-border bg-elevated px-3 py-1">
            <Text className="font-mono text-foreground">
              {gp.power} / {gp.toughness}
            </Text>
          </View>
        )}

        <ArtVersionsSection
          arts={arts}
          activeIndex={activeArtIndex}
          onSelect={setActiveArtIndex}
        />
      </View>
    </View>
  );
}

function ArtVersionsSection({
  arts,
  activeIndex,
  onSelect,
}: {
  arts: CardArtDto[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (arts.length <= 1) {
    return (
      <View className="mt-8 rounded-lg border border-border bg-elevated p-3">
        <Text className="text-xs uppercase tracking-wider text-muted">
          Other printings
        </Text>
        <Text className="mt-1 text-sm text-foreground">
          Only one printing on file. Other arts will appear here once the
          backend syncs from Scryfall&apos;s full printings bulk.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-8">
      <Text className="mb-3 text-xs uppercase tracking-wider text-muted">
        Art versions
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {arts.map((art, i) => {
          const uri = art.image_uris?.art_crop ?? art.image_uris?.small;
          const isActive = i === activeIndex;
          return (
            <Pressable
              key={art.id ?? i}
              onPress={() => onSelect(i)}
              className={`rounded-md border-2 ${
                isActive ? "border-accent" : "border-border"
              }`}
              style={{ overflow: "hidden" }}
            >
              {uri && (
                <Image
                  source={{ uri }}
                  style={{ width: 80, height: 60 }}
                  contentFit="cover"
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
