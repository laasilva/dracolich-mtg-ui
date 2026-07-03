// Account settings — placeholder until the user profile / preferences
// surface ships (planned as Phase 4.7.1).

import { UnderConstruction } from "@/components/under-construction";

export default function SettingsScreen() {
  return (
    <UnderConstruction
      title="Settings"
      message="Profile, display name, password, and notification preferences will live here once Phase 4.7 ships."
      secondaryLabel="Account hub"
      secondaryHref="/account"
    />
  );
}
