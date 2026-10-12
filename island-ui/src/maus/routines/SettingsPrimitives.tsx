// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
import type { ComponentProps } from "react";
import { cn } from "../shared/cn";

/** Minimal Switch for the Routines island (role=switch button).
 * Card/SettingRow/CommandLine from SettingsPrimitives are skipped;
 * add when the island needs them. */
export function Switch({
  checked,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children" | "role" | "aria-checked"> & { checked: boolean }) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
        checked ? "bg-accent" : "bg-control",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-[left] motion-reduce:transition-none",
          checked ? "left-[21px]" : "left-[3px]",
        )}
      />
    </button>
  );
}
