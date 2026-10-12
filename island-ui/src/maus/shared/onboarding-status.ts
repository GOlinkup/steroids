// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): type-only cut of lib/onboarding.ts — the store
// only needs the OnboardingStatus shape for ConfigStatus. The welcome-flow
// logic stays in openmaus src/lib/onboarding.ts with the unported tour.
export interface OnboardingStatus {
  /** ISO timestamp; "" until the welcome flow has been finished or skipped. */
  completedAt: string;
  /** Which welcome flow was completed; a newer flow may re-show itself. */
  version: number;
  reelSeen: boolean;
  hintsSeen: string[];
  /** OMB Cloud home only: when a bot's turn first finished there. The
   * server writes it (server/cloud-home.ts firstCloudTurnPatch). */
  firstTurnAt?: string;
}
