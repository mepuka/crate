---
name: frontend-design-foundations
description: Prevent distributional convergence and guide toward distinctive, purposeful frontend design that avoids generic "AI slop" aesthetics
---

# Frontend Design Foundations

## Purpose

This skill combats **distributional convergence** - the tendency for AI models to default to safe, generic design choices. Use this skill when creating or modifying frontend UI to ensure designs are distinctive, purposeful, and avoid predictable patterns.

## The Problem: Generic "AI Slop" Aesthetics

Without explicit guidance, designs default to:
- ❌ Generic fonts (Inter, Roboto overuse)
- ❌ Purple gradients and predictable color schemes
- ❌ Minimal, scattered animations
- ❌ Flat backgrounds and solid colors
- ❌ Template-like layouts that undermine brand identity

## Core Design Dimensions

### 1. Typography

**Choose Distinctive Typefaces:**
- ✅ **Display fonts**: Playfair Display, Bricolage Grotesque, Space Grotesk (used purposefully)
- ✅ **Body fonts**: IBM Plex Sans, Inter (when appropriate), system fonts
- ✅ **Monospace**: IBM Plex Mono, JetBrains Mono, Fira Code
- ❌ **Avoid**: Defaulting to Inter/Roboto without justification

**Use Extreme Contrast:**
- Font weight ranges: 100 (thin) vs 900 (black)
- Size jumps: 3x+ ratios between heading levels
- Visual impact through hierarchy, not just incremental sizing

**Example Scale:**
```
H1: text-6xl (3.75rem) font-bold (700-900)
H2: text-3xl (1.875rem) font-semibold (600)
H3: text-xl (1.25rem) font-semibold (600)
Body: text-base (1rem) font-normal (400)
Small: text-sm (0.875rem) font-normal (400)
```

### 2. Themes & Cohesive Aesthetics

**Commit to a Specific Mood:**
- Define cultural or atmospheric direction (e.g., "late-night radio broadcast," "brutalist architecture," "organic botanical")
- Create cohesive visual language across all elements
- Use thematic consistency in color, shape, texture

**Example Thematic Elements:**
- **Late-night radio**: Orange/amber accents, teal highlights, broadcast-inspired animations, retro typography
- **RPG aesthetic**: Fantasy palettes, ornate borders, parchment textures, medieval typography
- **Minimalist tech**: Sharp edges, monochrome with single accent, geometric patterns, technical monospace

### 3. Motion & Animation Strategy

**Orchestrated Over Scattered:**
- ✅ **High-impact sequences**: Page load reveals, staggered entrance animations
- ✅ **Purposeful transitions**: State changes, loading states, focus indicators
- ❌ **Avoid**: Random micro-interactions without purpose

**Implementation Priorities:**
1. **CSS-only for simple cases**: Transitions, hover effects, basic keyframes
2. **Framer Motion for React**: Complex orchestrations, gesture-based interactions
3. **Performance-first**: GPU-accelerated properties (transform, opacity)
4. **Accessibility**: Respect `prefers-reduced-motion`

**Animation Timing:**
- Fast: 150-200ms (hover, focus)
- Normal: 300-400ms (transitions)
- Slow: 600-800ms (page load sequences)

### 4. Background Treatment

**Create Atmospheric Depth:**
- ✅ **Layered backgrounds**: Multiple gradient layers, patterns, noise textures
- ✅ **Contextual effects**: Glassmorphism, subtle grain, atmospheric glow
- ✅ **Depth through layers**: Multiple pseudo-elements, backdrop filters
- ❌ **Avoid**: Flat solid colors without purpose

**Example Multi-Layer Background:**
```css
.element {
  /* Base layer: gradient */
  background: linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--background-darker)) 100%);

  position: relative;
}

.element::before {
  /* Mid layer: pattern */
  background-image: radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 24px 24px;
}

.element::after {
  /* Top layer: noise/grain */
  background-image: url('/noise.png');
  opacity: 0.03;
  mix-blend-mode: overlay;
}
```

### 5. Color Strategy

**Commit to Cohesive Schemes:**
- Define 1-2 dominant colors
- Add 1-2 sharp accent colors
- Use semantic color roles (primary, accent, success, warning, error)
- Ensure WCAG AA contrast ratios (4.5:1 for text)

**Avoid Generic Defaults:**
- ❌ Purple gradients unless thematically appropriate
- ❌ Default blue links without brand consideration
- ❌ Rainbow palettes without hierarchy

**Example Palette:**
```
Primary: Orange (#FF6B35) - radio glow, CTA elements
Accent: Teal (#00B8A9) - highlights, links, success states
Background: Deep charcoal (#1A1A1A)
Foreground: Off-white (#F8F8F8)
Muted: Gray variations (60%, 40%, 20% opacity of foreground)
```

### 6. Layout Patterns

**Break Template Predictability:**
- Use asymmetric layouts for visual interest
- Vary spacing rhythms (8px, 16px, 24px, 48px jumps)
- Create focal points through size/color/position
- Consider grid systems beyond 12-column defaults

**Responsive Strategy:**
- Mobile-first design approach
- Meaningful breakpoint changes, not just scaling
- Touch-friendly targets (44x44px minimum)
- Performance considerations (reduce effects on mobile)

## Explicit Avoidance Patterns

When working on frontend design, **explicitly avoid**:

❌ **Space Grotesk overuse** - It's distinctive but becoming a cliché
❌ **Purple gradients** - Unless thematic fit is strong
❌ **Generic blue links** - Brand-specific link colors
❌ **Flat solid backgrounds** - Add depth and atmosphere
❌ **Scattered micro-animations** - Orchestrate purposeful sequences
❌ **Template layouts** - Customize for brand identity
❌ **Default Inter/Roboto** - Choose fonts intentionally
❌ **Minimal animation** - Use motion to enhance UX
❌ **Predictable component styles** - Customize for uniqueness

## When to Use This Skill

Apply this skill when:
- Creating new UI components
- Designing page layouts
- Establishing design systems
- Reviewing frontend code for aesthetic quality
- Making design decisions about typography, color, or layout

## Integration with Other Skills

**Combine with:**
- `wcag-accessibility-compliance` - Ensure designs meet standards
- `design-system-consistency` - Maintain brand coherence
- `component-design-checklist` - Comprehensive component creation
- `music-ui-patterns` - Domain-specific design patterns

## Success Criteria

A design successfully avoids distributional convergence when it:
- ✅ Uses distinctive, purposeful typography (not default Inter/Roboto)
- ✅ Has cohesive aesthetic direction (thematic consistency)
- ✅ Includes atmospheric backgrounds (layers, depth)
- ✅ Features orchestrated animations (purposeful sequences)
- ✅ Demonstrates brand personality (not template-like)
- ✅ Balances visual impact with accessibility
- ✅ Avoids all items in the explicit avoidance list

## Examples of Good Practices

### Typography Hierarchy
```tsx
// ✅ GOOD: Extreme contrast, distinctive scale
<h1 className="text-6xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
  Major Heading
</h1>
<p className="text-base font-normal" style={{ fontFamily: 'var(--font-body)' }}>
  Body text with clear hierarchy
</p>

// ❌ BAD: Incremental sizing, no contrast
<h1 className="text-2xl font-medium">Heading</h1>
<p className="text-lg">Body text</p>
```

### Animation Orchestration
```tsx
// ✅ GOOD: Staggered sequence on page load
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, delay: 0.1 }}
>
  {children}
</motion.div>

// ❌ BAD: Random hover effect without purpose
<div className="hover:scale-105 transition-transform">
  {children}
</div>
```

### Background Depth
```tsx
// ✅ GOOD: Multi-layer atmospheric background
<div className="relative bg-gradient-to-b from-background to-background-darker">
  <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle,_white_1px,_transparent_1px)] bg-[length:24px_24px]" />
  <div className="relative z-10">{content}</div>
</div>

// ❌ BAD: Flat solid color
<div className="bg-white">
  {content}
</div>
```

## Design Process Checklist

When starting design work, verify:

- [ ] Typography choices are intentional and distinctive
- [ ] Color scheme is cohesive with thematic direction
- [ ] Backgrounds have atmospheric depth (not flat)
- [ ] Animations are orchestrated and purposeful
- [ ] Layout breaks template predictability
- [ ] All items in avoidance list are explicitly avoided
- [ ] Design has clear brand personality
- [ ] Accessibility standards maintained (WCAG AA)
- [ ] Responsive behavior is meaningful, not just scaled
- [ ] Performance implications considered

## Notes

- **Balance is key**: Distinctive doesn't mean overwhelming. Find the right level of visual impact for the context.
- **Context matters**: Some projects require conservative design. Apply principles proportionally.
- **Test with users**: Distinctive design should enhance UX, not hinder it.
- **Iterate**: First pass may overdo it. Refine based on feedback.
