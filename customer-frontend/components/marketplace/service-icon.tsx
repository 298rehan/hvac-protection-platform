import {
  AlertIcon,
  BoltIcon,
  ClipboardIcon,
  HomeIcon,
  ShieldIcon,
  SnowflakeIcon,
  WrenchIcon,
} from "@/components/icons";
import { cx } from "@/lib/format";

const ICONS: Record<string, typeof WrenchIcon> = {
  snowflake: SnowflakeIcon,
  sparkles: SnowflakeIcon,
  wrench: WrenchIcon,
  bolt: BoltIcon,
  layers: ClipboardIcon,
  home: HomeIcon,
  alert: AlertIcon,
  shield: ShieldIcon,
};

/** Draws the catalog's icon name; unknown names fall back to a wrench. */
export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? WrenchIcon;
  return (
    <span
      className={cx(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100",
        className,
      )}
    >
      <Icon />
    </span>
  );
}
