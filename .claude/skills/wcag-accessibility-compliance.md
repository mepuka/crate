---
name: wcag-accessibility-compliance
description: Ensure all frontend designs and components meet WCAG 2.2 Level AA accessibility standards for inclusive, usable interfaces
---

# WCAG 2.2 Accessibility Compliance

## Purpose

This skill ensures all frontend work meets **WCAG 2.2 Level AA** accessibility standards. Use this skill when creating or reviewing UI components, conducting accessibility audits, or making design decisions that impact usability for people with disabilities.

## WCAG 2.2 Overview

**Standard**: Web Content Accessibility Guidelines 2.2 (2025 stable version)
**Target Level**: AA (minimum for most regulatory requirements)
**Scope**: Visual, auditory, motor, and cognitive accessibility

**Four Principles (POUR):**
1. **Perceivable** - Information must be presentable to users in ways they can perceive
2. **Operable** - UI components must be operable by all users
3. **Understandable** - Information and operation must be understandable
4. **Robust** - Content must be robust enough to work with assistive technologies

## Critical Success Criteria (Level AA)

### 1. Color & Contrast (Perceivable)

#### 1.4.3 Contrast (Minimum) - Level AA

**Requirement**: Text must have sufficient contrast against background

**Standards:**
- **Normal text** (< 18pt or < 14pt bold): **4.5:1** minimum
- **Large text** (≥ 18pt or ≥ 14pt bold): **3:1** minimum
- **UI components** (buttons, form borders, icons): **3:1** minimum
- **Graphical objects** (charts, diagrams): **3:1** minimum

**How to Check:**
```javascript
// Use browser DevTools Contrast Checker or:
// https://webaim.org/resources/contrastchecker/

// Example: Check if text meets WCAG AA
const foreground = 'hsl(0, 0%, 97%)';  // #F8F8F8
const background = 'hsl(0, 0%, 10%)';  // #1A1A1A
// Ratio: 14.8:1 ✓ Passes AAA (> 7:1)

const primary = 'hsl(25, 85%, 60%)';   // Orange
const background = 'hsl(0, 0%, 10%)';  // Charcoal
// Ratio: 5.2:1 ✓ Passes AA (> 4.5:1)
```

**Common Issues:**
- ❌ Light gray text on white background (insufficient contrast)
- ❌ Colored text on colored background without checking ratio
- ❌ Links that rely only on color (need underline or other indicator)

**Solutions:**
```tsx
// ✅ GOOD: High contrast text
<p className="text-foreground">  {/* 14.8:1 ratio */}
  Main content text
</p>

// ✅ GOOD: Links with multiple indicators
<a href="#" className="text-accent underline hover:brightness-110">
  {/* Color + underline */}
  Link text
</a>

// ❌ BAD: Low contrast
<p className="text-gray-400">  {/* Might be < 4.5:1 */}
  Insufficient contrast
</p>
```

#### 1.4.11 Non-text Contrast - Level AA

**Requirement**: UI components and graphical objects must have 3:1 contrast

**Applies to:**
- Form input borders
- Button borders/backgrounds
- Icons (when convey information)
- Charts and data visualizations
- Focus indicators

**Example:**
```tsx
// ✅ GOOD: Button with sufficient contrast
<button className="bg-primary text-primary-foreground border border-primary/20">
  {/* Orange button on dark bg: 5.2:1 ✓ */}
  Submit
</button>

// ✅ GOOD: Form input with visible border
<input className="border border-border bg-card">
  {/* Border: 3.5:1 ✓ */}
</input>

// ❌ BAD: Borderless input on similar background
<input className="border-none bg-background/50">
  {/* No visual boundary */}
</input>
```

### 2. Keyboard Accessibility (Operable)

#### 2.1.1 Keyboard - Level A (but critical for AA)

**Requirement**: All functionality available via keyboard

**Standards:**
- All interactive elements must be keyboard accessible
- Tab order must follow visual/logical order
- No keyboard traps (users can always navigate away)
- Custom controls must handle Enter/Space for activation

**Implementation:**
```tsx
// ✅ GOOD: Native button (keyboard accessible by default)
<button onClick={handleClick}>Click me</button>

// ✅ GOOD: Custom interactive element with keyboard support
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Custom button
</div>

// ❌ BAD: div with onClick but no keyboard support
<div onClick={handleClick}>
  Not keyboard accessible
</div>
```

#### 2.4.7 Focus Visible - Level AA

**Requirement**: Keyboard focus must be clearly visible

**Standards:**
- Focus indicator must have 3:1 contrast against background
- Focus indicator must be at least 2px thick or equivalent
- Don't remove default focus outlines without replacement

**Implementation:**
```tsx
// ✅ GOOD: Visible focus ring
<button className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
  {/* Orange ring with 5.2:1 contrast */}
  Button
</button>

// ✅ GOOD: Custom focus style
<a href="#" className="focus-visible:ring-2 focus-visible:ring-accent">
  Link with teal focus ring
</a>

// ❌ BAD: Focus outline removed without replacement
<button className="focus:outline-none">
  No visible focus
</button>
```

#### 2.5.8 Target Size (Minimum) - Level AA (New in WCAG 2.2)

**Requirement**: Touch/click targets must be at least 24x24 CSS pixels

**Exception**: Targets of 44x44px recommended for better usability

**Implementation:**
```tsx
// ✅ GOOD: Large touch target
<button className="p-3 min-h-[44px] min-w-[44px]">
  {/* 44x44px total */}
  <Icon className="h-6 w-6" />
</button>

// ✅ GOOD: Full card is clickable
<div className="play-card relative">
  <div className="absolute inset-0 cursor-pointer" onClick={handleClick} />
  {/* Entire card area is target */}
</div>

// ❌ BAD: Small icon button without padding
<button>
  <Icon className="h-4 w-4" />  {/* Only 16x16px */}
</button>
```

### 3. Text & Content (Perceivable & Understandable)

#### 1.4.4 Resize Text - Level AA

**Requirement**: Text must be resizable up to 200% without loss of content or functionality

**Implementation:**
- Use relative units (`rem`, `em`) instead of `px` for font sizes
- Ensure layouts don't break at 200% zoom
- Test with browser zoom at 200%

```css
/* ✅ GOOD: Relative units */
.text {
  font-size: 1rem;      /* 16px base, scales with user preferences */
  line-height: 1.5;
}

/* ❌ BAD: Fixed pixel sizes */
.text {
  font-size: 16px;      /* Doesn't scale with user font size settings */
}
```

#### 1.4.12 Text Spacing - Level AA

**Requirement**: Content must not break when users adjust text spacing

**Standards must support:**
- Line height at least 1.5x font size
- Paragraph spacing at least 2x font size
- Letter spacing at least 0.12x font size
- Word spacing at least 0.16x font size

```css
/* ✅ GOOD: Supports text spacing adjustments */
.text {
  line-height: 1.5;           /* At least 1.5 */
  margin-bottom: 2em;         /* Paragraph spacing */
  /* Don't set max-height or overflow: hidden that would clip */
}
```

#### 3.1.1 Language of Page - Level A

**Requirement**: Primary language must be declared

```html
<!-- ✅ GOOD: Language declared -->
<html lang="en">

<!-- For multilingual content -->
<p>The French phrase <span lang="fr">Bonjour</span> means hello.</p>
```

### 4. Forms & Inputs (Operable & Understandable)

#### 3.3.2 Labels or Instructions - Level A

**Requirement**: Form inputs must have clear labels or instructions

```tsx
// ✅ GOOD: Explicit label association
<label htmlFor="email">Email Address</label>
<input id="email" type="email" name="email" required />

// ✅ GOOD: aria-label for icon-only inputs
<input
  type="search"
  aria-label="Search plays by song, artist, or album"
  placeholder="Search..."
/>

// ❌ BAD: Unlabeled input
<input type="text" placeholder="Enter your name" />
{/* Placeholder is NOT a label */}
```

#### 3.3.1 Error Identification - Level A

**Requirement**: Errors must be clearly identified and described

```tsx
// ✅ GOOD: Clear error message with aria-describedby
<label htmlFor="password">Password</label>
<input
  id="password"
  type="password"
  aria-invalid={hasError}
  aria-describedby={hasError ? "password-error" : undefined}
/>
{hasError && (
  <p id="password-error" className="text-destructive text-sm mt-1">
    Password must be at least 8 characters
  </p>
)}

// ❌ BAD: Visual-only error indication
<input className={hasError ? "border-red-500" : ""} />
{/* Screen readers don't know about error */}
```

### 5. Semantic HTML & ARIA (Perceivable & Robust)

#### 4.1.2 Name, Role, Value - Level A

**Requirement**: All UI components must have accessible names, roles, and values

**Use semantic HTML first:**
```tsx
// ✅ GOOD: Semantic HTML (role, name implicit)
<button>Close</button>
<nav>...</nav>
<article>...</article>

// ✅ GOOD: ARIA when semantic HTML isn't enough
<div role="button" aria-label="Close panel" tabIndex={0}>
  <X className="h-6 w-6" />
</div>

// ❌ BAD: Generic div without role/name
<div onClick={handleClose}>
  <X />
</div>
```

**Common ARIA patterns:**
```tsx
// Modal/Dialog
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm Action</h2>
  {/* dialog content */}
</div>

// Loading state
<div role="status" aria-live="polite" aria-busy={isLoading}>
  {isLoading ? 'Loading...' : content}
</div>

// Expandable section
<button
  aria-expanded={isOpen}
  aria-controls="section-content"
  onClick={toggle}
>
  Toggle Section
</button>
<div id="section-content" hidden={!isOpen}>
  {/* section content */}
</div>
```

### 6. Images & Media (Perceivable)

#### 1.1.1 Non-text Content - Level A

**Requirement**: All images must have text alternatives

**Implementation:**
```tsx
// ✅ GOOD: Descriptive alt text for content images
<img
  src="/album-art.jpg"
  alt="Blue Album by Weezer - Cover shows four band members against blue background"
/>

// ✅ GOOD: Empty alt for decorative images
<img src="/decorative-pattern.svg" alt="" />

// ✅ GOOD: AlbumArt component with proper alt
<AlbumArt
  src={play.image_uri}
  alt={`${play.album} by ${play.artist}`}
  size={120}
/>

// ❌ BAD: Missing alt attribute
<img src="/album-art.jpg" />

// ❌ BAD: Useless alt text
<img src="/album-art.jpg" alt="image" />
```

### 7. Motion & Animation (Operable)

#### 2.3.3 Animation from Interactions - Level AAA (but good practice for AA)

**Requirement**: Provide way to disable motion started by interaction

**Implementation:**
```css
/* ✅ GOOD: Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

```tsx
// ✅ GOOD: Conditional animation based on user preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

<motion.div
  initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
  animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
  transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
>
  {children}
</motion.div>
```

## Component Accessibility Checklist

When creating or reviewing a component, verify:

### Interactive Elements
- [ ] All interactive elements are keyboard accessible (Tab, Enter, Space)
- [ ] Focus indicators are visible (2px ring, 3:1 contrast)
- [ ] Touch targets are at least 44x44px
- [ ] Semantic HTML used where possible (`<button>`, `<a>`, `<input>`)
- [ ] ARIA roles/labels added when semantic HTML insufficient
- [ ] Custom controls handle keyboard events (Enter, Space, Escape, Arrow keys)

### Visual Design
- [ ] Text contrast meets 4.5:1 (normal) or 3:1 (large) against background
- [ ] UI component borders/backgrounds meet 3:1 contrast
- [ ] Color is not the only indicator of meaning (use icons, text, patterns)
- [ ] Focus indicators are clearly visible (3:1 contrast, 2px minimum)
- [ ] Layout doesn't break at 200% zoom
- [ ] Content supports user text spacing adjustments

### Content & Forms
- [ ] Form inputs have associated labels (`<label>` or `aria-label`)
- [ ] Error messages are programmatically associated (`aria-describedby`)
- [ ] Images have descriptive alt text (or `alt=""` for decorative)
- [ ] Language is declared (`lang` attribute)
- [ ] Instructions are clear and available to screen readers

### ARIA & Semantics
- [ ] Semantic HTML used (`<nav>`, `<main>`, `<article>`, `<button>`)
- [ ] ARIA roles only added when semantic HTML insufficient
- [ ] ARIA labels describe purpose clearly
- [ ] ARIA states updated dynamically (`aria-expanded`, `aria-busy`)
- [ ] Live regions used for dynamic content (`aria-live`, `role="status"`)

### Motion & Animation
- [ ] Animations respect `prefers-reduced-motion`
- [ ] No auto-playing video/audio without controls
- [ ] Parallax/motion effects can be disabled
- [ ] Flashing content stays under 3 flashes per second (avoid seizures)

## Testing Process

### Automated Testing

**Tools:**
- **axe DevTools** (browser extension): Catches 30-50% of issues
- **Lighthouse** (Chrome DevTools): Accessibility audit
- **WAVE** (WebAIM): Visual feedback on accessibility

**Run automated tests regularly:**
```bash
# Lighthouse CI
npm run lighthouse

# axe-core integration
npm run test:a11y
```

### Manual Testing

**Keyboard Navigation:**
1. Tab through all interactive elements
2. Verify focus indicators are visible
3. Test Enter/Space activation on buttons
4. Ensure no keyboard traps
5. Check tab order follows visual order

**Screen Reader Testing:**
- **macOS**: VoiceOver (Cmd+F5)
- **Windows**: NVDA (free) or JAWS
- **Mobile**: TalkBack (Android), VoiceOver (iOS)

**Test scenarios:**
1. Navigate by headings (VoiceOver: Cmd+Option+H)
2. Navigate by landmarks (VoiceOver: Cmd+Option+U)
3. Read through forms
4. Interact with custom controls
5. Listen for clear, descriptive labels

**Visual Testing:**
1. Zoom to 200% (Cmd/Ctrl + +)
2. Enable high contrast mode (Windows: Alt+Shift+PrtScn)
3. Test with color blindness simulator
4. Enable `prefers-reduced-motion`

### Responsive Testing
- Test on actual mobile devices (not just DevTools)
- Verify touch targets are large enough
- Check text readability at default mobile zoom
- Ensure no horizontal scrolling at 320px width

## Common Accessibility Anti-Patterns

### ❌ Things to NEVER Do

**Remove focus outlines without replacement:**
```css
/* ❌ NEVER DO THIS */
*:focus {
  outline: none;
}
```

**Click handler on non-interactive element:**
```tsx
/* ❌ BAD */
<div onClick={handleClick}>Click me</div>

/* ✅ GOOD */
<button onClick={handleClick}>Click me</button>
```

**Color-only indicators:**
```tsx
/* ❌ BAD: Only color shows error */
<input className={hasError ? "border-red-500" : "border-gray-300"} />

/* ✅ GOOD: Color + icon + text */
<div>
  <input
    className={hasError ? "border-destructive" : "border-border"}
    aria-invalid={hasError}
    aria-describedby="error-msg"
  />
  {hasError && (
    <p id="error-msg" className="text-destructive flex items-center gap-1">
      <AlertIcon /> Error message here
    </p>
  )}
</div>
```

**Placeholder as label:**
```tsx
/* ❌ BAD: Placeholder disappears on focus */
<input placeholder="Email address" />

/* ✅ GOOD: Persistent label */
<label htmlFor="email">Email address</label>
<input id="email" placeholder="you@example.com" />
```

**Low contrast "subtle" text:**
```tsx
/* ❌ BAD: Insufficient contrast */
<p className="text-gray-400">  {/* Might be 2.5:1 */}
  Important information
</p>

/* ✅ GOOD: Sufficient contrast */
<p className="text-muted-foreground">  {/* 4.5:1+ */}
  Important information
</p>
```

## Integration with Design System

**Crate-specific accessibility:**
- Primary orange (#FF6B35) on dark background: **5.2:1 ✓**
- Foreground (#F8F8F8) on background (#1A1A1A): **14.8:1 ✓**
- Accent teal (#00B8A9) on dark background: **4.1:1 ✓** (use for large text or increase for normal)
- All interactive elements use 44x44px touch targets ✓
- Focus rings use primary orange (5.2:1 contrast) ✓
- Animations respect `prefers-reduced-motion` ✓

## Resources

**Official Standards:**
- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) - Quick reference guide
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) - ARIA patterns and examples

**Testing Tools:**
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)

**Learning:**
- [A11y Project](https://www.a11yproject.com/) - Accessibility resources
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility) - Comprehensive guides

## Success Criteria

A component meets WCAG 2.2 AA when:
- ✅ All text meets 4.5:1 contrast (normal) or 3:1 (large)
- ✅ All UI components meet 3:1 contrast
- ✅ All functionality is keyboard accessible
- ✅ Focus indicators are clearly visible (3:1, 2px)
- ✅ Touch targets are 44x44px minimum
- ✅ Form inputs have labels/instructions
- ✅ Errors are clearly identified
- ✅ Images have descriptive alt text
- ✅ Semantic HTML used appropriately
- ✅ ARIA roles/labels added when needed
- ✅ Motion respects `prefers-reduced-motion`
- ✅ Layout supports 200% zoom
- ✅ No automated test failures (axe, Lighthouse)
