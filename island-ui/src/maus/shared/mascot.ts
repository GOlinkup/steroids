// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): minimal cut of lib/mascot.ts. The island screens
// only need the color map (MAUS_COLORS) and the state/color/motion name
// types, so those travel light here: MausState/MausMotion are plain strings
// until the CursorAvatar component is ported. The full engine (39 states,
// normalizeState, stateForBot, STATE_GROUPS, PICKABLE_STATES) stays in
// openmaus src/lib/mascot.ts.

export const MAUS_COLOR_NAMES = [
  "green",
  "blue",
  "red",
  "orange",
  "purple",
  "cyan",
  "pink",
  "yellow",
  "teal",
  "coral",
] as const;

export type MausColor = (typeof MAUS_COLOR_NAMES)[number];

export const MAUS_COLORS = {
  green: "#009957",
  blue: "#377FE6",
  red: "#D94B52",
  orange: "#E78531",
  purple: "#8057C8",
  cyan: "#0EA5C6",
  pink: "#D84F8B",
  yellow: "#D8A729",
  teal: "#01A492",
  coral: "#E5634E",
} satisfies Record<MausColor, string>;

/** A CursorAvatar behaviour state name (full vocabulary in openmaus). */
export type MausState = string;

/** A mascot motion name; "none" means still. */
export type MausMotion = string;
