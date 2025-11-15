---
name: crate-design-system
description: Maintain consistency with Crate's "Late Night Radio Broadcast" design system - typography, colors, spacing, and component patterns
---

# Crate Design System Consistency

## Purpose

This skill ensures all design work within the Crate project maintains consistency with the established "Late Night Radio Broadcast" design system. Use this skill for any frontend work in the Crate KEXP music timeline project.

## Design Philosophy

**Aesthetic Direction**: Late-night radio broadcast atmosphere
- Warm, inviting, slightly nostalgic
- Radio studio ambiance with modern polish
- Emphasis on music discovery and timeline browsing
- Accessible, readable, functional

**Core Principles:**
1. **Typography leads** - Bold display fonts for music metadata
2. **Warm color palette** - Orange primary, teal accents
3. **Atmospheric depth** - Layered backgrounds with glassmorphism
4. **Purposeful motion** - Broadcast-inspired animations
5. **Music-first** - Album art and metadata are focal points

## Typography System

### Font Families

**Display (Headings, Song Titles):**
```css
--font-family-display: 'Space Grotesk', system-ui, sans-serif;
```
- Used for: H1, H2, song titles, major UI labels
- Character: Geometric, modern, slightly quirky
- Weights: 400 (normal), 700 (bold)

**Body (General Text):**
```css
--font-family-body: 'IBM Plex Sans', system-ui, sans-serif;
```
- Used for: Body text, artist names, album names, descriptions
- Character: Readable, technical, warm
- Weights: 400 (normal), 600 (semibold)

**Monospace (Technical Data):**
```css
--font-family-mono: 'IBM Plex Mono', 'Courier New', monospace;
```
- Used for: Play IDs, timestamps, technical metadata
- Character: Retro computing, broadcast telemetry

### Type Scale

**Size Variables:**
```css
--font-song-title: 1.125rem;     /* 18px - PlayCard song titles */
--font-artist: 1rem;             /* 16px - Artist names */
--font-album: 0.875rem;          /* 14px - Album names */
--font-time: 0.75rem;            /* 12px - Timestamps, metadata labels */
```

**Usage Examples:**
```tsx
// Song title (PlayCard)
<h3 className="track-title text-foreground truncate"
    style={{ fontSize: 'var(--font-song-title)' }}>
  {play.song}
</h3>

// Artist name
<p className="artist-name"
   style={{
     fontFamily: 'var(--font-family-body)',
     fontWeight: 'var(--weight-artist)',
     fontSize: 'var(--font-artist)'
   }}>
  {play.artist}
</p>

// Timestamp
<time className="timestamp font-mono"
      style={{ fontSize: 'var(--font-time)' }}>
  {formatPlayTime(play.airdate)}
</time>
```

### Weight Variables

```css
--weight-display: 700;    /* Display headings */
--weight-artist: 600;     /* Artist names, subheadings */
--weight-body: 400;       /* Body text */
```

## Color System

### Core Palette

**Primary (Radio Orange):**
```css
--primary: 25 85% 60%;              /* hsl(25, 85%, 60%) - #FF6B35 */
--primary-foreground: 0 0% 100%;    /* White text on primary */
```
- Used for: CTAs, highlights, active states, links
- Character: Warm, energetic, radio glow

**Accent (Teal):**
```css
--accent: 174 100% 36%;             /* hsl(174, 100%, 36%) - #00B8A9 */
--accent-foreground: 0 0% 100%;     /* White text on accent */
```
- Used for: Secondary highlights, success states, featured links
- Character: Cool contrast to warm primary

**Background (Deep Charcoal):**
```css
--background: 0 0% 10%;             /* hsl(0, 0%, 10%) - #1A1A1A */
--background-darker: 0 0% 7%;       /* Darker variant for depth */
```
- Used for: Main background, cards, panels
- Character: Radio studio darkness

**Foreground (Off-White):**
```css
--foreground: 0 0% 97%;             /* hsl(0, 0%, 97%) - #F8F8F8 */
```
- Used for: Primary text, icons
- Character: Soft, readable

**Muted (Gray Scale):**
```css
--muted: 0 0% 20%;                  /* Muted backgrounds */
--muted-foreground: 0 0% 60%;       /* Muted text (60% foreground) */
```

**Semantic Colors:**
```css
--destructive: 0 84% 60%;           /* Red for errors, destructive actions */
--border: 0 0% 20%;                 /* Subtle borders */
--card: 0 0% 12%;                   /* Card backgrounds */
--ring: 25 85% 60%;                 /* Focus rings (primary) */
```

### Color Usage Guidelines

**Links:**
- Default state: `text-accent` (teal)
- Hover state: `text-accent brightness-110`
- Visited: Same as default (timeline context)

**Play Cards:**
- Background: Transparent (timeline backdrop shows through)
- Hover: `bg-primary/5` (subtle orange tint)
- Selected: `ring-2 ring-primary` (orange ring)

**Buttons:**
- Primary: `bg-primary text-primary-foreground` (orange background, white text)
- Secondary: `bg-accent text-accent-foreground` (teal background, white text)
- Ghost: `hover:bg-primary/10` (transparent with orange tint on hover)

**Status Indicators:**
- Success: `text-green-500` (e.g., "Local" badge)
- Warning: `text-yellow-500`
- Error: `text-destructive`
- Info: `text-primary`

## Spacing System

**Base Scale (8px):**
```css
--spacing-0: 0;
--spacing-1: 0.25rem;   /* 4px */
--spacing-2: 0.5rem;    /* 8px */
--spacing-3: 0.75rem;   /* 12px */
--spacing-4: 1rem;      /* 16px */
--spacing-6: 1.5rem;    /* 24px */
--spacing-8: 2rem;      /* 32px */
--spacing-12: 3rem;     /* 48px */
--spacing-16: 4rem;     /* 64px */
```

**Usage:**
- Card padding: `p-3` (12px) or `p-6` (24px) for expanded views
- Gap between elements: `gap-3` (12px) for compact, `gap-6` (24px) for spacious
- Section spacing: `space-y-6` (24px) or `space-y-8` (32px)

## Component Patterns

### PlayCard

**Structure:**
```tsx
<div className="play-card group relative z-10 p-3 transition-colors cursor-pointer">
  {/* Clickable overlay */}
  <div className="absolute inset-0 z-20 cursor-pointer" />

  <div className="relative z-10 flex gap-3 py-2 pointer-events-none">
    {/* Album Art */}
    <AlbumArt size={120} />

    {/* Metadata */}
    <div className="flex-1 min-w-0 flex flex-col gap-1">
      {/* Title & Time */}
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="track-title truncate">{song}</h3>
        <time className="timestamp font-mono whitespace-nowrap">{time}</time>
      </div>

      {/* Artist */}
      <p className="artist-name truncate">{artist}</p>

      {/* Album & Year */}
      <p className="text-xs text-muted-foreground truncate">
        {album} • {year}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {/* Rotation, labels, flags */}
      </div>
    </div>
  </div>
</div>
```

**Styling:**
- Background: Transparent by default
- Hover: `hover:bg-primary/5`
- Focus: `focus-within:ring-1 focus-within:ring-primary/50`

### PlayDetailsPanel

**Layout:**
```tsx
<div className="fixed top-0 right-0 h-screen overflow-y-auto w-full lg:w-2/3">
  <div className="h-full px-4 sm:px-6 lg:px-10 pt-20 pb-12">
    <div className="relative bg-background rounded-2xl shadow-2xl p-8 sm:p-10 border border-primary/10 backdrop-blur-sm">
      {/* Glassy backdrop layers */}
      <div className="timeline-backdrop" />
      <div className="timeline-backdrop-edge" />

      {/* Content */}
      <div className="relative z-10 space-y-8">
        {/* Album Art + Info */}
        <div className="flex flex-col sm:flex-row gap-8">
          <div className="relative shrink-0 group">
            <AlbumArt size={400} className="w-full sm:w-80 rounded-2xl shadow-2xl" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="flex-1 space-y-6">
            {/* Title, artist, album with extreme size contrast */}
          </div>
        </div>

        {/* Details Section */}
        {/* Links Section */}
        {/* Analysis Section */}
      </div>
    </div>
  </div>
</div>
```

**Typography Hierarchy:**
- Song title: `text-4xl sm:text-5xl lg:text-6xl font-bold` with display font
- Artist: `text-xl sm:text-2xl lg:text-3xl` with body font, semibold
- Album: `text-base sm:text-lg` with body font

### Glassmorphism Background System

**Four-Layer System:**

```css
/* Layer 1: Base gradient */
.timeline-backdrop {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    hsl(var(--background) / 0.7) 0%,
    hsl(var(--background) / 0.9) 100%
  );
  backdrop-filter: blur(12px);
  z-index: 0;
}

/* Layer 2: Border edge glow */
.timeline-backdrop-edge {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    hsl(var(--primary) / 0.1) 0%,
    transparent 100%
  );
  border-radius: inherit;
  z-index: 1;
}

/* Layer 3: Noise texture (optional) */
.timeline-backdrop::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url('/noise.png');
  opacity: 0.03;
  mix-blend-mode: overlay;
}

/* Layer 4: Dot pattern (optional) */
.timeline-backdrop::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

## Animation Patterns

### Broadcast Pulse (Radio Glow)

```css
@keyframes broadcast-pulse {
  0%, 100% {
    box-shadow: 0 0 20px hsl(var(--primary) / 0.3),
                0 0 40px hsl(var(--primary) / 0.15);
  }
  50% {
    box-shadow: 0 0 30px hsl(var(--primary) / 0.4),
                0 0 60px hsl(var(--primary) / 0.2);
  }
}

.radio-glow {
  animation: broadcast-pulse 3s ease-in-out infinite;
}
```

### Staggered Reveal (Page Load)

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, delay: index * 0.1 }}
>
  {children}
</motion.div>
```

### Hover Interactions

```css
/* Play card hover */
.play-card {
  transition: background-color 200ms ease-out;
}

.play-card:hover {
  background-color: hsl(var(--primary) / 0.05);
}

/* Album art glow on hover */
.album-art-wrapper:hover::after {
  opacity: 1;
}

.album-art-wrapper::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at center, hsl(var(--primary) / 0.2), transparent 70%);
  opacity: 0;
  transition: opacity 300ms ease-out;
  pointer-events: none;
}
```

### Motion Guidelines

- **Duration**: Fast (150ms hover), Normal (300ms transitions), Slow (600ms sequences)
- **Easing**: `ease-out` for entrances, `ease-in-out` for transitions
- **Reduced motion**: Always respect `prefers-reduced-motion`
- **Performance**: Use `transform` and `opacity` for GPU acceleration

## Accessibility Standards

**Contrast Ratios (WCAG AA):**
- Normal text: 4.5:1 minimum ✓
- Large text (18pt+): 3:1 minimum ✓
- Primary on background: 5.2:1 ✓
- Foreground on background: 14.8:1 ✓

**Touch Targets:**
- Minimum: 44x44px ✓
- Play cards: Full card is clickable
- Buttons: Padding ensures minimum size

**Keyboard Navigation:**
- All interactive elements must be focusable
- Focus rings: `ring-2 ring-primary`
- Tab order follows visual flow

**Screen Readers:**
- Semantic HTML (article, time, nav)
- ARIA labels for icon buttons
- Alt text for album art

## Responsive Breakpoints

**Tailwind Breakpoints:**
```css
sm: 640px   /* Tablets */
md: 768px   /* Small laptops */
lg: 1024px  /* Desktops */
xl: 1280px  /* Large screens */
```

**Responsive Patterns:**
- Mobile: Single column, full-width cards, simplified metadata
- Tablet: Side-by-side details panel appears
- Desktop: Full timeline + details panel layout

**Mobile Considerations:**
- Reduce backdrop-filter blur on mobile (performance)
- Increase touch targets
- Simplify animations (respect reduced motion)
- Single column layouts

## Usage Checklist

When working on Crate frontend, ensure:

- [ ] Typography uses `var(--font-family-display)` for headings/titles
- [ ] Typography uses `var(--font-family-body)` for body text
- [ ] Typography uses `var(--font-family-mono)` for technical data
- [ ] Colors use HSL custom properties (e.g., `hsl(var(--primary))`)
- [ ] Links use `text-accent` (teal) color
- [ ] Spacing follows 8px base scale
- [ ] Hover states use `bg-primary/5` or similar subtle tints
- [ ] Focus states include `ring-2 ring-primary`
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Components match established patterns (PlayCard, PlayDetailsPanel)
- [ ] Glassmorphism uses four-layer backdrop system
- [ ] Contrast ratios meet WCAG AA (4.5:1 minimum)
- [ ] Touch targets are 44x44px minimum
- [ ] Responsive behavior follows mobile-first approach

## When to Deviate

It's acceptable to deviate from this system when:
- **Accessibility requires it** - Always prioritize WCAG compliance
- **Performance demands it** - Simplify on resource-constrained devices
- **User research shows better patterns** - Validate with data
- **New component has unique requirements** - Document the exception

**Process for deviation:**
1. Document the reason for deviation
2. Ensure deviation doesn't break overall coherence
3. Consider if deviation should become new pattern
4. Update this skill if new pattern is adopted

## Integration with Other Skills

**Use alongside:**
- `frontend-design-foundations` - Overall design principles
- `wcag-accessibility-compliance` - Ensure WCAG 2.2 AA compliance
- `component-design-checklist` - Comprehensive component creation
- `music-ui-patterns` - Music-specific UI requirements

## Success Criteria

A component maintains design system consistency when:
- ✅ Typography matches font families, sizes, and weights
- ✅ Colors use defined palette (primary, accent, semantic)
- ✅ Spacing follows 8px base scale
- ✅ Animations match established patterns (broadcast pulse, staggered reveal)
- ✅ Component structure follows PlayCard or PlayDetailsPanel patterns
- ✅ Glassmorphism uses four-layer backdrop system
- ✅ Accessibility standards maintained (contrast, touch targets, keyboard nav)
- ✅ Responsive behavior follows mobile-first approach
- ✅ Overall aesthetic matches "late-night radio broadcast" theme
