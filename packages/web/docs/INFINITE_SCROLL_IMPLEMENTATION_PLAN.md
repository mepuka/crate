# Infinite Scroll Implementation Plan
**Status:** Ready for Implementation
**Date:** 2025-11-16
**Based On:** Design review documents from branch `claude/infinite-scroll-design-review-01AMtbhFvL6Bd6qrBaq6ckuN`

---

## Executive Summary

This plan synthesizes the comprehensive design review documents with our current implementation to deliver a production-ready infinite scroll timeline using Effect-TS patterns, pull-based pagination, and forward compatibility for SSE updates.

### Key Design Decisions (From Review)

1. **Hybrid Push-Pull Architecture** ✅ Already implemented via `FetchLatestLive` + pagination atoms
2. **Cursor-Based Pagination** ✅ Python API supports this (`/api/plays/timeline?cursor=...`)
3. **Dual-Cursor Model** ⚠️ Need to add gap detection
4. **Centralized State** ✅ `timelineInfiniteStateAtom` is single source of truth
5. **Effect Stream Integration** 🔄 Next step: Use `Stream.paginateEffect`

---

## Current Implementation Status

### ✅ Completed

1. **Atoms Layer** (`src/atoms/timeline-infinite.ts`)
   - `timelineInfiniteStateAtom` - Writable state atom (pages, cursors, status)
   - `loadInitialPageAtom` - Action atom for first page
   - `loadNextPageAtom` - Action atom for cursor pagination
   - `allLoadedPlayIdsAtom` - Derived atom for visible IDs

2. **Component Layer** (`src/components/VirtualizedTimeline.tsx`)
   - TanStack Virtual integration (~200px item height)
   - IntersectionObserver for load-more trigger
   - Result/Option handling for all states

3. **Infrastructure** (existing)
   - `TimelineKVS` - Normalized play storage with reactivity
   - `TimelineClient` - Type-safe API client
   - Python API - Cursor-based endpoint ready

### ⚠️ Issues Identified (From Design Review)

1. **No Gap Detection** - Missing dual-cursor model for filling holes
2. **Manual State Management** - Action atoms use `get.set()` directly (THIS IS CORRECT!)
3. **No Stream Abstraction** - Business logic could be cleaner with Stream.paginateEffect
4. **Limited Error Recovery** - Basic catchAll, no retry strategies
5. **No Prefetching** - Waits for scroll trigger instead of anticipating

---

## Refactoring Plan: Stream-Based Separation of Concerns

**Philosophy:** Action atoms using `get.set()` is idiomatic. The improvement is separating business logic (streams) from state management (atoms).

---

See full plan in sections below...

