// Sets browser — placeholder until Phase 4.4 ships. Linked from the
// main nav, so a themed surface is friendlier than a one-liner stub.

import { UnderConstruction } from "@/components/under-construction";

export default function SetsScreen() {
  return (
    <UnderConstruction
      title="Sets"
      message="Browse every Magic set with release dates, card galleries, and set symbols. Shipping after the deck flows stabilize."
      secondaryLabel="Browse cards"
      secondaryHref="/cards"
    />
  );
}
