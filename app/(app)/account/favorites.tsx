// Favorite decks — placeholder until the backend favorites collection
// + UI lands. The nav menu and account hub link here, so we need a
// themed surface instead of a dead route.

import { UnderConstruction } from "@/components/under-construction";

export default function FavoritesScreen() {
  return (
    <UnderConstruction
      title="Favorite decks"
      message="Soon you'll be able to browse the community decks you've favorited from this page."
      secondaryLabel="Browse decks"
      secondaryHref="/decks"
    />
  );
}
