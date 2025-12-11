# UX Design: Streaming Narrative Insights ("Living Liner Notes")

**Status:** V3 (Final Approved Specification)
**Date:** 2025-05-15
**Role:** Product Design Lead

## 1. Philosophy: The "Superpowered Crate Digger"

Our goal is to **reveal the stories** hidden in the archive. The UI must reflect the **excitement of discovery** while maintaining a **calm, music-first** experience.

## 2. The Interaction Model: "Calm Discovery"

We adhere to a **Unified Feed** model. There are no separate "Link Cards" or "Comment Bubbles". All context—whether from a DJ, the AI, or the web—is delivered through the Insight Stream.

### The "Spectrum Notch" (The Indicator)
Instead of a noisy icon, we use a sleek, minimal indicator on the edge of the card.

*   **Location:** Right edge of the `PlayCard` (absolute positioned, full height or pill-shaped).
*   **Width:** ~4px to 6px.
*   **States:**
    1.  **Digging (Pending):**
        *   *Visual:* A subtle, pulsing Gray/Muted bar. Low opacity.
        *   *Animation:* `opacity-50` <-> `opacity-80` pulse.
    2.  **Discovery (Ready):**
        *   *Visual:* The bar lights up to the **Accent Color** (Teal/Gold) or a "Multicolor Spectrum" gradient.
        *   *Animation:* A "shimmer" effect runs down the bar once, then it glows steadily.
    3.  **Expanded (Active):**
        *   *Visual:* The bar remains visible (anchoring the content) or expands to border the panel.

### Interaction
*   **Trigger:** User clicks the Card (or specifically the Notch area).
*   **Reveal:** The card expands. The Notch serves as the visual anchor connecting the track to its story.

## 3. The Unified Content Experience

**Everything is an Insight.**
When the card expands, the user sees a single, coherent narrative flow:

1.  **The "Star" Insight:** Usually the DJ's comment (if available) or the most "Juicy" AI discovery.
2.  **The Context:** Deeper history, connections, or trivia (AI generated).
3.  **The Evidence:** Links (Spotify, YouTube, Articles) are rendered as *attachments* or *inline chips* within the narrative, not as clunky standalone previews.

*   *Deprecated:* Standalone `FeaturedLinkPreview` and `CommentWithLinks` components will be removed/merged into this unified `InsightPanel`.

## 4. Visual Specs

### Spectrum Notch
```css
.spectrum-notch {
  position: absolute;
  right: 0;
  top: 10%;
  bottom: 10%;
  width: 4px;
  border-radius: 4px 0 0 4px;
  transition: all 0.5s ease;
}

.spectrum-notch[data-state="digging"] {
  background: var(--muted);
  animation: pulse 2s infinite;
}

.spectrum-notch[data-state="ready"] {
  background: linear-gradient(180deg, var(--accent), var(--primary));
  box-shadow: 0 0 8px var(--accent-alpha);
}
```

### Stream Behavior
*   **No Typing:** Text appears in **semantic blocks** (sentences or paragraphs) as they complete.
*   **Fade In:** Blocks fade in with a slight upward slide (`y-2` -> `y-0`, `opacity-0` -> `opacity-100`).

## 5. Technical Implementation Strategy

### Effect-TS Architecture
*   **Data Source:** `Stream.fromEffect(fetchInsights(playId))`
*   **State Machine:**
    *   `Idle` -> `Digging` -> `Ready(Data)` or `Empty`
*   **Error Handling:** "Fail Quietly". If the stream fails, the Notch simply fades out. No error toasts.

### Components
*   `InsightNotch`: The visual indicator.
*   `InsightPanel`: The unified container for content.
*   `InsightStream`: The logical controller connecting the Atom to the UI.
