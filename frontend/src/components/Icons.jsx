const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

export function Logo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="12" width="3" height="6.5" fill="currentColor" />
      <rect x="10.5" y="7" width="3" height="11.5" fill="currentColor" />
      <rect x="15" y="10" width="3" height="8.5" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export const UploadIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v3h11v-3" />
  </svg>
);

export const DownloadIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v3h11v-3" />
  </svg>
);

export const PlusIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M8 3v10M3 8h10" />
  </svg>
);

export const SunIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
  </svg>
);

export const MoonIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" />
  </svg>
);

export const SearchIcon = (p) => (
  <svg {...base} width={14} height={14} {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </svg>
);

export const ChevronLeft = (p) => (
  <svg {...base} {...p}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);

export const ChevronRight = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export const CloseIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export function SortIcon({ direction, ...p }) {
  return (
    <svg {...base} width={12} height={12} viewBox="0 0 12 12" {...p}>
      <path d="M3.5 4.5 6 2l2.5 2.5" opacity={direction === "desc" ? 0.3 : 1} />
      <path d="M3.5 7.5 6 10l2.5-2.5" opacity={direction === "asc" ? 0.3 : 1} />
    </svg>
  );
}
