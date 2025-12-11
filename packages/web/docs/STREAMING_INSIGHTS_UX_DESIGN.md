# Streaming Narrative Insights: UX/UI Design Specification (V2)

**Status:** Draft V2
**Target Audience:** Product Design, Frontend Engineering
**Objective:** Define the visual and interactive experience for "Streaming Insights" – delivering rich, narrative context to KEXP plays.
**Changes V2:** Removed icons, introduced "Spectrum Notch" visual, added Atom state spec, detailed Multi-Insight layout.

## 1. Core Philosophy: "Calm Discovery"

We are moving away from the "Chatbot" paradigm (token-streaming text) toward a "Liner Notes" paradigm.
*   **No Distraction:** The timeline must remain a calm stream of music.
*   **Visually Striking but Clean:** Use abstract data-visualization elements ("Notches") instead of generic icons.
*   **Reward Curiosity:** The "Spectrum Notch" signals hidden depth.

## 2. Visual Component: The "Spectrum Notch"

Instead of an icon, we use a **vertical color bar** (notch) on the right edge of the `PlayCard`. This evokes the spine of a record or a spectrum analyzer level.

### 2.1. Anatomy
*   **Position:** Absolute right edge of the card, full height or partial height (pill shape).
*   **Width:** Thin (4px) in default state, expands (6px + glow) on hover.
*   **Color:** Semantic color based on the *primary* insight type available.
*   **Texture:** Subtle vertical gradient to give it a "glowing tube" feel.

### 2.2. Semantic Colors

| Insight Type | Notch Color | CSS Variable | Meaning |
| :--- | :--- | :--- | :--- |
| **Narrative** | Deep Amber | `--insight-narrative` | Deep history, context, story. |
| **Connection** | Electric Purple | `--insight-connection` | Artist connections, samples. |
| **Debut/Fresh** | Neon Green | `--insight-debut` | First time on KEXP. |
| **Local** | Seattle Rain Blue | `--insight-local` | PNW connection. |

### 2.3. States & Animation

| State | Visual Treatment | Animation |
| :--- | :--- | :--- |
| **Incoming** | Low opacity fade-in. | `opacity-0` -> `opacity-100` (1.5s ease). |
| **Unread (New)** | Solid color + "Breathing" Glow. | `box-shadow` pulse every 4s. |
| **Read (Viewed)** | Dimmed opacity (30%), no glow. | Static. |

*Visual Field Theory:* When scrolling the timeline, a cluster of plays with insights will show a "rhythm" of colored notches on the right, creating a visual texture that highlights rich segments of history without cluttering the text area.

## 3. Interaction Design

### 3.1. Click-to-Reveal
*   **Trigger:** User clicks the `PlayCard`.
*   **Action:** Card expands.
*   **State Change:** The specific insight(s) for that play are marked as **Read**. The Notch dims immediately to provide feedback.

### 3.2. "Live" Auto-Populate
*   **Scenario:** User has the latest play expanded.
*   **Behavior:** New insights fade in via a "Slide Up" animation at the bottom of the insight stack.

## 4. Multi-Insight Layout (The "Liner Notes" Deck)

Since a play can have multiple insights (e.g., a "Local" badge AND a "Narrative" story), the Expanded View must handle them gracefully.

### 4.1. The Stacked Layout (Expanded Card)
Inside the expanded `PlayCard`, insights are rendered as a **vertical stack of cards** below the metadata.

```
[ Album Art ]  [ Title / Artist / Metadata ]
               [ ......................... ]

[ Insight Card: Narrative (Amber Border) ]
  "This track was written in a basement in Wallingford..."

[ Insight Card: Connection (Purple Border) ]
  "Sampled by Daft Punk in 2001..."
```

*   **Design:** Each insight is a distinct block with a subtle left-border matching its type color.
*   **Ordering:** Narrative (Long form) first, followed by shorter snippets (Connections).

## 5. State Management (Effect-TS Atoms)

We need to persist which insights have been "seen" by the user so the "Notch" can dim.

### 5.1. `insightReadState.ts`

```typescript
import { Atom } from "@effect-atom/atom-react";
import { Effect, Schema } from "effect";

// Schema: Map of PlayID -> Timestamp (when it was read)
// We use a Map to prevent O(n) lookups.
interface ReadState {
  readonly [playId: number]: number; // timestamp
}

// Persist to localStorage
const STORAGE_KEY = "kexp_crate_read_insights";

export const readInsightsAtom = Atom.make<ReadState>(() => {
    // Initial load from localStorage
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
});

// Action: Mark play as read
export const markPlayAsRead = (playId: number) => Atom.update(readInsightsAtom, (state) => {
    const newState = { ...state, [playId]: Date.now() };
    // Side effect: persist (could be done via effect subscription ideally)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    return newState;
});

// Selector: Is play read?
export const isPlayReadAtom = (playId: number) => Atom.make((get) => {
    const state = get(readInsightsAtom);
    return !!state[playId];
});
```

## 6. Mobile Considerations

*   **Notch:** On mobile, the right-edge notch might be too subtle or off-screen.
    *   *Adaptation:* Move the notch to the **Left** edge (next to album art) or make it a background gradient on the card itself (very subtle).
*   **Stack:** Vertical stack works perfectly on mobile.

## 7. Implementation Checklist

1.  **Atom:** Create `packages/web/src/atoms/insight-state.ts`.
2.  **Component:** Create `packages/web/src/components/InsightNotch.tsx`.
3.  **Component:** Update `PlayCard.tsx` to include the Notch and the `InsightStack` in expanded view.
4.  **Styles:** Add the semantic colors (`--insight-narrative`, etc.) to Tailwind config or CSS variables.
