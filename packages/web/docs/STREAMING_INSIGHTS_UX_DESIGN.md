# Streaming Narrative Insights: UX/UI Design Specification

**Status:** Draft
**Target Audience:** Product Design, Frontend Engineering
**Objective:** Define the visual and interactive experience for "Streaming Insights" – delivering rich, narrative context to KEXP plays without overwhelming the user or disrupting the timeline flow.

## 1. Core Philosophy: "Calm Discovery"

We are moving away from the "Chatbot" paradigm (token-streaming text that demands attention) toward a "Liner Notes" paradigm (rich content that waits to be discovered).

*   **No Distraction:** The timeline must remain a calm stream of music. Insights are additives, not interruptions.
*   **The "Juicy Token":** Use subtle but rewarding visual cues (icons, badges) to signal that hidden value exists.
*   **Reward Curiosity:** Clicking the token provides the dopamine hit of a "superpowered crate digger" story.

## 2. Visual Component: The Insight Indicator ("The Token")

A new visual element will be introduced to the `PlayCard` component, positioned in the **top-right corner** (near or replacing the relative time, or floating just below it).

### 2.1. Anatomy
The indicator consists of:
1.  **Icon:** Representing the *type* of insight available.
2.  **Motion:** A subtle entrance animation to signal arrival.
3.  **State:** Distinct visual styles for Unread vs. Read.

### 2.2. Insight Types & Icons
We will categorize insights to give users a hint of what they are about to read:

| Insight Type | Icon Concept | Color (Semantic) | Meaning |
| :--- | :--- | :--- | :--- |
| **Narrative** | 📖 (Open Book) or 🖊️ (Quill) | `text-primary` | Deep history, context, or story behind the track. |
| **Connection** | 🔗 (Link/Chain) or ⚡ (Spark) | `text-accent` | "This artist played with X," "Sampled by Y." |
| **Debut/Fresh** | ✨ (Sparkles) or 🌱 (Sprout) | `text-green-400` | First time on KEXP, brand new release. |
| **Local** | 📍 (Pin) or 🌲 (Tree) | `text-blue-400` | Seattle/PNW connection. |

### 2.3. States

| State | Visual Treatment | Animation |
| :--- | :--- | :--- |
| **Incoming (Streaming)** | Low opacity, slight shimmer. | `opacity-0` -> `opacity-100` (duration: 1.5s, ease-out). No nervous typing. |
| **Unread (New)** | Solid fill, "Juicy" glow or subtle pulse. | `animate-pulse-slow` (very subtle, breathing effect). |
| **Read (Viewed)** | Outlined or dimmed opacity. | Static. |

## 3. Interaction Design

### 3.1. The "Arrival" Physics
When the LLM finishes generating an insight (asynchronously):
1.  **Do not** auto-expand the card.
2.  **Do not** scroll the timeline.
3.  **Action:** The "Insight Indicator" fades in smoothly on the relevant card.
    *   *Effect:* Like a notification light silently turning on.
    *   *Sound:* None (unless user opts in, but default to silent).

### 3.2. Click-to-Reveal
*   **Trigger:** User clicks the `PlayCard` (standard behavior) or specifically the Indicator.
*   **Action:** The card enters `expanded` or `selected` state (depending on device/view).
*   **Transition:** The Insight text does not "type out." It **fades in** as a complete block or paragraph-by-paragraph.
    *   *Why:* Reading is faster than generating. We avoid the "waiting for the robot to speak" friction.

### 3.3. The "Live" Exception (Auto-Populate)
*   **Scenario:** The user has the **current/latest** play selected and expanded (Active Listening Mode).
*   **Behavior:** In this specific case, as the insight streams in, we **do** show it appearing.
*   **Animation:** Use a "Fade Up" effect for appended paragraphs.
    *   *Text:* "Generating liner notes..." (subtle italic) -> Fades into the final text.
    *   *Reasoning:* The user is actively staring at the "Now Playing" card, so immediate updates are expected and rewarding.

## 4. Component Architecture Updates

### 4.1. `PlayCard.tsx` Modification
We need to insert the `InsightBadge` component into the flex layout.

```tsx
// Draft Structure for Top-Right Area
<div className="flex flex-col items-end gap-1">
  <time className="timestamp ...">{formattedTime}</time>

  {/* The Juicy Token */}
  <AnimatePresence>
    {hasInsight && (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="badge-container"
      >
        <InsightBadge type={insightType} isRead={isRead} />
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

### 4.2. `InsightBadge` Component
A small atom that encapsulates the icon and the "read" state logic.

### 4.3. `NarrativeInsight` Component (The Content)
To be used inside the `expanded` view of `PlayCard` or the Detail Panel.
*   **Typography:** Serif or comfortable Sans-Serif (distinct from metadata).
*   **Layout:** "Liner Note" style – maybe a slight paper texture background or distinct border to separate it from raw data.

## 5. Mobile Considerations
*   **Space:** On mobile, the "Juicy Token" might need to be smaller (just a dot?) or replace the timestamp temporarily.
*   **Interaction:** Tapping the token should open the standard Detail View/Drawer.

## 6. Future "Crate" Features
*   **Collection:** "Save this Insight" – since these are stories, users might want to keep them.
*   **Feedback:** "Was this interesting?" (Thumbs up/down) to train the Crate Digger agent.
