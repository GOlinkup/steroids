// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// Minimal stub of components/ProviderIcons.tsx: a letter tile per driver
// kind. The official brand SVG marks are skipped — the canvas only shows a
// small model badge beside each bot.
import { cn } from "../shared/cn";
import type { InstanceInfo } from "../shared/store";

export interface IconProps {
  size?: number;
  className?: string;
}

export function ProviderMark({ driverKind, size = 16, className }: IconProps & { driverKind: string }) {
  const letter = (driverKind.replace(/Agent$/i, "").slice(0, 1) || "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("flex items-center justify-center rounded bg-control font-semibold text-ink-secondary", className)}
      style={{ width: size, height: size, fontSize: size * 0.62 }}
    >
      {letter}
    </span>
  );
}

export function InstanceProviderMark({ instance, size = 16, className }: IconProps & {
  instance: Pick<InstanceInfo, "driverKind" | "icon">;
}) {
  void instance.icon;
  return <ProviderMark driverKind={instance.driverKind} size={size} className={className} />;
}
