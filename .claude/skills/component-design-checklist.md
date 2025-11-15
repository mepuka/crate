---
name: component-design-checklist
description: Comprehensive checklist for creating UI components with accessibility, responsiveness, states, performance, and documentation
---

# Component Design Checklist

## Purpose

This skill provides a comprehensive checklist for creating or modifying UI components. Use this skill to ensure components are complete, accessible, responsive, performant, and well-documented.

## Pre-Design Phase

Before writing code, define:

- [ ] **Component purpose** - What problem does this solve?
- [ ] **User stories** - Who uses this and why?
- [ ] **API surface** - What props/configuration does it need?
- [ ] **Variants** - What visual/behavioral variations exist?
- [ ] **Composition** - Does it contain other components?
- [ ] **Dependencies** - What libraries/components does it require?

## Accessibility (WCAG 2.2 AA)

### Keyboard Navigation
- [ ] Component is fully keyboard accessible (Tab, Enter, Space, Escape, Arrows)
- [ ] Tab order follows logical/visual flow
- [ ] No keyboard traps (user can always navigate away)
- [ ] Custom controls handle all expected keyboard events
- [ ] Keyboard shortcuts don't conflict with browser/screen reader shortcuts

### Focus Management
- [ ] Focus indicator is clearly visible (2px minimum, 3:1 contrast)
- [ ] Focus moves logically when elements appear/disappear
- [ ] Initial focus set appropriately when component opens
- [ ] Focus returns to trigger when component closes (modals, dropdowns)
- [ ] Focus trap implemented for modals/dialogs (Escape to close)

### Semantic HTML & ARIA
- [ ] Semantic HTML used where possible (`<button>`, `<nav>`, `<article>`, etc.)
- [ ] ARIA roles added only when semantic HTML insufficient
- [ ] `role` attribute matches component behavior
- [ ] `aria-label` or `aria-labelledby` provides accessible name
- [ ] `aria-describedby` links to additional context/instructions
- [ ] Dynamic states reflected in ARIA (`aria-expanded`, `aria-selected`, `aria-checked`)
- [ ] `aria-live` regions used for dynamic content updates
- [ ] `aria-hidden="true"` on purely decorative elements

### Visual Accessibility
- [ ] Color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large/UI)
- [ ] Meaning not conveyed by color alone (use icons, text, patterns)
- [ ] Component works in high contrast mode
- [ ] Component works with 200% browser zoom
- [ ] Text spacing adjustments don't break layout (line-height 1.5+)
- [ ] Color blindness considered (tested with simulator)

### Content & Labels
- [ ] All interactive elements have accessible names
- [ ] Labels are clear and descriptive (not just "Button" or "Click here")
- [ ] Error messages are programmatically associated with inputs
- [ ] Instructions provided for complex interactions
- [ ] Image alternatives provided (`alt` text or `aria-label`)

### Touch & Motor
- [ ] Touch targets are minimum 44x44px
- [ ] Adequate spacing between interactive elements
- [ ] No precise positioning required (large click areas)
- [ ] Works with voice control (clear labels, standard controls)
- [ ] No timeout-dependent interactions (or timeout is configurable)

## Responsive Design

### Breakpoints
- [ ] Mobile (< 640px) - Single column, stacked layout
- [ ] Tablet (640px - 1024px) - Adaptive layout
- [ ] Desktop (> 1024px) - Full layout
- [ ] Component tested at all breakpoints
- [ ] No horizontal scrolling at 320px width

### Touch vs Mouse
- [ ] Touch targets larger on touch devices (44x44px vs 32x32px)
- [ ] Hover states have touch equivalents (tap to reveal)
- [ ] No hover-only content (inaccessible on touch)
- [ ] Long-press actions have alternatives
- [ ] Pinch-zoom supported where appropriate

### Performance on Mobile
- [ ] Backdrop filters reduced/removed on mobile (CPU intensive)
- [ ] Images optimized for mobile (smaller sizes, lazy loading)
- [ ] Animations simplified on mobile (or disabled)
- [ ] Font subsetting for faster load (if using custom fonts)

## Component States

### Visual States
- [ ] **Default** - Initial appearance
- [ ] **Hover** - Mouse over (desktop only)
- [ ] **Focus** - Keyboard focus indicator
- [ ] **Active** - Being clicked/pressed
- [ ] **Disabled** - Non-interactive state
- [ ] **Loading** - Async operation in progress
- [ ] **Error** - Error state with message
- [ ] **Success** - Successful state
- [ ] **Empty** - No content/data state

### Interactive States (if applicable)
- [ ] **Selected** - Item is selected (lists, tabs, radio)
- [ ] **Expanded/Collapsed** - Accordion, dropdown states
- [ ] **Checked/Unchecked** - Checkbox, toggle states
- [ ] **Read/Unread** - Notification, message states
- [ ] **Valid/Invalid** - Form input validation states

### Aria State Updates
- [ ] `aria-expanded` updated when content expands/collapses
- [ ] `aria-selected` updated when selection changes
- [ ] `aria-checked` updated for checkboxes/switches
- [ ] `aria-busy` set during loading
- [ ] `aria-invalid` set for form errors
- [ ] `aria-pressed` updated for toggle buttons

## Design System Integration

### Crate Design System
- [ ] Typography uses design system fonts (Space Grotesk, IBM Plex Sans/Mono)
- [ ] Colors use HSL custom properties (`hsl(var(--primary))`)
- [ ] Spacing follows 8px base scale (`p-3`, `gap-6`, etc.)
- [ ] Animations match design system patterns (broadcast pulse, staggered reveal)
- [ ] Component matches "late-night radio" aesthetic
- [ ] Glassmorphism uses four-layer backdrop system (if applicable)

### Tokens & Variables
- [ ] Font sizes use design system scale (`var(--font-song-title)`)
- [ ] Font weights use design system values (`var(--weight-display)`)
- [ ] Colors use semantic tokens (`--primary`, `--accent`, `--muted`)
- [ ] Border radius uses design system values (`rounded-lg`, `rounded-2xl`)
- [ ] Shadows use design system values (`shadow-xl`, `shadow-2xl`)

## Animation & Motion

### Animation Guidelines
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Duration appropriate for context (150ms hover, 300ms transition, 600ms sequence)
- [ ] Easing appropriate (`ease-out` entrance, `ease-in-out` transition)
- [ ] GPU-accelerated properties used (`transform`, `opacity`)
- [ ] No layout thrashing (avoid animating `width`, `height`, `margin`)

### Motion Patterns
- [ ] Entrance animations (fade in, slide in)
- [ ] Exit animations (fade out, slide out)
- [ ] Transition animations (state changes)
- [ ] Hover animations (subtle scale, glow)
- [ ] Focus animations (ring appearance)
- [ ] Loading animations (spinner, skeleton, pulse)

### Performance
- [ ] `will-change` used sparingly (removes when animation completes)
- [ ] Animations debounced/throttled where needed
- [ ] No excessive repaints (check DevTools Performance)
- [ ] Compositing layers optimized (check DevTools Layers)

## Variants & Composition

### Size Variants
- [ ] **Compact** - Minimal padding, small text
- [ ] **Default** - Standard size
- [ ] **Large** - Increased padding, larger text

### Visual Variants
- [ ] **Default** - Standard appearance
- [ ] **Primary** - Emphasized (orange in Crate)
- [ ] **Secondary** - De-emphasized
- [ ] **Ghost** - Minimal/transparent
- [ ] **Outline** - Border only
- [ ] **Destructive** - Dangerous actions (red)

### Compositional Patterns
- [ ] Component accepts `children` if compositional
- [ ] Slots defined for complex components (header, body, footer)
- [ ] Compound components use context for coordination
- [ ] Component handles empty children gracefully

## Performance

### Rendering Performance
- [ ] Component uses React.memo for expensive renders
- [ ] Event handlers are memoized (useCallback)
- [ ] Computed values are memoized (useMemo)
- [ ] Large lists use virtualization (react-window, tanstack-virtual)
- [ ] Images use lazy loading (`loading="lazy"`)

### Bundle Size
- [ ] Dependencies are tree-shakeable
- [ ] Icons imported individually (not entire icon set)
- [ ] Heavy libraries lazy-loaded (dynamic import)
- [ ] Component doesn't duplicate existing components

### Runtime Performance
- [ ] No unnecessary re-renders (React DevTools Profiler)
- [ ] Debounced/throttled event handlers (scroll, resize, input)
- [ ] IntersectionObserver for visibility detection (not scroll events)
- [ ] RequestAnimationFrame for animations (not setTimeout)

## Error Handling

### User Errors
- [ ] Invalid input handled gracefully
- [ ] Clear error messages displayed
- [ ] Error state is accessible (aria-invalid, aria-describedby)
- [ ] User can recover from errors
- [ ] Validation errors shown near relevant inputs

### System Errors
- [ ] Network errors handled (try/catch, error boundaries)
- [ ] Loading states shown during async operations
- [ ] Timeout errors handled
- [ ] Fallback UI for critical failures
- [ ] Errors logged for debugging (console.error, monitoring)

### Edge Cases
- [ ] Empty state handled (no data)
- [ ] Loading state handled (fetching data)
- [ ] Error state handled (failed to load)
- [ ] Extremely long text handled (truncation, wrapping)
- [ ] Extremely large numbers handled (formatting)
- [ ] Missing images handled (placeholder)
- [ ] Null/undefined props handled (defaults)

## Documentation

### Code Documentation
- [ ] Component has TSDoc/JSDoc comment with description
- [ ] Props are documented with descriptions
- [ ] Complex logic has explanatory comments
- [ ] Examples provided for non-obvious usage

### Props Interface
- [ ] Props have TypeScript types
- [ ] Required vs optional props clearly defined
- [ ] Default values documented
- [ ] Prop constraints documented (min/max, allowed values)

### Usage Examples
- [ ] Basic usage example provided
- [ ] All variants demonstrated
- [ ] Common patterns documented
- [ ] Integration examples provided

### Storybook/Documentation Site
- [ ] Component added to Storybook (if used)
- [ ] All variants have stories
- [ ] Accessibility annotations included
- [ ] Controls/knobs configured for interactive testing

## Testing

### Unit Tests
- [ ] Component renders without errors
- [ ] Props are respected (variants, sizes, etc.)
- [ ] Event handlers are called correctly
- [ ] Conditional rendering works (states, variants)
- [ ] Edge cases are tested (empty, loading, error)

### Accessibility Tests
- [ ] axe-core tests pass (no violations)
- [ ] Keyboard navigation works (Tab, Enter, Space)
- [ ] Screen reader announcements tested
- [ ] Focus management tested (modals, dropdowns)
- [ ] Color contrast verified (WebAIM checker)

### Visual Regression Tests
- [ ] Component snapshot exists
- [ ] All variants captured
- [ ] Responsive breakpoints captured
- [ ] Dark mode captured (if applicable)

### Integration Tests
- [ ] Component works in context (with parent/sibling components)
- [ ] Data flow tested (props down, events up)
- [ ] Navigation tested (links, routing)
- [ ] Forms tested (submission, validation)

## Pre-Commit Checklist

Before committing component code:

- [ ] All automated tests pass
- [ ] TypeScript compiles without errors
- [ ] Linter passes (no warnings)
- [ ] Component builds successfully
- [ ] Manual testing completed (keyboard, screen reader, responsive)
- [ ] Accessibility checklist completed
- [ ] Performance acceptable (no obvious slowdowns)
- [ ] Documentation complete
- [ ] Code reviewed (self or peer)

## Component Template

Use this template as starting point:

```tsx
/**
 * ComponentName - Brief description
 *
 * Detailed description of what this component does, when to use it,
 * and any important considerations.
 *
 * @example
 * <ComponentName variant="primary" size="large">
 *   Content
 * </ComponentName>
 */

import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Define variants using cva
const componentVariants = cva(
  // Base classes (always applied)
  [
    "relative",
    "transition-colors duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  ],
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-accent text-accent-foreground",
      },
      size: {
        sm: "p-2 text-sm",
        md: "p-3 text-base",
        lg: "p-4 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

// Props interface with documentation
export interface ComponentNameProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof componentVariants> {
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Error message to display */
  error?: string;
}

// Use forwardRef for ref forwarding
export const ComponentName = forwardRef<HTMLDivElement, ComponentNameProps>(
  ({ variant, size, disabled, loading, error, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(componentVariants({ variant, size }), className)}
        role="region"
        aria-busy={loading}
        aria-disabled={disabled}
        {...props}
      >
        {loading && <LoadingSpinner />}
        {error && <ErrorMessage message={error} />}
        {!loading && !error && children}
      </div>
    );
  }
);

ComponentName.displayName = "ComponentName";
```

## Quick Reference

### Must-Have for Every Component

1. **Keyboard accessible** (Tab, Enter, Space, Escape)
2. **Focus visible** (2px ring, 3:1 contrast)
3. **Touch targets 44x44px**
4. **Text contrast 4.5:1** (normal) or 3:1 (large)
5. **Semantic HTML** (button, nav, article) or ARIA roles
6. **Accessible labels** (aria-label, aria-labelledby)
7. **Responsive** (mobile, tablet, desktop)
8. **All states** (default, hover, focus, active, disabled, loading, error)
9. **Reduced motion** support
10. **TypeScript types**
11. **Documentation**
12. **Tests** (unit, accessibility, visual)

## Common Pitfalls to Avoid

❌ **Focus outline removed** without replacement
❌ **Click handler on div** without keyboard support
❌ **Color-only indicators** (need icon/text too)
❌ **Low contrast text** (< 4.5:1)
❌ **Small touch targets** (< 44x44px)
❌ **Unlabeled inputs** (placeholder ≠ label)
❌ **Auto-playing animations** without reduced motion check
❌ **Missing error states**
❌ **No loading states**
❌ **Hardcoded colors/sizes** (use design tokens)
❌ **No mobile testing** (desktop-only development)
❌ **Missing TypeScript types**

## Integration with Other Skills

**Use alongside:**
- `frontend-design-foundations` - Design principles
- `crate-design-system` - Design system consistency
- `wcag-accessibility-compliance` - Detailed accessibility standards
- `music-ui-patterns` - Music-specific component patterns

## Success Criteria

A component is complete when:
- ✅ All checklist items marked complete
- ✅ Accessibility audit passes (axe, manual testing)
- ✅ Responsive at all breakpoints
- ✅ All states implemented and tested
- ✅ Performance acceptable (< 100ms interactions)
- ✅ Documentation complete
- ✅ Tests written and passing
- ✅ Code reviewed and approved
- ✅ Integrates with design system
- ✅ Works with keyboard, mouse, and touch
- ✅ Screen reader accessible
