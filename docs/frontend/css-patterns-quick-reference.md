# CSS Patterns Quick Reference

Quick implementation guide for the advanced CSS patterns researched for Crate frontend.

---

## 1. Glassmorphism (Frosted Glass)

**When to use**: Modals, overlays, floating panels, tooltips

```css
.glass-surface {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

/* Dark variant */
.glass-surface--dark {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

**Browser support**: ✅ All modern browsers (2025)

---

## 2. Container Queries

**When to use**: Components that need to adapt to their container size

```css
.play-card {
  container-type: inline-size;
  container-name: playcard;
}

/* Compact layout */
@container playcard (max-width: 300px) {
  .play-card__artwork {
    width: 100%;
  }
  .play-card__info {
    padding: 12px;
  }
}

/* Expanded layout */
@container playcard (min-width: 400px) {
  .play-card {
    display: grid;
    grid-template-columns: 150px 1fr;
  }
}
```

**Browser support**: ✅ Chrome 105+, Safari 16+, Firefox 110+

---

## 3. Scroll-Driven Animations

**When to use**: Fade-in effects, parallax, scroll progress indicators

```css
/* Fade in as element enters viewport */
.play-card {
  animation: fade-in-up linear;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scroll progress bar */
@keyframes grow-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.scroll-progress {
  animation: grow-progress linear;
  animation-timeline: scroll(root);
  transform-origin: left;
}
```

**Browser support**: ✅ Chrome 115+, Edge 115+ (Firefox/Safari experimental)

---

## 4. CSS @property (Animatable Custom Properties)

**When to use**: Animating gradients, custom numeric values

```css
@property --gradient-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.animated-gradient {
  background: linear-gradient(
    var(--gradient-angle),
    #60a5fa,
    #a78bfa
  );
  transition: --gradient-angle 0.5s ease;
}

.animated-gradient:hover {
  --gradient-angle: 180deg;
}
```

**Numeric values**:
```css
@property --progress {
  syntax: '<percentage>';
  initial-value: 0%;
  inherits: false;
}

.progress-bar {
  width: var(--progress);
  transition: --progress 0.3s ease-out;
}
```

**Browser support**: ✅ Chrome 85+, Edge 85+, Safari 15.4+

---

## 5. :has() Relational Styling

**When to use**: Parent/sibling styling based on child state

```css
/* Parent changes when child is active */
.timeline:has(.play-marker--active) {
  --glow-color: var(--color-accent);
}

/* Card with image vs. without */
.play-card:has(img) {
  grid-template-columns: auto 1fr;
}

.play-card:not(:has(img)) {
  padding-left: 16px;
}

/* Form validation */
.form-group:has(input:invalid) {
  border-color: red;
}

.form-group:has(input:valid) {
  border-color: green;
}
```

**Browser support**: ✅ Chrome 105+, Safari 15.4+, Firefox 121+

---

## 6. Mesh Gradients

**When to use**: Ambient backgrounds, hero sections

```css
.mesh-background {
  background:
    radial-gradient(at 0% 0%, hsla(253, 70%, 50%, 0.2) 0px, transparent 50%),
    radial-gradient(at 50% 50%, hsla(180, 70%, 50%, 0.2) 0px, transparent 50%),
    radial-gradient(at 100% 100%, hsla(300, 70%, 50%, 0.2) 0px, transparent 50%);
  animation: meshMove 20s ease-in-out infinite;
}

@keyframes meshMove {
  0%, 100% {
    background-position: 0% 0%, 50% 50%, 100% 100%;
  }
  50% {
    background-position: 100% 100%, 50% 50%, 0% 0%;
  }
}
```

**Static variant** (better performance):
```css
.mesh-background--static {
  background:
    radial-gradient(at 27% 37%, hsla(215, 98%, 61%, 0.12) 0px, transparent 50%),
    radial-gradient(at 97% 21%, hsla(125, 98%, 72%, 0.12) 0px, transparent 50%),
    radial-gradient(at 52% 99%, hsla(354, 98%, 61%, 0.12) 0px, transparent 50%);
}
```

---

## 7. View Transitions API

**When to use**: Page/state transitions, shared element animations

```css
/* Enable automatic transitions */
@view-transition {
  navigation: auto;
}

/* Customize specific elements */
.play-detail {
  view-transition-name: play-detail;
}

::view-transition-old(play-detail),
::view-transition-new(play-detail) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

**JavaScript trigger**:
```typescript
// Wrap state change in view transition
document.startViewTransition(() => {
  // Update DOM
  updatePlayDetail(newPlay)
})
```

**Browser support**: ✅ Chrome 111+, Edge 111+ (Firefox/Safari experimental)

---

## 8. Micro-Interactions

**When to use**: Buttons, checkboxes, toggles, focus states

```css
/* Button press */
.button {
  transition: transform 0.1s cubic-bezier(0.4, 0, 0.6, 1);
}

.button:active {
  transform: scale(0.97);
}

/* Focus ring */
.button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Checkbox animation */
.checkbox {
  appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid currentColor;
  border-radius: 4px;
  position: relative;
  transition: all 0.2s;
}

.checkbox:checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.checkbox:checked::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  animation: checkPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes checkPop {
  0% { transform: scale(0); }
  100% { transform: scale(1); }
}
```

---

## 9. Design Tokens with CSS Variables

**When to use**: Consistent theming, dynamic color schemes

```css
:root {
  /* Color system (HSL components) */
  --color-accent-h: 220;
  --color-accent-s: 80%;
  --color-accent-l: 55%;

  /* Derived colors */
  --color-accent: hsl(var(--color-accent-h) var(--color-accent-s) var(--color-accent-l));
  --color-accent-hover: hsl(var(--color-accent-h) var(--color-accent-s) calc(var(--color-accent-l) + 10%));
  --color-accent-alpha-10: hsl(var(--color-accent-h) var(--color-accent-s) var(--color-accent-l) / 0.1);

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
}

/* Dark theme override */
[data-theme="dark"] {
  --color-accent-l: 65%; /* Lighter accent for dark mode */
}
```

---

## 10. Performance-Optimized Animations

**When to use**: Always! Only animate compositor properties

```css
/* ✅ GOOD - Compositor only (60fps) */
.element {
  transform: translateY(10px);
  opacity: 0.5;
  transition: transform 0.3s, opacity 0.3s;
}

/* ❌ BAD - Triggers layout (jank) */
.element {
  top: 10px;
  width: 100px;
  transition: top 0.3s, width 0.3s;
}

/* Use will-change ONLY during animation */
.element:hover {
  will-change: transform;
}

.element:not(:hover) {
  will-change: auto; /* Remove when done */
}
```

**Safe to animate**:
- `transform` (translate, rotate, scale)
- `opacity`
- `filter` (with caution)
- `backdrop-filter` (with caution)

**Avoid animating**:
- `width`, `height`
- `top`, `left`, `right`, `bottom`
- `margin`, `padding`
- `border-width`

---

## 11. Accessibility Patterns

**When to use**: Always!

```css
/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Focus visible (keyboard only) */
.button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Skip to content */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-accent);
  color: white;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

---

## Integration with Effect Atoms

```typescript
import { atom } from 'jotai'
import { Effect } from 'effect'

// Define reactive atoms
const themeAtom = atom<'light' | 'dark'>('dark')
const accentColorAtom = atom({ h: 220, s: 80, l: 55 })

// Effect to update CSS variables
const updateThemeVariables = (theme: typeof themeAtom.Type) =>
  Effect.sync(() => {
    document.documentElement.setAttribute('data-theme', theme)
  })

const updateAccentColor = (color: { h: number, s: number, l: number }) =>
  Effect.sync(() => {
    document.documentElement.style.setProperty('--color-accent-h', `${color.h}`)
    document.documentElement.style.setProperty('--color-accent-s', `${color.s}%`)
    document.documentElement.style.setProperty('--color-accent-l', `${color.l}%`)
  })

// React hook
function useTheme() {
  const [theme, setTheme] = useAtom(themeAtom)

  useEffect(() => {
    Effect.runSync(updateThemeVariables(theme))
  }, [theme])

  return [theme, setTheme] as const
}
```

---

## Browser Support Summary (2025)

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| Container Queries | ✅ 105+ | ✅ 16+ | ✅ 110+ | ✅ 105+ |
| :has() | ✅ 105+ | ✅ 15.4+ | ✅ 121+ | ✅ 105+ |
| @property | ✅ 85+ | ✅ 15.4+ | ❌ | ✅ 85+ |
| Scroll-Driven Animations | ✅ 115+ | 🔬 Experimental | 🔬 Experimental | ✅ 115+ |
| View Transitions | ✅ 111+ | 🔬 Experimental | 🔬 Experimental | ✅ 111+ |
| backdrop-filter | ✅ 76+ | ✅ 9+ | ✅ 103+ | ✅ 79+ |

✅ = Full support | 🔬 = Experimental/Flag required | ❌ = Not supported

---

## Resources

- [MDN Web Docs](https://developer.mozilla.org/)
- [Can I Use](https://caniuse.com/)
- [CSS Tricks](https://css-tricks.com/)
- [Web.dev](https://web.dev/)
- [Effect Documentation](https://effect.website/)
