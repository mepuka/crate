# Vinyl Den UI Patterns: Practical Implementation Examples

**Date:** 2025-12-18
**Purpose:** Concrete UI patterns and code examples for implementing "vinyl den" aesthetic in Crate.

---

## Pattern Library Overview

This document provides ready-to-implement patterns for:
1. Album art display and placeholders
2. Staff picks presentation
3. Crate browsing interactions
4. Timeline rhythm and spacing
5. Trust signals and human curation markers

---

## Pattern 1: Album Art Treatment

### The Sacred Album Art Rule
> Never obscure, distort, or diminish album artwork. It is the primary visual anchor.

### Large Album Art Display

```tsx
// AlbumArt component with proper fallback handling
interface AlbumArtProps {
  src: string | null;
  artist: string;
  track: string;
  size?: 'small' | 'medium' | 'large' | 'hero';
}

function AlbumArt({ src, artist, track, size = 'medium' }: AlbumArtProps) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = generatePlaceholder(artist, track);

  const sizes = {
    small: 120,
    medium: 200,
    large: 300,
    hero: 400
  };

  return (
    <div
      className={cn("album-art-container", size)}
      style={{ width: sizes[size], height: sizes[size] }}
    >
      {/* Placeholder layer */}
      <div
        className={cn("placeholder", { hidden: loaded })}
        style={{
          background: placeholder.gradient,
          position: 'relative'
        }}
        data-pattern={placeholder.pattern}
      >
        {/* Subtle music note icon */}
        <div className="placeholder-icon">♪</div>
      </div>

      {/* Album art layer */}
      {src && (
        <img
          src={src}
          alt={`${artist} - ${track}`}
          className={cn("album-art", { loaded })}
          onLoad={() => setLoaded(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}
```

### CSS for Album Art

```css
.album-art-container {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Placeholder styling */
.placeholder {
  position: absolute;
  inset: 0;
  opacity: 1;
  transition: opacity 0.6s ease;
}

.placeholder.hidden {
  opacity: 0;
  pointer-events: none;
}

/* Subtle pattern overlays */
.placeholder[data-pattern="dots"]::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px
  );
  background-size: 12px 12px;
}

.placeholder[data-pattern="lines"]::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(255, 255, 255, 0.02) 10px,
    rgba(255, 255, 255, 0.02) 11px
  );
}

/* Music note icon */
.placeholder-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 48px;
  opacity: 0.08;
  pointer-events: none;
}

/* Album art image */
.album-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.8s ease;
}

.album-art.loaded {
  opacity: 1;
}

/* Hover effects */
.album-art-container:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  z-index: 10;
}
```

### Placeholder Generation

```javascript
// Deterministic hash function for consistent placeholders
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Generate unique but consistent placeholder
function generatePlaceholder(artist, track) {
  const hash = simpleHash(artist + track);
  const hue = hash % 360;
  const angle = (hash % 180) - 90; // -90 to 90 degrees

  return {
    gradient: `linear-gradient(${angle}deg,
      hsl(${hue}, 15%, 25%),
      hsl(${(hue + 30) % 360}, 15%, 32%))`,
    pattern: ['dots', 'lines', 'waves'][hash % 3]
  };
}
```

---

## Pattern 2: Staff Picks Display

### Handwritten Note Aesthetic

```tsx
interface StaffPickProps {
  artist: string;
  track: string;
  albumArt: string;
  dj: {
    name: string;
    photo: string;
  };
  commentary: string;
}

function StaffPick({ artist, track, albumArt, dj, commentary }: StaffPickProps) {
  return (
    <div className="staff-pick">
      {/* Album art */}
      <AlbumArt src={albumArt} artist={artist} track={track} size="large" />

      {/* Handwritten note overlay */}
      <div className="staff-note">
        <div className="note-paper">
          <div className="note-header">
            <img src={dj.photo} alt={dj.name} className="dj-photo" />
            <div className="dj-name">{dj.name} recommends:</div>
          </div>

          <div className="note-content">
            <div className="track-info">
              <div className="artist-name">{artist}</div>
              <div className="track-title">"{track}"</div>
            </div>

            <div className="commentary">
              {commentary}
            </div>
          </div>

          {/* KEXP orange accent */}
          <div className="kexp-badge">
            <span className="radio-icon">📻</span>
            KEXP Staff Pick
          </div>
        </div>
      </div>
    </div>
  );
}
```

### CSS for Staff Picks

```css
.staff-pick {
  position: relative;
  max-width: 400px;
}

.staff-note {
  position: absolute;
  bottom: -20px;
  left: -20px;
  right: -20px;
  background: rgba(10, 12, 20, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  transform: translateY(10px);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.staff-pick:hover .staff-note {
  transform: translateY(0);
  opacity: 1;
}

.note-paper {
  position: relative;
}

/* Subtle paper texture */
.note-paper::before {
  content: "";
  position: absolute;
  inset: -10px;
  background-image:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 24px,
      rgba(245, 130, 22, 0.03) 24px,
      rgba(245, 130, 22, 0.03) 25px
    );
  pointer-events: none;
  opacity: 0.5;
}

.note-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.dj-photo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--kexp-orange);
}

.dj-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.track-info {
  margin-bottom: 12px;
}

.artist-name {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.01em;
}

.track-title {
  font-size: 16px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
}

.commentary {
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 16px;
  /* Handwritten feel */
  font-family: 'IBM Plex Sans', sans-serif;
}

.kexp-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--kexp-orange);
  color: #000;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.radio-icon {
  font-size: 14px;
}
```

---

## Pattern 3: Crate Browsing Mode

### Horizontal Scroll with Swipe Gesture

```tsx
function CrateBrowser({ albums }: { albums: Album[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current!.offsetLeft);
    setScrollLeft(containerRef.current!.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current!.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed
    containerRef.current!.scrollLeft = scrollLeft - walk;
  };

  return (
    <div className="crate-browser">
      <div className="crate-label">
        <span className="label-text">Dig through the crates</span>
        <span className="instruction">← Swipe to browse →</span>
      </div>

      <div
        ref={containerRef}
        className="crate-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      >
        {albums.map((album, index) => (
          <div key={album.id} className="crate-item">
            <AlbumArt
              src={album.art}
              artist={album.artist}
              track={album.title}
              size="large"
            />
            <div className="crate-item-info">
              <div className="artist">{album.artist}</div>
              <div className="title">{album.title}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### CSS for Crate Browsing

```css
.crate-browser {
  padding: 32px 0;
}

.crate-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 32px;
}

.label-text {
  font-size: 24px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.02em;
}

.instruction {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.crate-container {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  padding: 0 32px 20px;
  cursor: grab;

  /* Hide scrollbar but keep functionality */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.crate-container::-webkit-scrollbar {
  display: none;
}

.crate-container:active {
  cursor: grabbing;
}

.crate-item {
  flex-shrink: 0;
  width: 240px;
  transition: transform 0.2s ease;
}

.crate-item:hover {
  transform: translateY(-8px);
}

.crate-item-info {
  margin-top: 12px;
  padding: 0 4px;
}

.crate-item .artist {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.01em;
  margin-bottom: 4px;

  /* Truncate long names */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crate-item .title {
  font-size: 14px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.7);

  /* Truncate long titles */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

## Pattern 4: Timeline with Temporal Spacing

### Dynamic Gap Calculation

```tsx
interface Play {
  id: string;
  timestamp: number;
  artist: string;
  track: string;
  albumArt: string;
}

function Timeline({ plays }: { plays: Play[] }) {
  return (
    <div className="timeline">
      {plays.map((play, index) => {
        const previousPlay = plays[index - 1];
        const gap = previousPlay
          ? calculateGap(play.timestamp, previousPlay.timestamp)
          : null;

        const age = getAgeCategory(play.timestamp);
        const isSessionBreak = gap && gap.hasBreak;

        return (
          <React.Fragment key={play.id}>
            {/* Session break divider */}
            {isSessionBreak && (
              <div className="session-break">
                <div className="break-line" />
                <div className="break-label">
                  {formatTimeGap(gap.minutes)}
                </div>
              </div>
            )}

            {/* Play card */}
            <div
              className={cn("play-card", age)}
              style={{ marginTop: gap?.size || 0 }}
              data-age={age}
            >
              <AlbumArt
                src={play.albumArt}
                artist={play.artist}
                track={play.track}
                size="medium"
              />

              <div className="play-info">
                <div className="track-title">{play.track}</div>
                <div className="artist-name">{play.artist}</div>
                <div className="timestamp">
                  {formatTimestamp(play.timestamp)}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Gap calculation logic
function calculateGap(currentTime: number, previousTime: number) {
  const gapMinutes = (currentTime - previousTime) / 60000;

  if (gapMinutes < 2) {
    return { size: 12, hasBreak: false, minutes: gapMinutes };
  }
  if (gapMinutes < 5) {
    return { size: 20, hasBreak: false, minutes: gapMinutes };
  }
  if (gapMinutes < 15) {
    return { size: 32, hasBreak: false, minutes: gapMinutes };
  }
  if (gapMinutes < 60) {
    return { size: 48, hasBreak: false, minutes: gapMinutes };
  }

  return { size: 64, hasBreak: true, minutes: gapMinutes };
}

// Age category for visual treatment
function getAgeCategory(timestamp: number) {
  const minutesAgo = (Date.now() - timestamp) / 60000;

  if (minutesAgo < 30) return "recent";
  if (minutesAgo < 180) return "older";
  return "old";
}

// Format time gap for session breaks
function formatTimeGap(minutes: number) {
  if (minutes < 60) {
    return `${Math.floor(minutes)} minutes later`;
  }
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour later" : `${hours} hours later`;
}
```

### CSS for Timeline

```css
.timeline {
  padding: 32px 24px;
  max-width: 800px;
  margin: 0 auto;
}

/* Play card base styles */
.play-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Age-based visual treatment */
.play-card[data-age="recent"] {
  opacity: 1;
  transform: scale(1);
}

.play-card[data-age="older"] {
  opacity: 0.85;
  transform: scale(0.98);
}

.play-card[data-age="old"] {
  opacity: 0.7;
  transform: scale(0.96);
}

/* Hover state */
.play-card:hover {
  transform: translateY(-2px) scale(1.01) !important;
  opacity: 1 !important;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

/* Session break */
.session-break {
  position: relative;
  margin: 32px 0;
  text-align: center;
}

.break-line {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1),
    transparent
  );
}

.break-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 4px 12px;
  background: rgba(10, 12, 20, 0.9);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Play info */
.play-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.track-title {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.artist-name {
  font-size: 14px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.timestamp {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  margin-top: 8px;
}

/* Timestamp with colored dot */
.timestamp::before {
  content: "●";
  display: inline-block;
  margin-right: 6px;
  font-size: 8px;
  color: var(--kexp-orange);
  opacity: 0.6;
}
```

---

## Pattern 5: DJ Profile Badge

### Trust Signal Component

```tsx
interface DJBadgeProps {
  dj: {
    name: string;
    photo: string;
    show?: string;
  };
  size?: 'small' | 'medium';
}

function DJBadge({ dj, size = 'medium' }: DJBadgeProps) {
  return (
    <div className={cn("dj-badge", size)}>
      <img src={dj.photo} alt={dj.name} className="dj-photo" />
      <div className="dj-info">
        <div className="dj-name">{dj.name}</div>
        {dj.show && <div className="dj-show">{dj.show}</div>}
      </div>
      <div className="kexp-logo">
        <span>KEXP</span>
      </div>
    </div>
  );
}
```

### CSS for DJ Badge

```css
.dj-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  transition: all 0.2s ease;
}

.dj-badge:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--kexp-orange);
}

.dj-badge.small {
  padding: 6px 10px;
  gap: 8px;
}

.dj-photo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--kexp-orange);
}

.dj-badge.small .dj-photo {
  width: 24px;
  height: 24px;
}

.dj-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dj-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.01em;
}

.dj-badge.small .dj-name {
  font-size: 12px;
}

.dj-show {
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
}

.kexp-logo {
  margin-left: auto;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.kexp-logo span {
  font-size: 11px;
  font-weight: 700;
  color: var(--kexp-orange);
  letter-spacing: 0.1em;
}
```

---

## Pattern 6: Warm Background with Grain

### Background Layer System

```css
/* Root background setup */
:root {
  --kexp-orange: #F58216;
  --warm-black: hsl(0, 0%, 8%);
  --warm-gray: hsl(20, 5%, 15%);
}

body {
  background: var(--warm-black);
  position: relative;
  min-height: 100vh;
}

/* Grain texture overlay */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url('data:image/svg+xml,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="3.5" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
  opacity: 0.015;
  pointer-events: none;
  z-index: 1;
}

/* Ambient color from album art */
.background-ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  transition: background 8s ease;
}

.background-ambient::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 20%,
    var(--ambient-color, rgba(50, 60, 80, 0.2)) 0%,
    transparent 60%
  );
}

.background-ambient::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 20, 0.97) 0%,
    rgba(10, 12, 20, 0.9) 40%,
    rgba(10, 12, 20, 0.85) 100%
  );
}

/* Content above background */
.app-content {
  position: relative;
  z-index: 2;
}
```

### Dynamic Ambient Color

```javascript
// Extract dominant color from album art
function extractDominantColor(imageElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  ctx.drawImage(imageElement, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let r = 0, g = 0, b = 0;
  const pixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  r = Math.floor(r / pixels);
  g = Math.floor(g / pixels);
  b = Math.floor(b / pixels);

  return `rgb(${r}, ${g}, ${b})`;
}

// Desaturate for ambient use
function desaturateColor(rgbString, factor = 0.7) {
  const matches = rgbString.match(/\d+/g);
  if (!matches) return 'rgba(50, 60, 80, 0.3)';

  const [r, g, b] = matches.map(Number);

  // Convert to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h, s;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  // Reduce saturation
  s = s * (1 - factor);

  return `hsla(${h * 360}, ${s * 100}%, ${l / 2.55}%, 0.3)`;
}

// Update ambient color
function updateAmbientColor(albumArtElement) {
  const dominantColor = extractDominantColor(albumArtElement);
  const ambientColor = desaturateColor(dominantColor, 0.7);

  document.documentElement.style.setProperty('--ambient-color', ambientColor);
}
```

---

## Pattern 7: Progressive Disclosure on Hover

### Metadata Reveal

```tsx
function PlayCard({ play }: { play: Play }) {
  return (
    <div className="play-card">
      <AlbumArt
        src={play.albumArt}
        artist={play.artist}
        track={play.track}
      />

      <div className="play-info">
        <div className="track-title">{play.track}</div>
        <div className="artist-name">{play.artist}</div>
        <div className="timestamp">{formatTimestamp(play.timestamp)}</div>
      </div>

      {/* Hidden metadata - revealed on hover */}
      <div className="play-metadata">
        <div className="meta-row">
          <span className="meta-label">Album:</span>
          <span className="meta-value">{play.album}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Year:</span>
          <span className="meta-value">{play.year}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Label:</span>
          <span className="meta-value">{play.label}</span>
        </div>

        <div className="play-actions">
          <button className="action-btn">
            <span>🔍</span> More Info
          </button>
          <button className="action-btn">
            <span>🎵</span> Similar
          </button>
        </div>
      </div>
    </div>
  );
}
```

### CSS for Progressive Disclosure

```css
.play-card {
  position: relative;
  overflow: hidden;
}

.play-metadata {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(0, 0, 0, 0.95) 20%
  );
  transform: translateY(100%);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.play-card:hover .play-metadata {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
}

.meta-label {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.meta-value {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 400;
  text-align: right;
}

.play-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--kexp-orange);
  border-color: var(--kexp-orange);
  color: #000;
}

.action-btn span {
  margin-right: 4px;
}
```

---

## Quick Copy-Paste Snippets

### Design Tokens

```css
:root {
  /* Colors */
  --kexp-orange: #F58216;
  --kexp-orange-dark: #D16B0F;
  --kexp-orange-light: #FF9B3F;
  --warm-black: hsl(0, 0%, 8%);
  --warm-gray: hsl(20, 5%, 15%);

  /* Spacing */
  --gap-xs: 8px;
  --gap-sm: 12px;
  --gap-md: 20px;
  --gap-lg: 32px;
  --gap-xl: 48px;

  /* Shadows */
  --shadow-subtle: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-near: 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-far: 0 6px 20px rgba(0, 0, 0, 0.25);

  /* Transitions */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 0.6s cubic-bezier(0.4, 0, 0.2, 1);

  /* Opacities */
  --opacity-primary: 1;
  --opacity-secondary: 0.7;
  --opacity-tertiary: 0.5;
  --opacity-disabled: 0.3;
}
```

### Typography Scale

```css
/* Artist name - most prominent */
.artist-name {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.95);
}

/* Track title - secondary */
.track-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.7);
}

/* Metadata - tertiary */
.metadata {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.5);
}
```

---

## Implementation Checklist

### Week 1: Foundation
- [ ] Implement large album art component
- [ ] Add placeholder generation system
- [ ] Apply KEXP orange accent color
- [ ] Set up warm background with grain
- [ ] Establish typography hierarchy

### Week 2: Curation
- [ ] Create DJ badge component
- [ ] Build staff picks section
- [ ] Add handwritten note aesthetic
- [ ] Show human commentary

### Week 3: Browsing
- [ ] Implement horizontal crate browser
- [ ] Add swipe/drag gesture support
- [ ] Create timeline with dynamic spacing
- [ ] Add session break dividers

### Week 4: Polish
- [ ] Progressive disclosure on hover
- [ ] Ambient color extraction
- [ ] Smooth transitions throughout
- [ ] Accessibility (reduced motion, etc.)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-18
**Related Docs:**
- `record-store-visual-curation.md` (research)
- `vinyl-den-design-summary.md` (quick reference)
- `kexp-visual-identity-guardrails.md` (brand guidelines)
