// Real Iconsax paths (iconsax-react 0.0.8, MIT) — Linear idle / Bold active,
// same icon language as GOlinkup Explore bottom nav.

interface P {
  size?: number;
  bold?: boolean;
}

function Svg({ size = 20, bold = false, linear, filled }: P & { linear: React.ReactNode; filled: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      {bold ? filled : linear}
    </svg>
  );
}

export function HomeIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="m9.02 2.84-5.39 4.2C2.73 7.74 2 9.23 2 10.36v7.41c0 2.32 1.89 4.22 4.21 4.22h11.58c2.32 0 4.21-1.9 4.21-4.21V10.5c0-1.21-.81-2.76-1.8-3.45l-6.18-4.33c-1.4-.98-3.65-.93-5 .12ZM12 17.99v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
      filled={
        <>
      <path d="m20.04 6.822-5.76-4.03c-1.57-1.1-3.98-1.04-5.49.13l-5.01 3.91c-1 .78-1.79 2.38-1.79 3.64v6.9c0 2.55 2.07 4.63 4.62 4.63h10.78c2.55 0 4.62-2.07 4.62-4.62v-6.78c0-1.35-.87-3.01-1.97-3.78Zm-7.29 11.18c0 .41-.34.75-.75.75s-.75-.34-.75-.75v-3c0-.41.34-.75.75-.75s.75.34.75.75v3Z" fill="currentColor" />
        </>
      }
    />
  );
}

export function ChatIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="M8.5 19H8c-4 0-6-1-6-6V8c0-4 2-6 6-6h8c4 0 6 2 6 6v5c0 4-2 6-6 6h-.5c-.31 0-.61.15-.8.4l-1.5 2c-.66.88-1.74.88-2.4 0l-1.5-2c-.16-.22-.53-.4-.8-.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.996 11h.01M11.995 11h.01M7.995 11h.008" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
      filled={
        <>
      <path d="M17 2H7C4.24 2 2 4.23 2 6.98v6.98c0 2.75 2.24 4.98 5 4.98h1.5c.27 0 .63.18.8.4l1.5 1.99c.66.88 1.74.88 2.4 0l1.5-1.99c.19-.25.49-.4.8-.4H17c2.76 0 5-2.23 5-4.98V6.98C22 4.23 19.76 2 17 2ZM8 12c-.56 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.44 1-1 1Zm4 0c-.56 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.44 1-1 1Zm4 0c-.56 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.44 1-1 1Z" fill="currentColor" />
        </>
      }
    />
  );
}

export function LensIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="M6.76 22h10.48c2.76 0 3.86-1.69 3.99-3.75l.52-8.26A3.753 3.753 0 0 0 18 6c-.61 0-1.17-.35-1.45-.89l-.72-1.45C15.37 2.75 14.17 2 13.15 2h-2.29c-1.03 0-2.23.75-2.69 1.66l-.72 1.45C7.17 5.65 6.61 6 6 6 3.83 6 2.11 7.83 2.25 9.99l.52 8.26C2.89 20.31 4 22 6.76 22ZM10.5 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18c1.79 0 3.25-1.46 3.25-3.25S13.79 11.5 12 11.5s-3.25 1.46-3.25 3.25S10.21 18 12 18Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
      filled={
        <>
      <path d="M18 6c-.61 0-1.17-.35-1.45-.89l-.72-1.45C15.37 2.75 14.17 2 13.15 2h-2.29c-1.03 0-2.23.75-2.69 1.66l-.72 1.45C7.17 5.65 6.61 6 6 6 3.83 6 2.11 7.83 2.25 9.99l.52 8.26C2.89 20.31 4 22 6.76 22h10.48c2.76 0 3.86-1.69 3.99-3.75l.52-8.26A3.753 3.753 0 0 0 18 6Zm-7.5 1.25h3c.41 0 .75.34.75.75s-.34.75-.75.75h-3c-.41 0-.75-.34-.75-.75s.34-.75.75-.75ZM12 18.12c-1.86 0-3.38-1.51-3.38-3.38 0-1.87 1.51-3.38 3.38-3.38 1.87 0 3.38 1.51 3.38 3.38 0 1.87-1.52 3.38-3.38 3.38Z" fill="currentColor" />
        </>
      }
    />
  );
}

export function PlusIcon({ size = 20, bold = false }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={bold ? 2.5 : 1.8}
      strokeLinecap="round"
      aria-hidden
      style={{ display: "block" }}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// Compass — Explore tab. Plain stroke like PlusIcon, bolder when active.
export function ExploreIcon({ size = 20, bold = false }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={bold ? 2.2 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block" }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" fill={bold ? "currentColor" : "none"} />
    </svg>
  );
}

export function SoundOnIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="M2 10v4c0 2 1 3 3 3h1.43c.37 0 .74.11 1.06.3l2.92 1.83c2.52 1.58 4.59.43 4.59-2.54V7.41c0-2.98-2.07-4.12-4.59-2.54L7.49 6.7c-.32.19-.69.3-1.06.3H5c-2 0-3 1-3 3Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 8a6.66 6.66 0 0 1 0 8M19.83 5.5a10.83 10.83 0 0 1 0 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
      filled={
        <>
      <path d="M18 16.75a.75.75 0 0 1-.6-1.2 5.94 5.94 0 0 0 0-7.1.75.75 0 0 1 1.2-.9c1.96 2.62 1.96 6.28 0 8.9-.15.2-.37.3-.6.3Z" fill="currentColor" />
      <path d="M19.828 19.25a.75.75 0 0 1-.6-1.2c2.67-3.56 2.67-8.54 0-12.1a.75.75 0 0 1 1.2-.9c3.07 4.09 3.07 9.81 0 13.9-.14.2-.37.3-.6.3ZM14.02 3.782c-1.12-.62-2.55-.46-4.01.45l-2.92 1.83c-.2.12-.43.19-.66.19H5c-2.42 0-3.75 1.33-3.75 3.75v4c0 2.42 1.33 3.75 3.75 3.75H6.43c.23 0 .46.07.66.19l2.92 1.83c.88.55 1.74.82 2.54.82a3 3 0 0 0 1.47-.37c1.11-.62 1.73-1.91 1.73-3.63v-9.18c0-1.72-.62-3.01-1.73-3.63Z" fill="currentColor" />
        </>
      }
    />
  );
}

export function SoundOffIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="M15 8.37v-.96c0-2.98-2.07-4.12-4.59-2.54L7.49 6.7c-.32.19-.69.3-1.06.3H5c-2 0-3 1-3 3v4c0 2 1 3 3 3h2M10.41 19.13c2.52 1.58 4.59.43 4.59-2.54v-3.64M18.81 9.42c.9 2.15.63 4.66-.81 6.58M21.15 7.8a10.82 10.82 0 0 1-1.32 10.7M22 2 2 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
      filled={
        <>
      <path d="M18 16.75a.75.75 0 0 1-.6-1.2 5.926 5.926 0 0 0 .72-5.84.75.75 0 0 1 .4-.98c.38-.16.82.02.98.4 1.02 2.42.67 5.23-.9 7.33-.15.19-.37.29-.6.29Z" fill="currentColor" />
      <path d="M19.828 19.25a.75.75 0 0 1-.6-1.2c2.14-2.85 2.61-6.67 1.23-9.96a.75.75 0 0 1 .4-.98c.38-.16.82.02.98.4 1.59 3.78 1.05 8.16-1.41 11.44-.14.2-.37.3-.6.3ZM14.04 12.958c.63-.63 1.71-.18 1.71.71v2.93c0 1.72-.62 3.01-1.73 3.63a3 3 0 0 1-1.47.37c-.8 0-1.66-.27-2.54-.82l-.64-.4c-.54-.34-.63-1.1-.18-1.55l4.85-4.87ZM21.77 2.229c-.3-.3-.79-.3-1.09 0l-4.95 4.95c-.06-1.6-.66-2.8-1.72-3.39-1.12-.62-2.55-.46-4.01.45l-2.91 1.82c-.2.12-.43.19-.66.19H5c-2.42 0-3.75 1.33-3.75 3.75v4c0 2.42 1.33 3.75 3.75 3.75h.16l-2.94 2.94c-.3.3-.3.79 0 1.09.16.14.35.22.55.22.2 0 .39-.08.54-.23l18.46-18.46c.31-.3.31-.78 0-1.08Z" fill="currentColor" />
        </>
      }
    />
  );
}

export function GearIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12.88v-1.76c0-1.04.85-1.9 1.9-1.9 1.81 0 2.55-1.28 1.64-2.85-.52-.9-.21-2.07.7-2.59l1.73-.99c.79-.47 1.81-.19 2.28.6l.11.19c.9 1.57 2.38 1.57 3.29 0l.11-.19c.47-.79 1.49-1.07 2.28-.6l1.73.99c.91.52 1.22 1.69.7 2.59-.91 1.57-.17 2.85 1.64 2.85 1.04 0 1.9.85 1.9 1.9v1.76c0 1.04-.85 1.9-1.9 1.9-1.81 0-2.55 1.28-1.64 2.85.52.91.21 2.07-.7 2.59l-1.73.99c-.79.47-1.81.19-2.28-.6l-.11-.19c-.9-1.57-2.38-1.57-3.29 0l-.11.19c-.47.79-1.49 1.07-2.28.6l-1.73-.99a1.899 1.899 0 0 1-.7-2.59c.91-1.57.17-2.85-1.64-2.85-1.05 0-1.9-.86-1.9-1.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      }
      filled={
        <>
      <path d="M20.1 9.221c-1.81 0-2.55-1.28-1.65-2.85.52-.91.21-2.07-.7-2.59l-1.73-.99c-.79-.47-1.81-.19-2.28.6l-.11.19c-.9 1.57-2.38 1.57-3.29 0l-.11-.19a1.641 1.641 0 0 0-2.26-.6l-1.73.99c-.91.52-1.22 1.69-.7 2.6.91 1.56.17 2.84-1.64 2.84-1.04 0-1.9.85-1.9 1.9v1.76c0 1.04.85 1.9 1.9 1.9 1.81 0 2.55 1.28 1.64 2.85-.52.91-.21 2.07.7 2.59l1.73.99c.79.47 1.81.19 2.28-.6l.11-.19c.9-1.57 2.38-1.57 3.29 0l.11.19c.47.79 1.49 1.07 2.28.6l1.73-.99c.91-.52 1.22-1.69.7-2.59-.91-1.57-.17-2.85 1.64-2.85 1.04 0 1.9-.85 1.9-1.9v-1.76a1.92 1.92 0 0 0-1.91-1.9Zm-8.1 6.03c-1.79 0-3.25-1.46-3.25-3.25s1.46-3.25 3.25-3.25 3.25 1.46 3.25 3.25-1.46 3.25-3.25 3.25Z" fill="currentColor" />
        </>
      }
    />
  );
}
// Real Iconsax paths (iconsax-react 0.0.8, MIT) — Notification Linear/Bold.
export function BellIcon({ size = 20, bold = false }: P) {
  return (
    <Svg size={size} bold={bold}
      linear={
        <>
      <path d="M12.02 2.91c-3.31 0-6 2.69-6 6v2.89c0 .61-.26 1.54-.57 2.06L4.3 15.77c-.71 1.18-.22 2.49 1.08 2.93 4.31 1.44 8.96 1.44 13.27 0 1.21-.4 1.74-1.83 1.08-2.93l-1.15-1.91c-.3-.52-.56-1.45-.56-2.06V8.91c0-3.3-2.7-6-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" />
      <path d="M13.87 3.2a6.754 6.754 0 0 0-3.7 0c.29-.74 1.01-1.26 1.85-1.26.84 0 1.56.52 1.85 1.26Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.02 19.06c0 1.65-1.35 3-3 3-.82 0-1.58-.34-2.12-.88a3.01 3.01 0 0 1-.88-2.12" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" />
        </>
      }
      filled={
        <>
      <path d="m19.34 14.49-1-1.66c-.21-.37-.4-1.07-.4-1.48V8.82a5.91 5.91 0 0 0-3.37-5.33A2.926 2.926 0 0 0 11.99 2c-1.09 0-2.07.59-2.59 1.52-1.95.97-3.3 2.98-3.3 5.3v2.53c0 .41-.19 1.11-.4 1.47l-1.01 1.67c-.4.67-.49 1.41-.24 2.09.24.67.81 1.19 1.55 1.44 1.94.66 3.98.98 6.02.98 2.04 0 4.08-.32 6.02-.97.7-.23 1.24-.76 1.5-1.45s.19-1.45-.2-2.09ZM14.83 20.01A3.014 3.014 0 0 1 12 22c-.79 0-1.57-.32-2.12-.89-.32-.3-.56-.7-.7-1.11.13.02.26.03.4.05.23.03.47.06.71.08.57.05 1.15.08 1.73.08.57 0 1.14-.03 1.7-.08.21-.02.42-.03.62-.06l.49-.06Z" fill="currentColor" />
        </>
      }
    />
  );
}
export function XIcon({ size = 12 }: P) {  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden
      style={{ display: "block" }}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
// Trash — history row delete (chat + terminal session rows).
export function TrashIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M4 7h16M10 11v6M14 11v6M6.5 7l.8 12.1A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.9L17.5 7M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
    </svg>
  );
}
export function MicIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block" }}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

// Chevron — picker pills + nested submenu. Same plain stroke as PlusIcon.
export function ChevronDownIcon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Send — composer send button.
export function ArrowUpIcon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

// History — header chat-history button.
export function HistoryIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

// Copy — message action: copy reply text.
export function CopyIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

// Check — copy confirmation swap.
export function CheckIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

// Thumbs up / down — message vote pair, same plain stroke as PlusIcon.
export function ThumbUpIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4-7c1.5 0 2.5 1 2.5 2.5V9h5.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17.4 19H7" />
    </svg>
  );
}

export function ThumbDownIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3Zm0 0-4 7c-1.5 0-2.5-1-2.5-2.5V15H4.9a2 2 0 0 1-2-2.4l1.2-6A2 2 0 0 1 6.6 5H17" />
    </svg>
  );
}

// Pencil — edit a sent user message back into the composer.
export function PencilIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

// Bolt — effort pill mark.
export function BoltIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

// Reset — effort reset button.
export function ResetIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />
    </svg>
  );
}

// Stop — replaces send while a turn is running (ChatGPT-style stop).
export function StopIcon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

// Hand — lens hand-control toggle. Same plain stroke as PlusIcon.
export function HandIcon({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.3l-2-3.6a1.6 1.6 0 0 1 2.6-1.8L8 14" />
    </svg>
  );
}

// Phone — drop-to-PC button (relay live, outbox offline).
export function PhoneIcon({ size = 10 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

// Person — avatar fallback when signed out (no photo fetched, ever).
export function PersonIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

// Logout — red sign-out row, same plain stroke as PlusIcon.
export function LogoutIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M14 4h-8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8M10 12h11m0 0-3-3m3 3-3 3" />
    </svg>
  );
}
// Card — subscription row, same plain stroke as PlusIcon.
export function CardIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18M7 15h4" />
    </svg>
  );
}

// Help — help-center row, same plain stroke as PlusIcon.
export function HelpIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.34c-.8.32-.9.8-.9 1.66" />
      <path d="M12 16.5h.01" strokeWidth={2.2} />
    </svg>
  );
}

// Drop — send-to-device button. Droplet, not a handset: no call vibes.
export function DropIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ display: "block", flex: "none" }}>
      <path d="M12 3.5c3.2 4.2 5.5 7.5 5.5 10.7a5.5 5.5 0 0 1-11 0C6.5 11 8.8 7.7 12 3.5Z" />
      <path d="M12 12.5v5m0 0-2-2m2 2 2-2" />
    </svg>
  );
}
