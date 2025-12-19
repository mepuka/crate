# KEXP Visual Identity & Generative Art Guardrails

**Date:** 2025-12-18
**Purpose:** Define cultural and aesthetic guardrails for Crate's generative art system based on KEXP's visual identity, anti-commercial philosophy, and community-focused design approach.

---

## Executive Summary

KEXP's visual identity is shaped by **authenticity over commercialization**, **community over marketing**, and **substance over hype**. Their aesthetic centers on:

1. **Iconic warm orange branding** (black on orange logo, radio dial warmth)
2. **Documentary-style photography** (intimate, eye-focused, authentic moments)
3. **Interactive performance lighting** (2,000 LED balls creating unique visual signatures)
4. **Music-first presentation** (album art prominence, artist respect)
5. **Anti-commercial positioning** (no ads, no hype, curatorial integrity)

For Crate's generative art, these principles translate to **guardrails that prevent generic AI aesthetics** while honoring KEXP's earnest, music-discovery ethos.

---

## 1. KEXP's Visual Aesthetic

### 1.1 Color Palette

**Primary Brand Color:**
- **Orange:** KEXP's signature—black on orange logo, reminiscent of radio dials
- **Hex Approximation:** #F58216 (warm, energetic orange)
- **Context:** "Radio dial orange" evokes late-night tuning, discovery, warmth

**Secondary Palette (from KEXP Magazine and mobile app research):**
- **Dark themes** with warm undertones (not cold blacks)
- **Yellow-to-turquoise gradient** for modern edge (app design)
- **Performance lighting colors:** Varied, pulled from artist clothing, stage elements
- **Natural light colors** from in-studio sessions (warm, intimate)

**Avoid:**
- Generic purple gradients (AI default)
- Cold, corporate blues
- Overly saturated neon (unless music-contextual)
- Flat, lifeless grays

**Guardrail:** Use KEXP's warm orange as anchor. Secondary colors should feel **intentional, music-contextual, and atmospheric**, not algorithmically safe.

---

### 1.2 Typography

**Current KEXP Usage:**
- No official brand guidelines found, but UX case studies reveal preferences

**Mobile App Typography (Third-Party Redesign):**
- Avoided Space Grotesk, Inter, Roboto (generic fonts)
- Emphasized **distinctive type choices**
- Strong weight contrasts (200 vs 700)
- Clear hierarchy for music metadata (artist, track, album)

**Crate's Current Typography (from frontend-design-research-report.md):**
- **Display:** Space Grotesk (ironically, avoided by KEXP app designers)
- **Body:** IBM Plex Sans
- **Weight contrasts:** 200 vs 700 ✓ (good)
- **Typography classes:** `.track-title`, `.artist-name`, `.timestamp`

**Guardrail Recommendation:**
- **Maintain** IBM Plex Sans (distinctive, non-generic)
- **Consider replacing** Space Grotesk with Bricolage Grotesque or Playfair Display for headings
- **Ensure** music metadata typography is **readable, respectful, editorial** (not marketing)
- **Avoid** overly decorative fonts that distract from artist names

---

### 1.3 Photography & Visual Content Style

**KEXP's Documentary Approach:**

From research on KEXP photographers (Eleanor Petry, Lance Mercer, Niffer Calderwood):

> "Eleanor Petry uses colorful backgrounds or props that tell a specific story and focuses the camera on the eyes of her subject in a way that feels intimate... Beyond photography, she's also a sought-out music video director."

**Key Characteristics:**
1. **Intimate, eye-focused portraits** (not distant or staged)
2. **Contextual backgrounds** that tell stories (not generic backdrops)
3. **Documentary intention** ("wanting to do more documentary work")
4. **Behind-the-scenes access** (in-studio, live sessions, candid moments)
5. **Artist-centric** (musicians as humans, not products)

**KEXP Magazine Design Philosophy:**
> "Communicates the organization's professionalism, the engaging artists, and the fun vibrant nature of in-studio performances through the concept 'KEXP: Storytelling Through Music.'"

**Color Palette Derived from Performances:**
> "The initial color palette mimicked the most common light colors used during KEXP in-studio performances. Colors were also pulled from elements that artists wore, like clothes, hair, or make-up."

**Guardrail for Generative Art:**
- **DO:** Create visuals that feel **documentary, contextual, and artist-respectful**
- **DO:** Use **album art as primary visual anchor** (music-first)
- **DO:** Derive color palettes from **actual music context** (genre, mood, era)
- **AVOID:** Generic stock-photo aesthetics
- **AVOID:** Marketing-style artist portraits (glossy, commercial)
- **AVOID:** Visuals that overshadow the music

---

### 1.4 The Live Room Lighting Design

KEXP's most distinctive visual element: **interactive LED installation**

**Technical Details:**
- **2,000 LED balls** on three walls
- **Kinect sensors** respond to artist movements
- **Microsoft Surface tablet** controls lighting via custom software
- **Dynamic per-performance** (each show is unique)

**Design Philosophy:**
> "String lights have become a familiar touchstone for fans... The lights are central to the Live Room's aesthetic... It never really felt like a real place until we had the lights."

**Pre-Performance Calibration:**
> "Prior to a shoot, KEXP's video production team dials in the look and feel of the light setup. Before going on the air, they take into account feedback from the band, equipment setup, and even the color of an artist's clothing."

**Guardrail Insight:**
KEXP's lighting is **reactive, contextual, and collaborative** with artists. It's not a fixed template—it adapts to each performance.

**For Crate's Generative Art:**
- **Adapt visual style to music context** (genre, era, mood)
- **Use album art colors as input** (like KEXP uses artist clothing)
- **Create unique signatures per artist** (not one-size-fits-all)
- **Interactive/responsive feels aligned** with KEXP's philosophy

---

## 2. How Visuals Support Music Discovery

### 2.1 KEXP's Discovery Mission

> "We aspire to be the greatest music discovery resource in the world... We're much more than a radio station. We're a non-profit arts organization. The drive is to help people discover new music."

**Visual Strategy:**
1. **Album art digitization** for entire vinyl collection (preserving DJ notes)
2. **Multi-angle video capture** (4 cameras per in-studio session)
3. **Photographer documentation** of all 500+ annual performances
4. **Art gallery in Gathering Space** (visual artists + music)

**Key Insight:**
Visuals are **archival, contextual, and educational**, not promotional. They serve **discovery and connection**, not marketing.

---

### 2.2 Progressive Disclosure (from Crate UI/UX Research)

> "Tease, don't overwhelm."

**Design Pattern:**
- **Entry point:** Album art + artist name + track title
- **Hover/click:** Additional metadata, insights, links
- **Deep dive:** Full play details, connections, historical context

**Guardrail for Generative Art:**
- **Layer information visually** (not all at once)
- **Use visual hierarchy** to guide attention (artist → album → details)
- **Avoid cluttered compositions** with too much text/data
- **Respect the album art** as primary visual (don't compete with it)

---

### 2.3 Album Art as Anchor

From KEXP's digitization project:
> "The station plans to photograph and digitize the album art for their entire vinyl collection for the purpose of preserving DJ notes... quicker access to a digital library plays directly into how KEXP DJs select music."

**Implication:**
Album art is **sacred**—it's how DJs browse, how listeners recognize music, and how KEXP honors artists.

**Guardrail:**
- **Never obscure or distort album art** with generative overlays
- **Use album art colors as palette source** (respect the artist's visual intent)
- **Treat album art as the "hero image"** in any composition
- **Generative elements should frame/enhance**, not replace

---

## 3. Anti-Commercial Stance

### 3.1 The "Authenticity vs. Commercialization" Tension

From research on music in advertising:

> "Although the use of popular music in advertising gives companies the opportunity to communicate a favorable brand image... there has been growing concern from music fans and musicians about such commercialization. Bands' participation in advertising campaigns has been considered a breach of authenticity that may severely damage their reputation."

**Consumer Fear:**
> "Many consumers fear that advertising dilutes the aesthetic credentials of the music it uses."

**The Ultimate Sellout:**
> "Using an artist's music for commercial purposes could be seen as 'the ultimate sellout that offended aesthetic and bohemian values.'"

**KEXP's Position:**
KEXP is **non-commercial radio**, funded by community support. No ads. No sponsors dictating playlists. **Curatorial integrity is paramount.**

---

### 3.2 Avoiding "Marketing Aesthetics"

**What is Marketing Aesthetics?**
(From research on brand design trends)

- Glossy, polished perfection
- Generic stock photography
- Over-produced visuals
- Aspirational lifestyle framing
- Hype language and superlatives
- Purple gradients and safe design choices (AI defaults)

**What KEXP Does Instead:**
- Documentary photography (real moments)
- Behind-the-scenes access (authentic glimpses)
- DJ notes and commentary (personal voice)
- Community focus (listeners = participants, not consumers)

**Guardrail:**
- **Avoid generative art that looks like ads**
- **Embrace imperfection** (grainy textures, candid moments)
- **Use natural light aesthetics** (not studio-perfect)
- **Prioritize storytelling over polish**

---

### 3.3 The "Even Playing Field" Principle

From KEXP DJ Larry Mizell Jr.:

> "Imagine all the stations supporting artists, and then the artists listening to these community stations... when an artist hears their band next to the Violent Femmes... next to Radiohead... you, the emerging artist, have been given the respect of being on an even playing field."

**Implication for Visuals:**
A **local band's debut single** deserves the **same visual respect** as a Radiohead track.

**Guardrail:**
- **Do not create "tiered" visual treatments** based on artist popularity
- **Give equal visual love** to unknown artists
- **If anything, highlight emerging artists more** (discovery mission)
- **Avoid "big name" visual bias** (larger images, flashier treatments)

---

## 4. Community-Focused Design

### 4.1 KEXP's Gathering Space Philosophy

> "KEXP's Gathering Space was created as a place for the community to connect and share their love for music and the arts. It is a welcoming space for neighbors, freelancers, travelers, and music fans."

**Design Attributes:**
- **Welcoming, not exclusive** (cafe, art gallery, open studio viewing)
- **Participant, not consumer** (you belong here)
- **Shared experience** (70-person viewing gallery for live sessions)

**Implication:**
Visuals should feel **inclusive, inviting, and human-scale**, not overwhelming or elite.

---

### 4.2 Community-Driven Design (from Music App Research)

**MOOZ Example (Musician Collaboration Platform):**
> "User-Driven Design: Thousands of teachers, students, and professional musicians shaped the interface, features, and tools through testing and feedback. MOOZ was literally built with the community it serves."

**Spotify's Community Approach:**
> "A cross-disciplinary team of people who love to create great experiences and make meaningful connections between listeners and creators."

**Guardrail:**
- **Design for listeners, not algorithms**
- **Facilitate connections** (artist → listener, listener → listener)
- **Avoid extractive patterns** (engagement hacks, dark patterns)
- **Respect user agency** (no auto-play surprises, clear navigation)

---

### 4.3 "Listener-Centric" vs. "Platform-Centric"

| Platform-Centric | KEXP Listener-Centric |
|-----------------|----------------------|
| Optimize for engagement metrics | Optimize for musical merit |
| "Keep users on platform" | "Help users discover music" |
| Algorithm-curated playlists | Human DJ curation |
| Generic recommendations | Contextual, reasoned choices |
| Passive consumption | Active exploration |

**Guardrail for Generative Art:**
- **Serve discovery, not retention**
- **Be transparent** (why this visual? what's the connection?)
- **Empower exploration** (visuals as gateways, not endpoints)
- **Respect listener time and attention**

---

## 5. Guardrails for Crate's Generative Art System

### 5.1 Core Principles

**DO:**
1. **Use KEXP's warm orange** as brand anchor (#F58216 or similar)
2. **Derive palettes from album art** (respect artist's visual intent)
3. **Create contextual visuals** that reflect genre, era, mood
4. **Embrace documentary aesthetics** (natural light, candid, authentic)
5. **Layer information progressively** (album art first, details on interaction)
6. **Give equal visual respect** to all artists (even playing field)
7. **Use typography that's readable and respectful** (IBM Plex Sans, editorial feel)
8. **Add subtle texture and grain** (avoid clinical perfection)
9. **Make visuals adaptive** (unique signatures per artist, not templates)
10. **Support discovery** (visuals as invitations to explore)

**AVOID:**
1. **Generic AI aesthetics** (purple gradients, Space Grotesk overuse, flat backgrounds)
2. **Marketing visuals** (glossy, aspirational, hype-driven)
3. **Obscuring album art** (it's sacred—frame it, don't cover it)
4. **Tiered treatments** (don't make big names "bigger" visually)
5. **Commercial photography style** (staged, perfect, stock-photo feel)
6. **Overly decorative fonts** that compete with artist names
7. **Cold color palettes** (stick to warm, inviting tones)
8. **Static templates** (each artist deserves unique treatment)
9. **Cluttered compositions** (respect negative space, progressive disclosure)
10. **Engagement hacks** (no dark patterns, no algorithmic tricks)

---

### 5.2 Typography Guardrails

**Hierarchy:**
1. **Artist name** = most prominent (respect the creator)
2. **Track title** = secondary
3. **Album, year, metadata** = tertiary

**Font Choices:**
- **Body text:** IBM Plex Sans (current, good choice)
- **Display/Headings:** Consider Bricolage Grotesque or Playfair Display (replace Space Grotesk)
- **Monospace/Data:** IBM Plex Mono (if needed for timestamps, IDs)

**Weight & Scale:**
- **Extreme contrasts:** 200 vs 700 (current, keep)
- **Size jumps:** 3x+ ratios for hierarchy
- **Line height:** 1.5× minimum (WCAG 2.2)

**Avoid:**
- Inter, Roboto (generic AI defaults)
- Space Grotesk (overused in AI artifacts)
- Overly stylized display fonts (readability first)

---

### 5.3 Color Palette Guardrails

**Primary:**
- **Radio Orange:** #F58216 (or close variant)
- Use for: Links, accents, highlights, call-to-action elements

**Secondary (Contextual):**
- **Album art extraction:** Use dominant colors from current play's album
- **Genre palettes:**
  - Punk/Rock: Raw reds, blacks, whites
  - Electronic: Neon blues, purples, cyans (when contextual)
  - Jazz: Warm golds, deep blues, sepia tones
  - World: Earth tones, vibrant cultural colors
  - Hip-Hop: Bold primaries, urban grays

**Backgrounds:**
- **Dark theme base:** Warm blacks (not pure #000000)
- **Layered gradients:** Subtle, atmospheric (not flat)
- **Grain texture:** Add subtle noise (avoid clinical smoothness)
- **Glassmorphism:** Current Crate design—keep (lets album art show through)

**Avoid:**
- Pure black backgrounds (too harsh)
- Generic purple gradients (AI default)
- Neon without context (unless music-appropriate)
- Overly saturated colors (respect album art subtlety)

---

### 5.4 Album Art Treatment

**Primary Rule:** **Album art is sacred—never obscure, distort, or replace it.**

**DO:**
- Display at **high resolution** (respect the artwork)
- Use as **primary visual anchor** in play cards
- Extract **color palette** for generative elements
- **Frame** with subtle borders or shadows (not aggressive)
- Let it **show through glassmorphism** layers (current Crate design ✓)

**AVOID:**
- Heavy filters or overlays that obscure artwork
- Cropping that removes key visual elements
- Stretching or distorting aspect ratios
- Replacing missing art with generic placeholders (use subtle patterns instead)

---

### 5.5 Animation & Motion

**Current Crate Animations (from frontend-design-research-report.md):**
- Staggered reveal (fadeInUp) ✓
- Broadcast pulse effect ✓
- Radio glow animation ✓
- Respects `prefers-reduced-motion` ✓

**KEXP Alignment:**
- **Interactive lighting** (2,000 LED balls responding to artist movement)
- **Unique per performance** (not templated)
- **Contextual** (calibrated to artist clothing, setup)

**Guardrails:**
- **Orchestrated sequences** over scattered micro-interactions
- **High-impact moments** (page load, show transitions) over constant motion
- **Music-reactive** if possible (pulse to beat, glow on transitions)
- **Accessibility:** Always respect `prefers-reduced-motion`
- **Performance:** GPU-accelerated, 60fps minimum

**Avoid:**
- Generic hover effects everywhere
- Distracting constant motion
- Animation for animation's sake
- Ignoring accessibility settings

---

### 5.6 Layout & Composition

**KEXP's Visual Hierarchy (from Magazine design):**
> "Communicates professionalism, engaging artists, and fun vibrant nature through 'Storytelling Through Music' theme."

**Guardrails:**
1. **Music first:** Album art + artist name = hero
2. **Progressive disclosure:** Details revealed on interaction (not all upfront)
3. **Scannable metadata:** Clear typography hierarchy
4. **Generous whitespace:** Avoid clutter (current Crate design ✓)
5. **Grid-based layouts:** Predictable, readable, responsive
6. **Mobile-first:** Touch targets 44x44px minimum (WCAG 2.2)

**Avoid:**
- Cluttered compositions with too much text
- Competing visual elements (let album art dominate)
- Unpredictable layouts that disorient users
- Tiny text or tap targets (accessibility fail)

---

### 5.7 Ethical AI Guardrails

**From Generative AI Research:**

> "The majority of generative music systems cannot yet be deemed responsible by design... Navigating the rise of generative music AI requires balancing innovation while safeguarding the artistic integrity and economic sustainability of human creators."

**Corporate AI Limitations:**
> "Each time companies release new AI versions, the system shifts according to the latest training data, as well as the guardrails and values incorporated into it."

**KEXP-Aligned Approach:**
- **Transparent about AI use** (don't pretend it's human-curated)
- **Complement, don't replace** human curation (KEXP DJs are the stars)
- **Respect artist rights** (no training on copyrighted work without permission)
- **Avoid "AI slop"** (generic outputs that devalue the music)
- **Maintain human oversight** (AI generates, humans approve)

**Guardrail:**
Crate's generative art should **amplify KEXP's human curation**, not simulate it. Always make clear what's AI-generated vs. human-curated.

---

## 6. Implementation Checklist

### 6.1 Design System Updates

**Phase 1: Color Palette**
- [ ] Formalize KEXP orange (#F58216) as primary accent color
- [ ] Create album art color extraction system (use dominant colors)
- [ ] Define genre-contextual secondary palettes
- [ ] Document warm black backgrounds (not pure black)
- [ ] Add subtle grain texture to all backgrounds

**Phase 2: Typography**
- [ ] Audit Space Grotesk usage (consider replacing with Bricolage Grotesque)
- [ ] Ensure IBM Plex Sans remains primary body font
- [ ] Verify all music metadata uses clear hierarchy (artist > track > album)
- [ ] Test typography at small sizes (mobile readability)

**Phase 3: Album Art**
- [ ] Implement high-resolution album art display
- [ ] Create color extraction pipeline (palette from artwork)
- [ ] Design subtle placeholder for missing art (no generic icons)
- [ ] Ensure glassmorphism doesn't obscure artwork

**Phase 4: Animation**
- [ ] Audit all animations for music-contextual triggers
- [ ] Add `prefers-reduced-motion` support to all new animations
- [ ] Create "show transition" animation (unique per program)
- [ ] Test performance (60fps minimum)

**Phase 5: Generative Art**
- [ ] Define generative art scope (backgrounds? overlays? transitions?)
- [ ] Create template system that adapts per artist (no one-size-fits-all)
- [ ] Implement album art color extraction as input
- [ ] Add human review step before publishing generated assets
- [ ] Document AI usage in UI (transparency)

---

### 6.2 Accessibility Compliance (WCAG 2.2)

From frontend design research:

- [ ] **Contrast ratios:** 4.5:1 minimum for text (verify with tools)
- [ ] **Touch targets:** 44x44px minimum for all interactive elements
- [ ] **Focus indicators:** Visible on all interactive elements
- [ ] **Keyboard navigation:** Complete keyboard-only navigation
- [ ] **Screen reader testing:** NVDA/JAWS verification
- [ ] **Color independence:** Never use color alone to convey information
- [ ] **Reduced motion:** Respect `prefers-reduced-motion` setting

---

### 6.3 Anti-"AI Slop" Checklist

Before approving any generative art:

- [ ] Does it feel **authentic**, not generic?
- [ ] Does it **respect the album art** (not obscure/distort)?
- [ ] Does it **derive from music context** (not random)?
- [ ] Does it **avoid purple gradients** and AI defaults?
- [ ] Does it use **KEXP's warm orange** appropriately?
- [ ] Does it feel **documentary**, not promotional?
- [ ] Does it **treat all artists equally** (no tiered visuals)?
- [ ] Does it **layer information** progressively?
- [ ] Does it **pass accessibility standards**?
- [ ] Would it make an **KEXP DJ proud**?

---

## 7. Key Takeaways

### 7.1 KEXP's Visual Identity in 3 Words

1. **Authentic** (documentary, not marketing)
2. **Warm** (orange, natural light, human)
3. **Music-First** (album art sacred, artist-respectful)

---

### 7.2 The "Would KEXP Do This?" Test

When evaluating any visual design decision, ask:

1. **Would this make an emerging artist feel respected?** (even playing field)
2. **Does this serve discovery, not engagement hacking?** (mission alignment)
3. **Is this authentic, or does it feel like an ad?** (anti-commercial)
4. **Would a KEXP DJ approve of this visual treatment?** (curatorial integrity)
5. **Does this honor the album art, or compete with it?** (music-first)

If the answer to any question is "no," revise the design.

---

### 7.3 Inspirational KEXP Quotes for Design Decisions

> "We're not a bunch of radio pros. We're a bunch of pro-music people."
— **Larry Mizell Jr., KEXP DJ**

> "String lights have become a familiar touchstone for fans... It never really felt like a real place until we had the lights."
— **Jim Beckmann, KEXP Video Producer**

> "We aspire to be the greatest music discovery resource in the world... The drive is to help people discover new music."
— **KEXP Mission Statement**

> "When an artist hears their band next to the Violent Femmes... next to Radiohead... you, the emerging artist, have been given the respect of being on an even playing field."
— **Larry Mizell Jr.**

---

## 8. Sources

### KEXP Visual Identity
- [KEXP Magazine Design (Greta Rose)](https://www.gretarose.design/work/kexpmagazine)
- [KEXP Turns on the Bright Lights (Live Room)](https://www.kexp.org/read/2017/1/25/kexp-turns-on-the-bright-lights/)
- [Microsoft + KEXP Live Room Installation](https://news.microsoft.com/features/new-permanent-light-installation-at-kexp-reimagines-live-room-performances-with-kinect-and-surface/)
- [KEXP Logo History (Throwback Shirt Story)](https://www.kexp.org/read/2022/3/11/story-behind-kexps-throwback-logo-shirt-and-intern-who-created-it/)
- [Lance Mercer Photography Retrospective](https://kexp.org/read/2017/12/13/lance-mercer-photography-retrospective-coming-kexp/)
- [Eleanor Petry Visual Artist Interview](https://www.kexp.org/read/2021/12/1/visual-artist-eleanor-petry-chastity-belts-new-videos-kexp-interview/)

### Music Discovery & Community Radio
- [KEXP Redefines Public Radio](https://noncommusic.org/stories/kexp-redefines-public-radio-music-station/)
- [National Radio Week: Social Impact of Community Radio](https://www.kexp.org/read/2017/08/18/national-radio-week-kexp-on-the-social-impact-of-community-radio/)
- [Sub Pop Stories: Branding and Design](https://www.kexp.org/fromthevault/sub-pop-stories-branding-and-design/)

### Anti-Commercial Aesthetics
- [Music in Advertising and Consumer Identity (SAGE Journals)](https://journals.sagepub.com/doi/full/10.1177/1470593117692021)
- [Authenticity in Music Marketing (Audiodraft)](https://www.audiodraft.com/blog/authenticity-the-now-of-music-marketing/)

### Community-Focused Design
- [KEXP Mobile App UX Case Studies](https://jnwddesign.com/kexp)
- [Spotify Design: Audio-Forward UX](https://spotify.design/article/audio-forward-ux-meeting-listeners-where-they-are)
- [Community Music App Design (MOOZ)](https://blog.musehub.com/how-one-app-is-changing-online-music-collaboration/)

### Generative AI Ethics
- [Opening Musical Creativity? Embedded Ideologies in Generative-AI Music Systems (arXiv)](https://arxiv.org/html/2508.08805v1)
- [Towards Responsible AI Music (arXiv)](https://arxiv.org/html/2503.18814v1)
- [Artists' Rights in the Age of Generative AI (GJIA)](https://gjia.georgetown.edu/2024/07/10/innovation-and-artists-rights-in-the-age-of-generative-ai/)

### Frontend Design Best Practices (2025)
- [WCAG 2.2 Accessibility Standards](https://www.w3.org/WAI/WCAG22/quickref/)
- [Design Tokens Specification 2025.10](https://design-tokens.github.io/community-group/format/)
- [Micro-Interactions Best Practices 2025](https://stan.vision/micro-interactions-2025-best-practices)

### Internal Crate Documentation
- `/Users/pooks/Dev/crate/docs/frontend-design-research-report.md`
- `/Users/pooks/Dev/crate/docs/FRONTEND_DESIGN.md`
- `/Users/pooks/Dev/crate/docs/kexp-integration.md`
- `/Users/pooks/Dev/crate/docs/AGENT_PROMPT_ENGINEERING_GUIDE.md`

---

## Appendix A: KEXP Color Palette Reference

### Primary Brand
```css
--kexp-orange: #F58216;
--kexp-orange-dark: #D16B0F;
--kexp-orange-light: #FF9B3F;
```

### Warm Backgrounds
```css
--warm-black: hsl(0, 0%, 8%);      /* Not pure black */
--warm-gray: hsl(20, 5%, 15%);     /* Slight warm tint */
--dark-background: hsl(25, 8%, 12%); /* Warm undertone */
```

### Contextual Secondaries
```css
/* Genre Palettes */
--punk-red: #D32F2F;
--electronic-cyan: #00BCD4;
--jazz-gold: #FFB300;
--world-earth: #8D6E63;
```

---

## Appendix B: Comparison to Generic AI Aesthetics

| Generic AI Default | KEXP-Aligned Alternative |
|-------------------|-------------------------|
| Purple gradient background | Warm dark background with subtle orange accent |
| Space Grotesk font | IBM Plex Sans or Bricolage Grotesque |
| Flat solid colors | Layered gradients with grain texture |
| Generic stock photo style | Documentary photography (candid, intimate) |
| Centered, symmetrical layouts | Asymmetric, dynamic compositions |
| Minimal scattered animations | Orchestrated entrance sequences |
| Clinical perfection | Subtle imperfections (grain, texture) |
| Marketing hype tone | Earnest, conversational tone |
| Algorithm-optimized | Human-curated feel |
| Passive consumption | Active discovery invitation |

---

**Document Version:** 1.0
**Last Updated:** 2025-12-18
**Next Review:** After generative art system prototype implementation
