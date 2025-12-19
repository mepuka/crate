/**
 * StreamingLinks Component
 *
 * "Listening Station Pills" - Record store catalog aesthetic
 * Platform colors subdued until hover, warmed to match vinyl culture.
 *
 * Design Philosophy:
 * - Invitation, not advertisement
 * - Record clerk recommendation vibe
 * - Platform identity preserved but humble
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface StreamingLink {
  readonly platform: "spotify" | "apple_music" | "bandcamp" | "soundcloud" | "youtube_music";
  readonly kind: "track" | "album" | "artist" | "playlist";
  readonly url: string;
  readonly id?: string | undefined;
  readonly display?: string | undefined;
  readonly confidence?: number | undefined;
  readonly source: "recording_mbid" | "release_group_mbid" | "release_mbid" | "artist_mbid";
}

interface StreamingLinksProps {
  links: readonly StreamingLink[];
  albumPalette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
  onLinkClick?: (link: StreamingLink) => void;
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// Platform Config
// ============================================================================

const PLATFORM_CONFIG = {
  spotify: {
    label: "Spotify",
    color: "#1DB954",
    warmColor: "#2ECC71",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  apple_music: {
    label: "Apple Music",
    color: "#FC3C44",
    warmColor: "#E8825B",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.99c-.042.003-.083.01-.124.013-.492.022-.983.062-1.46.153-.724.138-1.378.4-1.98.797a4.73 4.73 0 00-1.56 1.778c-.395.718-.588 1.5-.655 2.318a8.76 8.76 0 00-.06.925v9.9c.01.283.028.565.066.847.097.74.27 1.447.59 2.11.365.756.88 1.37 1.54 1.863.572.428 1.22.727 1.92.864.463.087.93.128 1.402.136.36.01.722.005 1.083.005h10.4c.36 0 .722.005 1.082-.004.473-.008.94-.05 1.403-.137.7-.137 1.35-.436 1.92-.864.66-.493 1.176-1.107 1.54-1.863.32-.663.494-1.37.59-2.11.038-.282.056-.564.066-.847V6.5c-.003-.125-.01-.25-.017-.376zm-6.237 2.15l-.008 8.15c0 .34-.04.67-.133.995-.155.54-.415.95-.875 1.23-.345.212-.728.33-1.128.36-.49.042-1.063-.01-1.52-.165-.756-.25-1.254-.772-1.408-1.55a2.06 2.06 0 01.28-1.564c.276-.413.66-.7 1.11-.905.364-.165.75-.262 1.14-.346.366-.078.732-.16 1.082-.29.19-.073.328-.195.383-.404a.86.86 0 00.023-.22V8.64c0-.245-.1-.36-.342-.334l-5.64.87c-.137.02-.224.102-.25.24-.006.032-.01.064-.01.097v8.347c0 .346-.04.685-.134 1.012-.17.596-.462 1.04-.978 1.33-.34.19-.706.3-1.09.33-.48.04-.966 0-1.425-.15-.783-.25-1.31-.768-1.477-1.574-.137-.66-.012-1.26.42-1.78.306-.37.705-.62 1.152-.794.34-.133.694-.217 1.05-.296.368-.08.74-.163 1.092-.297.252-.096.417-.27.454-.546.01-.07.012-.14.012-.208V6.8c0-.3.082-.524.34-.67.138-.078.29-.127.447-.152l6.63-1.22c.178-.032.36-.046.54-.01.24.044.388.184.43.43.016.09.02.18.02.27v2.826z" />
      </svg>
    ),
  },
  bandcamp: {
    label: "Bandcamp",
    color: "#1DA0C3",
    warmColor: "#4ECDC4",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M0 18.75l7.437-13.5H24l-7.438 13.5H0z" />
      </svg>
    ),
  },
  soundcloud: {
    label: "SoundCloud",
    color: "#FF5500",
    warmColor: "#E8825B",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.102-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.201-1.308-.196-1.332c-.01-.057-.049-.094-.09-.094m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.057-.104-.121-.104m.945-.089c-.075 0-.135.06-.135.135l-.193 2.652.21 2.465c0 .075.06.135.135.135s.135-.06.135-.135l.24-2.465-.24-2.652c0-.075-.06-.135-.135-.135m1.004.225c-.09 0-.15.075-.15.165l-.179 2.427.179 2.449c0 .09.06.165.15.165s.165-.075.165-.165l.211-2.449-.211-2.427c0-.09-.075-.165-.165-.165m1.139-.27c-.104 0-.18.09-.18.18l-.165 2.517.179 2.397c0 .104.075.18.18.18.104 0 .18-.09.18-.18l.195-2.397-.195-2.517c0-.09-.075-.18-.18-.18m1.125-.18c-.12 0-.195.09-.195.195l-.15 2.697.15 2.412c0 .12.09.195.195.195s.195-.089.195-.195l.164-2.412-.165-2.697c0-.105-.089-.195-.194-.195m1.215-.016c-.136 0-.225.105-.225.225l-.15 2.713.15 2.387c0 .136.09.225.225.225.136 0 .225-.09.225-.225l.166-2.387-.166-2.713c0-.12-.089-.225-.225-.225m1.155 0c-.15 0-.24.105-.24.24l-.12 2.713.12 2.387c0 .15.09.24.24.24s.24-.09.255-.24l.135-2.387-.135-2.713c-.015-.135-.105-.24-.255-.24m1.334-.045c-.166 0-.27.105-.27.255l-.12 2.758.135 2.342c.015.15.105.255.27.255.15 0 .255-.105.27-.255l.135-2.342-.15-2.758c0-.15-.105-.255-.27-.255m1.095-.135c-.165 0-.285.12-.285.27L9.54 14.44l.135 2.297c0 .165.12.285.3.285.165 0 .285-.12.285-.285l.135-2.297-.135-2.818c0-.165-.12-.27-.285-.27m1.244.015c-.18 0-.3.135-.3.3l-.119 2.773.119 2.282c0 .181.12.3.3.3.181 0 .3-.119.316-.3l.119-2.282-.135-2.773c0-.18-.12-.3-.3-.3m1.154-.15c-.195 0-.314.135-.314.3l-.12 2.923.12 2.252c0 .181.12.315.315.315.195 0 .315-.135.315-.315l.12-2.252-.12-2.923c-.016-.181-.135-.3-.316-.3m1.125 0c-.195 0-.33.135-.33.315l-.1 2.923.1 2.237c.015.194.135.329.33.329.194 0 .329-.135.344-.33l.105-2.236-.12-2.923c0-.18-.135-.315-.33-.315m1.229-.18c-.21 0-.345.135-.345.33l-.09 3.103.105 2.207c.015.21.135.345.345.345.195 0 .345-.135.345-.345l.12-2.207-.12-3.103c-.015-.195-.15-.33-.36-.33m1.155.18c-.21 0-.375.165-.375.36l-.075 2.923.09 2.191c.015.21.165.36.375.36.195 0 .375-.15.375-.36l.105-2.191-.12-2.923c0-.21-.165-.36-.375-.36m1.74-1.544c-.09 0-.165.03-.225.09-.075.06-.105.135-.12.225l-.105 4.283.12 2.162c0 .18.165.33.345.33.195 0 .345-.15.36-.33l.105-2.162-.12-4.283c0-.09-.045-.165-.105-.225-.06-.06-.135-.09-.24-.09m1.575-.225c-.12 0-.21.045-.285.12-.075.06-.12.149-.12.254l-.12 4.523.12 2.117c.015.21.165.375.39.375.225 0 .39-.165.405-.375l.12-2.117-.135-4.523c0-.105-.045-.195-.12-.254-.075-.075-.165-.12-.27-.12m1.53-.344c-.12 0-.225.044-.3.12-.09.074-.12.164-.135.27l-.105 4.867.12 2.073c.015.225.18.39.42.39.239 0 .405-.165.42-.39l.12-2.073-.135-4.867c0-.105-.045-.195-.135-.27-.075-.091-.18-.135-.285-.135m1.515-.42c-.135 0-.255.06-.33.135-.09.09-.135.195-.135.315l-.12 5.287.12 2.013c.015.255.195.435.465.435.254 0 .435-.18.45-.42l.135-2.028-.135-5.287c0-.12-.045-.225-.135-.315-.09-.075-.195-.135-.33-.135m1.574-.164c-.15 0-.269.045-.359.135-.075.09-.135.21-.135.33l-.12 5.435.12 1.98c.015.27.21.465.494.465.27 0 .465-.195.48-.465l.135-1.98-.135-5.435c0-.12-.06-.24-.135-.33-.09-.09-.21-.135-.36-.135m1.44.075c-.15 0-.284.06-.374.15-.09.105-.135.225-.135.375l-.105 5.4.12 1.92c.015.284.225.51.524.51.284 0 .495-.225.51-.51l.12-1.92-.135-5.4c0-.15-.045-.27-.135-.375-.104-.09-.224-.15-.389-.15" />
      </svg>
    ),
  },
  youtube_music: {
    label: "YouTube Music",
    color: "#FF0000",
    warmColor: "#E74C3C",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
      </svg>
    ),
  },
} as const;

// ============================================================================
// Components
// ============================================================================

/**
 * Individual streaming platform pill
 */
const StreamingPill = ({
  link,
  onClick,
}: {
  link: StreamingLink;
  onClick?: () => void;
}) => {
  const config = PLATFORM_CONFIG[link.platform];

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onClick?.()}
      className={cn(
        "group relative inline-flex items-center gap-2",
        "px-4 py-2.5 rounded-full",
        "border border-foreground/10",
        "bg-gradient-to-br from-card/40 to-card/20",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg hover:-translate-y-0.5",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background",
        "min-h-[44px]"
      )}
      style={
        {
          "--platform-color": config.warmColor,
          "--platform-glow": `${config.warmColor}40`,
        } as React.CSSProperties
      }
      title={`Listen on ${config.label}`}
    >
      {/* Background glow on hover */}
      <div
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"
        style={{
          background: `radial-gradient(circle at center, var(--platform-glow) 0%, transparent 70%)`,
          filter: "blur(8px)",
        }}
      />

      {/* Platform icon with animated color shift */}
      <span className="relative transition-colors duration-300 text-foreground/50 group-hover:text-[var(--platform-color)]">
        {/* Needle drop indicator - appears on hover */}
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-current opacity-0 group-hover:opacity-100 group-hover:animate-pulse transition-opacity" />
        {config.icon}
      </span>

      {/* Label */}
      <span
        className={cn(
          "text-xs font-medium uppercase tracking-[0.1em]",
          "text-foreground/60 group-hover:text-foreground/90",
          "transition-colors duration-300"
        )}
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {config.label}
      </span>

      {/* Subtle external indicator */}
      <svg
        className="w-3 h-3 text-foreground/30 group-hover:text-foreground/60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M7 17L17 7M17 7H7M17 7V17" />
      </svg>

      {/* Border highlight on hover */}
      <div className="absolute inset-0 rounded-full border border-transparent group-hover:border-[var(--platform-color)] opacity-0 group-hover:opacity-40 transition-all duration-300" />
    </a>
  );
};

/**
 * Loading skeleton for streaming pills
 */
const StreamingPillSkeleton = () => (
  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-foreground/5 animate-pulse min-h-[44px]">
    <div className="w-4 h-4 rounded-full bg-foreground/10" />
    <div className="w-16 h-3 rounded bg-foreground/10" />
  </div>
);

/**
 * Main StreamingLinks Component
 */
export const StreamingLinks = ({
  links,
  albumPalette,
  onLinkClick,
  isLoading = false,
  className,
}: StreamingLinksProps) => {
  // Sort by platform priority (Spotify and Apple first, then alphabetically)
  const sortedLinks = useMemo(() => {
    const priority = {
      spotify: 0,
      apple_music: 1,
      bandcamp: 2,
      youtube_music: 3,
      soundcloud: 4,
    };
    return [...links].sort(
      (a, b) => (priority[a.platform] ?? 99) - (priority[b.platform] ?? 99)
    );
  }, [links]);

  // Empty state - no links available
  if (!isLoading && links.length === 0) {
    return null; // Graceful absence - no visual noise
  }

  const palette = albumPalette ?? {
    dominant: "#E8825B",
    accent: "#4ECDC4",
    temperature: "warm" as const,
  };

  return (
    <div className={cn("relative py-4", className)}>
      {/* Section divider - subtle catalog line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${palette.dominant}20 20%, ${palette.dominant}20 80%, transparent 100%)`,
        }}
      />

      {/* Header - catalog card aesthetic */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] uppercase tracking-[0.2em] font-medium"
          style={{
            color: `${palette.dominant}80`,
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          Listen
        </span>
        {/* Decorative dot */}
        <span
          className="w-1 h-1 rounded-full"
          style={{ backgroundColor: `${palette.accent}60` }}
        />
      </div>

      {/* Links container */}
      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <>
            <StreamingPillSkeleton />
            <StreamingPillSkeleton />
          </>
        ) : (
          sortedLinks.map((link) => (
            <StreamingPill
              key={`${link.platform}-${link.kind}`}
              link={link}
              onClick={() => onLinkClick?.(link)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default StreamingLinks;
