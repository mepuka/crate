# Streaming Insights Implementation Plan

## Status: Complete ✅

## Overview
This plan outlines the steps to implement the "Streaming Insights" (Living Liner Notes) feature as defined in `STREAMING_INSIGHTS_IMPLEMENTATION_SPEC.md`.

## Phase 1: Domain & Infrastructure (Foundation)
**Goal:** Establish the data models, API client, and state management.

1.  **Define Domain Models** ✅
    -   **File:** `packages/domain/src/insights.ts`
    -   **Task:** Create schema definitions for `Insight`, `ArtistRef`, `RecordingRef`, etc., using `@effect/schema`.

2.  **Update Runtime** ✅
    -   **File:** `packages/web/src/lib/http-runtime.ts`
    -   **Task:** Define `InsightsClient` extending `AtomHttpApi` and add it to `TimelineRuntime`.

3.  **Create State Management (Atoms)** ✅
    -   **File:** `packages/web/src/atoms/insights.ts`
    -   **Task:** Implement `insightsAtom` (with loading states) and `notchStateAtom` (derived state for UI).
    -   **Task:** Implement `fetchInsightsAction` with the "Fail Quietly" logic.

## Phase 2: UI Components (Visuals)
**Goal:** Build the visual elements for the insights.

4.  **Create Components** ✅
    -   `packages/web/src/components/insights/InsightNotch.tsx`: The vertical indicator bar.
    -   `packages/web/src/components/insights/InsightBlock.tsx`: Polymorphic component for different insight types.
    -   `packages/web/src/components/insights/InsightStream.tsx`: The list/stream of insights with stagger animation.
    -   `packages/web/src/components/insights/InsightPanel.tsx`: The container component that fetches data.

## Phase 3: Integration & Cleanup
**Goal:** Replace existing widgets with the new system.

5.  **Update `PlayCard.tsx`** ✅
    -   **File:** `packages/web/src/components/PlayCard.tsx`
    -   **Task:**
        -   Import `InsightNotch` and `InsightPanel`.
        -   Add `InsightNotch` to the card layout (absolute right).
        -   Replace `FeaturedLinkPreview` with `InsightPanel`.

6.  **Cleanup** ✅
    -   **Task:** Remove `FeaturedLinkPreview.tsx` and `CommentWithLinks.tsx` (if unused).
    -   **Update:** Also updated `PlayDetailsPanel.tsx` to use `InsightPanel`.
