import type { ReactNode } from "react";

import { cx } from "@/lib/format";

/*
 * Inline stroke icons (24px grid, 1.8 stroke) so the panel needs no icon
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

export const GridIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>,
);

export const UsersIcon = icon(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 6M17.5 19.5a5 5 0 0 0-2.2-4" />
  </>,
);

export const LayersIcon = icon(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3.5 12.5 8.5 4.7 8.5-4.7" />
  </>,
);

export const ReceiptIcon = icon(
  <>
    <path d="M5 3h14v18l-2.3-1.6-2.4 1.6-2.3-1.6L9.7 21l-2.4-1.6L5 21V3Z" />
    <path d="M9 8h6M9 12h6" />
  </>,
);

export const ShieldIcon = icon(
  <>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);

export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </>,
);

export const BanIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.7 5.7 12.6 12.6" />
  </>,
);

export const DollarIcon = icon(
  <path d="M12 3v18M16.5 7.5c-.7-1.3-2.3-2-4.5-2-2.6 0-4.3 1.2-4.3 3.1 0 4.4 9 2.3 9 6.8 0 2-1.9 3.1-4.7 3.1-2.3 0-4-.8-4.8-2.3" />,
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </>,
);

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

export const PencilIcon = icon(
  <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
);

export const TrashIcon = icon(
  <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5M14 11v5" />,
);

export const ArrowLeftIcon = icon(<path d="M19 12H5m5 5-5-5 5-5" />);

export const ArrowRightIcon = icon(<path d="M5 12h14m-5-5 5 5-5 5" />);

export const ChevronRightIcon = icon(<path d="m9 6 6 6-6 6" />);

export const MenuIcon = icon(<path d="M4 7h16M4 12h16M4 17h16" />);

export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);

export const LogoutIcon = icon(
  <>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M9.5 16.5 5 12l4.5-4.5M5 12h10" />
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

export const MailIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </>,
);

export const PhoneIcon = icon(
  <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />,
);

export const MapPinIcon = icon(
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </>,
);
