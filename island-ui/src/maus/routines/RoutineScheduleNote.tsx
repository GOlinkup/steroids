// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
import { t } from "../shared/i18n";
import { useStore } from "../shared/store";

/** Trimmed schedule note: cloud-home vs this-computer copy only. The
 * Cloud-plan upsell (add-cloud / open-cloud dialogs) is skipped;
 * add when the island wires the Cloud surfaces. */
export function RoutineScheduleNote() {
  const { state } = useStore();
  const cloudHome = state.config?.cloudHome === true;
  return (
    <p className="text-[11px] leading-relaxed text-ink-secondary">
      {cloudHome ? t("routines.scheduleNote.cloud") : t("routines.scheduleNote.local")}
    </p>
  );
}
