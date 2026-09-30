import { cx } from "@/lib/format";

/** Summit Air brand mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-white shadow-sm",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v18M3 12h18M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"
        />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
