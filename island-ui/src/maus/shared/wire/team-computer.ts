// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
/** A named, workspace-owned Boat. Assignment grants one team's Auto bots
 * access to the same desktop, files and desktop browser sessions. */
export interface TeamComputer {
  id: string;
  name: string;
  section: string | null;
  state: string;
  held: boolean;
  problem?: string;
}

export interface TeamComputersPayload {
  computers: TeamComputer[];
  configured: boolean;
  problem?: string;
}
