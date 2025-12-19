# Crate Research Documentation

**Last Updated:** 2025-12-18

This directory contains research and design documentation for the Crate music discovery platform.

---

## Visual Design & UX Research

### 🎨 Vinyl Den Experience

**Core Philosophy:** Create a digital music discovery experience that feels like browsing a beloved record store.

| Document | Purpose | Use When |
|----------|---------|----------|
| **[record-store-visual-curation.md](./record-store-visual-curation.md)** | Comprehensive research on physical record store design, crate digging culture, and music retail principles | Designing new features, understanding the "why" behind design decisions |
| **[vinyl-den-design-summary.md](./vinyl-den-design-summary.md)** | Executive summary and quick reference guide | Quick lookups, daily design decisions, onboarding new team members |
| **[vinyl-den-ui-patterns.md](./vinyl-den-ui-patterns.md)** | Copy-paste code examples and practical UI patterns | Implementation, building components, prototyping |
| **[kexp-visual-identity-guardrails.md](./kexp-visual-identity-guardrails.md)** | KEXP brand alignment, anti-AI-slop principles, authenticity markers | Ensuring brand consistency, avoiding generic aesthetics |
| **[kexp-visual-guardrails-summary.md](./kexp-visual-guardrails-summary.md)** | Quick KEXP brand reference | Fast brand decisions, color/typography lookups |

---

## Agent & LLM Integration

### 🤖 Music Discovery Agent

| Document | Purpose | Use When |
|----------|---------|----------|
| **[agent-handoff-patterns.md](./agent-handoff-patterns.md)** | Multi-agent collaboration patterns for music discovery | Designing agent workflows, implementing handoffs |
| **[agent-handoff-summary.md](./agent-handoff-summary.md)** | Quick reference for agent patterns | Rapid implementation decisions |

---

## Graph Algorithms & Music Discovery

### 🕸️ Knowledge Graph Navigation

| Document | Purpose | Use When |
|----------|---------|----------|
| **[graph-algorithms-music-discovery.md](./graph-algorithms-music-discovery.md)** | Deep dive into graph algorithms for music discovery | Understanding graph theory, implementing new algorithms |
| **[graph-algorithms-implementation-examples.md](./graph-algorithms-implementation-examples.md)** | Practical code examples for graph traversal | Building graph features, debugging traversal logic |
| **[graph-algorithms-quick-reference.md](./graph-algorithms-quick-reference.md)** | Quick algorithm lookup | Fast decisions on which algorithm to use |

---

## Writing & Content Guidelines

### ✍️ KEXP-Aligned Writing

| Document | Purpose | Use When |
|----------|---------|----------|
| **[indie-radio-writing-examples.md](./indie-radio-writing-examples.md)** | Real KEXP DJ writing samples and tone guidelines | Writing agent prompts, creating content, maintaining voice |

---

## Design Principles at a Glance

### The 5 Core Principles

1. **Album Art is Sacred**
   - Large, prominent display (never thumbnails)
   - High-quality, respectful treatment
   - Extract colors for contextual palettes

2. **Human Curation is Visible**
   - DJ names and photos prominent
   - Staff picks with personal commentary
   - Transparent sourcing (KEXP data)

3. **Serendipity Over Algorithm**
   - Random "dig" mode
   - Visual browsing (not just search)
   - Equal treatment for all artists

4. **Warm, Inviting Atmosphere**
   - KEXP orange (#F58216)
   - Warm blacks (not pure #000)
   - Subtle grain texture

5. **Documentary > Marketing**
   - Authentic, candid imagery
   - Imperfect aesthetics
   - Earnest tone (not hype)

---

## Quick Reference Colors

```css
/* Primary Brand */
--kexp-orange: #F58216;
--kexp-orange-dark: #D16B0F;
--kexp-orange-light: #FF9B3F;

/* Backgrounds */
--warm-black: hsl(0, 0%, 8%);
--warm-gray: hsl(20, 5%, 15%);
--dark-background: hsl(25, 8%, 12%);
```

---

## Quick Reference Typography

```css
/* Hierarchy: Artist > Track > Metadata */
--font-artist: 16px / 600 / -0.01em;
--font-track: 14px / 400 / normal;
--font-meta: 12px / 500 / 0.02em;

/* Font Stack */
--font-body: 'IBM Plex Sans', sans-serif;
--font-mono: 'IBM Plex Mono', monospace;
```

---

## The "Would KEXP Do This?" Test

Before shipping any design:

1. **Does this respect unknown artists?** (even playing field)
2. **Does this serve discovery, not engagement hacking?** (mission)
3. **Is this authentic, not marketing?** (anti-commercial)
4. **Would a KEXP DJ approve?** (curatorial integrity)
5. **Does this honor album art?** (music-first)

If any answer is "no," revise.

---

## Visual Inspiration Sources

### Physical Spaces
- **Amoeba Records** (Los Angeles/SF) - Staff curation, visual merchandising
- **Rough Trade** (NYC/London) - Live music integration, community events
- **Easy Street Records** (Seattle) - Local institution, staff picks
- **KEXP Gathering Space** - Public accessibility, community hub

### Digital Interfaces
- **Bandcamp** - Album-centric, artist-supportive, discovery filters
- **Discogs** - Database depth, catalog browsing
- **Beats Music** (historical) - Interactive magazine aesthetic
- **KEXP.org** - Documentary videos, in-studio sessions

### Anti-Patterns (What NOT to Do)
- **Spotify** - Playlist-centric, algorithmic, thumbnail grids
- **Generic AI aesthetics** - Purple gradients, Space Grotesk, flat colors
- **Marketing visuals** - Glossy, aspirational, hype-driven

---

## Document Relationships

```
Vinyl Den Design System
│
├── Research Foundation
│   └── record-store-visual-curation.md
│       ├── Physical store design
│       ├── Crate digging culture
│       ├── KEXP aesthetic
│       └── Trust signals
│
├── Quick Reference
│   └── vinyl-den-design-summary.md
│       ├── 5 core principles
│       ├── Color palette
│       ├── Typography
│       └── Anti-patterns
│
├── Implementation
│   └── vinyl-den-ui-patterns.md
│       ├── Album art component
│       ├── Staff picks display
│       ├── Crate browsing
│       ├── Timeline layout
│       └── Code snippets
│
└── Brand Alignment
    ├── kexp-visual-identity-guardrails.md
    └── kexp-visual-guardrails-summary.md
```

---

## Usage Examples

### Scenario 1: Building a New Feature
1. Read **vinyl-den-design-summary.md** for principles
2. Check **vinyl-den-ui-patterns.md** for similar components
3. Review **kexp-visual-identity-guardrails.md** for brand compliance
4. Implement and test against "Would KEXP Do This?" checklist

### Scenario 2: Quick Design Decision
1. Check **vinyl-den-design-summary.md** quick reference
2. Look up colors/typography in this README
3. Verify against anti-patterns list

### Scenario 3: Onboarding New Designer
1. Read **record-store-visual-curation.md** (full research)
2. Review **vinyl-den-design-summary.md** (principles)
3. Study **vinyl-den-ui-patterns.md** (implementation)
4. Read **kexp-visual-identity-guardrails.md** (brand)

### Scenario 4: Writing Agent Content
1. Review **indie-radio-writing-examples.md** for tone
2. Check **kexp-visual-identity-guardrails.md** for cultural context
3. Ensure documentary (not marketing) voice

---

## External Resources

### Design Inspiration
- [KEXP.org](https://kexp.org) - Live sessions, DJ shows
- [Bandcamp Daily](https://daily.bandcamp.com) - Editorial content
- [Amoeba Music Blog](https://www.amoeba.com/blog) - Staff picks

### Typography
- [IBM Plex](https://www.ibm.com/plex/) - Open source font family
- [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) - Alternative display font

### Color Tools
- [Coolors](https://coolors.co) - Palette generation
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/) - WCAG compliance

### Music Industry References
- [Discogs](https://www.discogs.com) - Music database
- [MusicBrainz](https://musicbrainz.org) - Open music encyclopedia
- [AllMusic](https://www.allmusic.com) - Music guide

---

## Changelog

### 2025-12-18
- Added comprehensive vinyl den design research
- Created quick reference guide
- Added UI patterns with code examples
- Linked existing KEXP visual guidelines

### Previous Updates
- 2025-12-17: Added graph algorithm documentation
- 2025-12-17: Added agent handoff patterns
- 2025-12-18: Added KEXP writing examples

---

## Contributing

When adding new research:

1. **File naming:** Use kebab-case, descriptive names
2. **Headers:** Include date and purpose
3. **Sources:** Always cite external research
4. **Updates:** Update this README with new entries
5. **Cross-reference:** Link to related documents

---

## Questions?

- **Design decisions:** Start with `vinyl-den-design-summary.md`
- **Brand compliance:** Check `kexp-visual-identity-guardrails.md`
- **Implementation:** See `vinyl-den-ui-patterns.md`
- **Deep research:** Read `record-store-visual-curation.md`

---

**Maintained by:** Crate Design Team
**Contact:** See project documentation
