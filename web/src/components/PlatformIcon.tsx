interface PlatformIconProps {
  platform: string;
  className?: string;
}

function iconForPlatform(platform: string): JSX.Element {
  switch (platform) {
    case "instagram":
      return (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
        </>
      );
    case "tiktok":
      return (
        <path
          d="M14.7 4.5c.3 1.7 1.5 3.2 3.2 3.9v2.4a8.1 8.1 0 0 1-3.2-1V15a4.9 4.9 0 1 1-4.9-4.9c.4 0 .8 0 1.2.1v2.6a2.3 2.3 0 1 0 1.1 2V4.5h2.6Z"
          fill="currentColor"
        />
      );
    case "youtube":
      return (
        <>
          <rect x="3.8" y="6.2" width="16.4" height="11.6" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10.3 9.3 5.3 2.7-5.3 2.7V9.3Z" fill="currentColor" />
        </>
      );
    case "x":
      return (
        <path
          d="M5.2 4.5h3.2l3.7 5.1 4.3-5.1h2.5l-5.7 6.8 6 8.2H16l-3.9-5.4-4.6 5.4H4.9l6-7L5.2 4.5Zm2.8 1.9 8 11.2h1.3l-8-11.2H8Z"
          fill="currentColor"
        />
      );
    case "rednote":
      return (
        <>
          <path
            d="M7.3 4.8h7.1c2.4 0 4 1.5 4 3.8 0 1.7-.9 2.9-2.3 3.4l2 4.2h-2.9l-1.7-3.7H10v3.7H7.3V4.8Zm2.7 2.3v3.2h4c1 0 1.6-.6 1.6-1.6s-.6-1.6-1.6-1.6h-4Z"
            fill="currentColor"
          />
          <path d="M6.1 16.4c.9 1.7 2.8 2.8 5.1 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    default:
      return (
        <>
          <circle cx="7" cy="12" r="2.1" fill="currentColor" />
          <circle cx="17" cy="7" r="2.1" fill="currentColor" />
          <circle cx="17" cy="17" r="2.1" fill="currentColor" />
          <path d="M8.8 11.1 15.1 8M8.8 12.9 15.1 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
  }
}

export function PlatformIcon({ platform, className }: PlatformIconProps): JSX.Element {
  return (
    <span className={className ? `platform-badge ${className}` : "platform-badge"} title={platform}>
      <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {iconForPlatform(platform)}
      </svg>
    </span>
  );
}
