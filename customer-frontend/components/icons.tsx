import type { ReactNode } from "react";

import { cx } from "@/lib/format";

/*
 * Inline stroke icons (24px grid, 1.8 stroke) so the site needs no icon
 * package. Every icon is decorative and hidden from assistive technology;
 * pair it with visible text or an aria-label on the parent control.
 */

type IconProps = { className?: string };

function icon(paths: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={cx("h-5 w-5 shrink-0", className)}
      >
        {paths}
      </svg>
    );
  };
}

export const ShieldIcon = icon(
  <>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);

export const BoltIcon = icon(<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />);

export const MapPinIcon = icon(
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </>,
);

export const WrenchIcon = icon(
  <path d="M14.7 6.3a4 4 0 0 0 5 5L21 12.6a5.5 5.5 0 0 1-7.3 1.4l-6.9 6.9a2 2 0 0 1-2.8-2.8l6.9-6.9A5.5 5.5 0 0 1 12.3 4l1.3 1.3-.9 1Z" />,
);

export const ArrowRightIcon = icon(<path d="M5 12h14m-5-5 5 5-5 5" />);

export const ArrowLeftIcon = icon(<path d="M19 12H5m5 5-5-5 5-5" />);

export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);

export const HomeIcon = icon(
  <>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
  </>,
);

export const UserIcon = icon(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </>,
);

export const ReceiptIcon = icon(
  <>
    <path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.3V3Z" />
    <path d="M9.5 8h5M9.5 12h5" />
  </>,
);

export const CalendarIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8.5 3v4M15.5 3v4" />
  </>,
);

export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.1" />
  </>,
);

export const CheckCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.4 2.4 4.6-4.8" />
  </>,
);

export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.1" />
  </>,
);

export const LockIcon = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </>,
);

export const MenuIcon = icon(<path d="M4 7h16M4 12h16M4 17h16" />);

export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);

export const LogoutIcon = icon(
  <>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M9.5 16.5 5 12l4.5-4.5M5 12h10" />
  </>,
);

export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
