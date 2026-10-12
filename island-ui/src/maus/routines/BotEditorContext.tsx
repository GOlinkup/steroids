// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
import { createContext, useContext } from "react";
import { api } from "../shared/store";

/** Scoped routine-save transport for the EventEditor. Defaults to the
 * real API; the draft/uploadAvatar members of the original context are
 * skipped (bot creation editors only), add when the island needs them. */
export const BotEditorContext = createContext<{
  request: typeof api;
}>({ request: api });

export function useBotEditor() {
  return useContext(BotEditorContext);
}
