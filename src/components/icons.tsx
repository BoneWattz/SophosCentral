import type { ReactNode } from "react";

// Small stroke icons (Lucide-style) so we don't need an icon dependency.
function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconShield = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></Svg>
);
export const IconGrid = ({ size }: { size?: number }) => (
  <Svg size={size}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>
);
export const IconMonitor = ({ size }: { size?: number }) => (
  <Svg size={size}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>
);
export const IconUsers = ({ size }: { size?: number }) => (
  <Svg size={size}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.3 2.4 3.7 5.2" /></Svg>
);
export const IconSearch = ({ size }: { size?: number }) => (
  <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
);
export const IconMoon = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z" /></Svg>
);
export const IconSun = ({ size }: { size?: number }) => (
  <Svg size={size}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
export const IconTrash = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
);
export const IconLock = ({ size }: { size?: number }) => (
  <Svg size={size}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Svg>
);
export const IconFilter =({ size }: { size?: number }) => (
  <Svg size={size}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></Svg>
);
export const IconChevronLeft =({ size }: { size?: number }) => (
  <Svg size={size}><path d="M15 6l-6 6 6 6" /></Svg>
);
export const IconChevronRight = ({ size }: { size?: number }) => (
  <Svg size={size}><path d="M9 6l6 6-6 6" /></Svg>
);
