---
name: music-ui-patterns
description: Domain-specific UI patterns for music interfaces - album art, metadata, timelines, playback, and music service integration
---

# Music-Specific UI Patterns

## Purpose

This skill provides domain-specific UI patterns for music-related interfaces. Use this skill when building features related to album art, music metadata, play history, streaming service integration, or audio playback.

## Core Music UI Components

### 1. Album Art Display

Album art is the primary visual anchor in music UIs. Handle it with care.

#### Size Guidelines

**Common sizes:**
- **Thumbnail**: 40-80px (list items, compact views)
- **Standard**: 120-160px (cards, grid items)
- **Large**: 240-320px (detail views, now playing)
- **Hero**: 400-600px (full-screen detail, landing pages)

**Aspect ratio:** Always square (1:1)

**Implementation:**
```tsx
interface AlbumArtProps {
  src: string | null | undefined;
  alt: string;
  size: number;
  className?: string;
}

export function AlbumArt({ src, alt, size, className }: AlbumArtProps) {
  const [hasError, setHasError] = useState(false);

  // Fallback for missing/failed images
  if (!src || hasError) {
    return (
      <div
        className={cn(
          "shrink-0 bg-muted flex items-center justify-center rounded",
          className
        )}
        style={{ width: size, height: size }}
        aria-label={`${alt} - Album art not available`}
      >
        <MusicIcon className="h-1/2 w-1/2 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setHasError(true)}
      className={cn("shrink-0 object-cover rounded", className)}
    />
  );
}
```

#### Placeholder States

**Missing album art:**
- Show music note icon in muted color
- Maintain aspect ratio (no stretching)
- Include aria-label indicating missing art

**Loading state:**
- Skeleton or spinner while loading
- Smooth transition when image loads

**Error state:**
- Fallback to placeholder after image fails to load
- Log error for debugging (404s, CORS issues)

#### Accessibility

```tsx
// ✅ GOOD: Descriptive alt text
<AlbumArt
  src={play.image_uri}
  alt={`${play.album} by ${play.artist}`}
  size={120}
/>

// ✅ GOOD: Decorative in list context (metadata already visible)
<AlbumArt
  src={play.image_uri}
  alt=""  // Empty alt since metadata is adjacent
  size={60}
/>

// ❌ BAD: Generic alt text
<img src={albumArt} alt="album art" />
```

### 2. Music Metadata Display

Music metadata has established hierarchy and formatting conventions.

#### Metadata Hierarchy

**Primary (most prominent):**
- Song/track title
- Album name (in album context)
- Artist name (in artist context)

**Secondary:**
- Artist name (in song context)
- Album name (in song context)
- Release year

**Tertiary:**
- Track number
- Duration
- Genre/labels
- Record label

#### Formatting Conventions

**Song titles:**
- Sentence case or title case (match source)
- Truncate with ellipsis if too long
- Show full title on hover/focus

**Artist names:**
- Use "&" for collaborations (not "and")
- Use "feat." for featured artists
- Format: "Primary Artist feat. Featured Artist"

**Album names:**
- Italicize in editorial contexts
- Regular weight in UI contexts
- Include year when disambiguating

**Separators:**
- Use "•" (bullet) for inline metadata
- Use "·" (middle dot) for compact metadata
- Example: "Song • Artist • Album • 2023"

#### Typography Scale

```tsx
// Song title (primary)
<h3 className="text-lg font-semibold truncate"
    style={{ fontFamily: 'var(--font-family-display)' }}>
  {play.song}
</h3>

// Artist name (secondary)
<p className="text-base font-medium truncate"
   style={{ fontFamily: 'var(--font-family-body)' }}>
  {play.artist}
</p>

// Album + year (tertiary)
<p className="text-sm text-muted-foreground truncate">
  {play.album} • {releaseYear}
</p>

// Labels/badges (tertiary)
<span className="text-xs text-muted-foreground">
  {play.rotation_status}
</span>
```

#### Null/Missing Data

**Handle gracefully:**
- Song title missing: "Untitled"
- Artist missing: "Unknown Artist"
- Album missing: Omit (don't show "Unknown Album")
- Year missing: Omit separator (don't show "• ")

```tsx
// ✅ GOOD: Conditional rendering
{play.album && (
  <p className="text-sm text-muted-foreground">
    {play.album}
    {releaseYear && ` • ${releaseYear}`}
  </p>
)}

// ❌ BAD: Shows "null" or "undefined"
<p>{play.album} • {play.year}</p>
```

### 3. Play History / Timeline

Timeline interfaces show chronological music playback.

#### Timeline Structure

**Components:**
- **Container**: Scrollable, virtualized list
- **Play card**: Individual play entry
- **Time markers**: Date/time separators
- **Scroll indicators**: Current position, scroll-to-top

**Layout patterns:**
```tsx
<div className="timeline-container h-screen overflow-y-auto">
  {/* Date separator */}
  <div className="sticky top-0 bg-background/80 backdrop-blur z-10 p-2">
    <time className="text-xs text-muted-foreground uppercase tracking-wide">
      {formatDate(date)}
    </time>
  </div>

  {/* Play cards */}
  <div className="space-y-2 p-3">
    {plays.map(play => (
      <PlayCard key={play.id} play={play} />
    ))}
  </div>
</div>
```

#### Time Formatting

**Relative time (recent plays):**
- Just now (< 1 min)
- 5 minutes ago (< 1 hour)
- 2 hours ago (< 24 hours)
- Yesterday at 3:45 PM (< 48 hours)
- Last Monday at 3:45 PM (< 7 days)

**Absolute time (older plays):**
- Jan 15, 2025 at 3:45 PM (> 7 days)
- Jan 15, 2025 (if time not important)

**Implementation:**
```typescript
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return `yesterday at ${formatTime(date)}`;
  if (diffDays < 7) return `${getDayName(date)} at ${formatTime(date)}`;

  return formatAbsoluteTime(date);
}

export function formatPlayTime(date: Date): string {
  // HH:MM AM/PM format
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}
```

#### Recency Indicators

**Visual cues for recent plays:**
- Highlight color/glow for very recent (< 30 min)
- Subtle background for recent (< 3 hours)
- Standard appearance for older

```tsx
function getAgeCategory(airdate: Date | null): 'recent' | 'older' | 'old' {
  if (!airdate) return 'old';
  const minutesAgo = (Date.now() - airdate.getTime()) / 60000;
  if (minutesAgo < 30) return 'recent';
  if (minutesAgo < 180) return 'older';
  return 'old';
}

<div
  className="play-card"
  data-age={getAgeCategory(play.airdate)}
>
  {/* CSS handles visual differences based on data-age */}
</div>
```

```css
.play-card[data-age="recent"] {
  background: hsl(var(--primary) / 0.05);
  border-left: 2px solid hsl(var(--primary) / 0.3);
}

.play-card[data-age="older"] {
  background: hsl(var(--primary) / 0.02);
}
```

#### Infinite Scroll / Virtualization

**For large timelines:**
- Use virtualization (react-window, tanstack-virtual)
- Load more when scrolling near bottom
- Show loading indicators during fetch
- Maintain scroll position after load

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function Timeline({ plays }: { plays: Play[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: plays.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated height of PlayCard
    overscan: 5, // Render 5 items above/below viewport
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <PlayCard play={plays[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. Music Service Integration

Linking to streaming services and music databases.

#### Common Services

**Streaming:**
- Spotify
- Apple Music
- YouTube Music
- Bandcamp
- SoundCloud
- Tidal

**Databases:**
- MusicBrainz (metadata)
- Discogs (releases)
- Last.fm (scrobbling)

**Social:**
- YouTube (music videos)
- Instagram (artist posts)
- Twitter/X (artist updates)

#### Link Display Patterns

**Link categories:**
```typescript
type LinkCategory =
  | 'streaming'    // Spotify, Apple Music, etc.
  | 'video'        // YouTube, Vimeo
  | 'purchase'     // Bandcamp, iTunes, Amazon
  | 'social'       // Instagram, Twitter, Facebook
  | 'database'     // MusicBrainz, Discogs
  | 'other'        // Uncategorized links

// Extract from DJ comments or metadata
function categorizeMusicLink(url: string): LinkCategory {
  if (/spotify\.com|apple\.com\/music|tidal\.com/.test(url)) return 'streaming';
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  if (/bandcamp\.com|itunes\.apple\.com/.test(url)) return 'purchase';
  if (/instagram\.com|twitter\.com|facebook\.com/.test(url)) return 'social';
  if (/musicbrainz\.org|discogs\.com/.test(url)) return 'database';
  return 'other';
}
```

**Link preview cards:**
```tsx
interface LinkPreviewProps {
  url: string;
  title?: string;
  category: LinkCategory;
}

function LinkPreview({ url, title, category }: LinkPreviewProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors"
    >
      <div className="shrink-0">
        <LinkIcon category={category} className="h-6 w-6" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate group-hover:text-accent">
          {title || getCategoryLabel(category)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {getDomain(url)}
        </p>
      </div>

      <ExternalLinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
    </a>
  );
}
```

**Icon selection:**
```tsx
function LinkIcon({ category }: { category: LinkCategory }) {
  switch (category) {
    case 'streaming':
      return <HeadphonesIcon />;
    case 'video':
      return <PlayCircleIcon />;
    case 'purchase':
      return <ShoppingCartIcon />;
    case 'social':
      return <ShareIcon />;
    case 'database':
      return <DatabaseIcon />;
    default:
      return <LinkIcon />;
  }
}
```

#### Featured Link

**Prioritize most relevant link:**
```tsx
function getFeaturedLink(links: MusicLink[]): MusicLink | null {
  // Priority: streaming > video > purchase > database > social > other
  const priority: LinkCategory[] = [
    'streaming',
    'video',
    'purchase',
    'database',
    'social',
    'other',
  ];

  for (const category of priority) {
    const link = links.find(l => l.category === category);
    if (link) return link;
  }

  return links[0] || null;
}

// Show featured link prominently in PlayCard
<FeaturedLinkPreview playId={play.id} />
```

### 5. Audio Playback Controls

If implementing audio playback (future feature).

#### Basic Controls

**Required:**
- Play/Pause button (large, accessible)
- Progress bar (seekable)
- Current time / Total duration
- Volume control
- Mute button

**Optional:**
- Skip forward/backward (15s, 30s)
- Playback speed (0.5x, 1x, 1.5x, 2x)
- Loop/repeat
- Shuffle
- Queue/playlist

#### Progress Bar

```tsx
function ProgressBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const progressPercent = (currentTime / duration) * 100;

  return (
    <div className="group relative w-full">
      {/* Time labels */}
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <time>{formatDuration(currentTime)}</time>
        <time>{formatDuration(duration)}</time>
      </div>

      {/* Progress track */}
      <div
        className="relative h-2 bg-muted rounded-full cursor-pointer"
        onClick={handleClick}
        onMouseDown={() => setIsDragging(true)}
      >
        {/* Filled progress */}
        <div
          className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Hover/drag indicator */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isDragging && "opacity-100 scale-110"
          )}
          style={{ left: `${progressPercent}%`, transform: 'translateX(-50%) translateY(-50%)' }}
        />
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

#### Keyboard Shortcuts

**Standard media shortcuts:**
- Space: Play/Pause
- K: Play/Pause (YouTube convention)
- Left arrow: Seek backward 5s
- Right arrow: Seek forward 5s
- J: Seek backward 10s
- L: Seek forward 10s
- M: Mute/Unmute
- Up arrow: Volume up
- Down arrow: Volume down
- F: Fullscreen (if video)

```tsx
useEffect(() => {
  function handleKeyPress(e: KeyboardEvent) {
    // Don't interfere with text input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seek(currentTime - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seek(currentTime + 5);
        break;
      case 'j':
        e.preventDefault();
        seek(currentTime - 10);
        break;
      case 'l':
        e.preventDefault();
        seek(currentTime + 10);
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      // ... etc
    }
  }

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [currentTime, togglePlayPause, seek, toggleMute]);
```

### 6. Music Badges & Indicators

Visual indicators for music metadata.

#### Common Badges

**Rotation status:**
- Heavy rotation: Bright color, high prominence
- Medium rotation: Moderate color
- Light rotation: Subtle color
- Library: Neutral color

**Special flags:**
- Local artist: Green badge with "Local"
- Listener request: Purple badge with "Request"
- Live performance: Red badge with "Live"
- New release: Orange badge with "New"

**Implementation:**
```tsx
function RotationBadge({ status }: { status: RotationStatus }) {
  const styles = {
    Heavy: "bg-primary/10 text-primary border-primary/20",
    Medium: "bg-accent/10 text-accent border-accent/20",
    Light: "bg-muted text-muted-foreground border-border",
    Library: "bg-card text-foreground border-border",
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
      styles[status]
    )}>
      {status}
    </span>
  );
}

function SpecialBadge({ type, label }: { type: 'local' | 'request' | 'live', label: string }) {
  const styles = {
    local: "bg-green-500/10 text-green-500 border-green-500/20",
    request: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    live: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border",
      styles[type]
    )}>
      <BadgeIcon type={type} className="h-3 w-3" />
      {label}
    </span>
  );
}
```

### 7. Non-Track Plays (Special Segments)

Radio stations play non-music content (PSAs, station IDs, etc.).

#### Detection

```typescript
// A play is non-track if it has comment but no song/artist
const isNonTrackPlay = !play.song && !play.artist && play.comment;
```

#### Display Pattern

**In timeline:**
- Show comment as title
- Use "Special Program Segment" as subtitle
- Use generic icon instead of album art
- De-emphasize compared to music tracks

```tsx
{isNonTrackPlay ? (
  <>
    <h3 className="track-title truncate">{play.comment}</h3>
    <p className="text-xs italic text-muted-foreground">
      Special Program Segment
    </p>
  </>
) : (
  <>
    <h3 className="track-title truncate">{play.song}</h3>
    <p className="artist-name truncate">{play.artist}</p>
  </>
)}
```

**In detail view:**
- Highlight that it's a special segment
- Show full comment text
- Omit music-specific metadata (album, labels, rotation)

```tsx
{isNonTrackPlay ? (
  <>
    <div className="text-xs uppercase tracking-wider text-muted-foreground">
      Special Program Segment
    </div>
    <h1 className="text-4xl font-bold">{play.comment}</h1>
  </>
) : (
  <>
    <h1 className="text-6xl font-bold">{play.song}</h1>
    <h2 className="text-3xl">{play.artist}</h2>
    {play.album && <p className="text-lg">{play.album}</p>}
  </>
)}
```

## Music UI Best Practices

### Do's ✅

- **Prioritize album art** - Make it prominent, high-quality
- **Respect metadata hierarchy** - Song > Artist > Album > Details
- **Use music conventions** - "&" for collabs, "feat." for features
- **Handle missing data gracefully** - Sensible defaults, no "null"
- **Use relative time** - "5 minutes ago" more useful than timestamp
- **Link to streaming services** - Help users find music
- **Optimize for scanning** - Users browse quickly, make titles readable
- **Virtualize long lists** - Performance for large timelines
- **Provide keyboard shortcuts** - Power users expect media shortcuts

### Don'ts ❌

- **Don't stretch album art** - Always maintain 1:1 aspect ratio
- **Don't show "Unknown Album"** - Omit if missing
- **Don't use "and"** - Use "&" for artist collaborations
- **Don't hardcode image sizes** - Use responsive sizing
- **Don't assume data exists** - Always handle null/undefined
- **Don't break on long titles** - Truncate with ellipsis
- **Don't ignore mobile** - Touch targets, simplified layouts
- **Don't auto-play audio** - Requires user interaction (accessibility + UX)

## Crate-Specific Patterns

### PlayCard

**Structure:**
```
[Album Art]  Song Title                    3:45 PM
             Artist Name
             Album • 2023
             [Heavy] [Local] [Request]
             [Featured Link Preview]
```

**Sizing:**
- Compact: 80px art, minimal metadata
- Default: 120px art, full metadata
- Expanded: 160px art, comment, link preview

### PlayDetailsPanel

**Layout:**
```
[Large Album Art]    Song Title (huge)
                     Artist Name (large)
                     Album • Year

                     Played 5 minutes ago
                     3:45 PM

Details
  Play ID: 12345
  Rotation: Heavy
  Labels: Independent, Local
  Origin: Local

Links
  [Spotify] [YouTube] [Bandcamp]

DJ Comment
  "This is a great track from a local artist..."
```

## Integration with Design System

**Crate-specific:**
- Album art gets subtle orange glow on hover (radio aesthetic)
- Links use teal accent color (streaming services)
- Featured links highlighted with teal border
- Music metadata uses IBM Plex Sans (readable, technical)
- Timestamps use IBM Plex Mono (telemetry aesthetic)

## Success Criteria

Music UI is well-designed when:
- ✅ Album art is prominent, high-quality, maintains aspect ratio
- ✅ Metadata hierarchy is clear (song > artist > album)
- ✅ Missing data handled gracefully (no "null", sensible defaults)
- ✅ Time formatting is user-friendly (relative for recent, absolute for old)
- ✅ Links to streaming services work correctly
- ✅ Long titles truncate with ellipsis, show full on hover
- ✅ Non-track plays display appropriately
- ✅ Timeline is performant with virtualization
- ✅ Badges and indicators are clear and accessible
- ✅ Responsive on mobile (touch-friendly, simplified)
