# KXP Radio Crate - Component Specifications (FastAPI Edition)

## Overview

This document provides detailed implementation specifications for all React components in the KXP Radio Crate frontend, designed to work with the FastAPI backend.

**Tech Stack**:
- **Backend**: FastAPI (Python) with FAISS semantic search
- **Frontend**: React 18 + TypeScript + Effect Atom (@effect-atom/atom-react)
- **Styling**: Tailwind CSS + shadcn/ui
- **Deployment**: Vercel

---

## Visual Design Mockups

### Desktop Layout (1920x1080)

```
┌────────────────────────────────────────────────────────────────────────┐
│  [KEXP CRATE]           [🔍 Search plays... ⌘K]          [Timeline▼]  │  ← Header (sticky, 80px)
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ━━━━━━━━━━━━━━━━━━ November 12, 2025 ━━━━━━━━━━━━━━━━━━             │  ← DateDivider (sticky)
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  ┌────────┐  Paranoid Android                    2:34 PM     │    │
│  │  │ [Art]  │  Radiohead                                       │    │
│  │  │ 120px  │  OK Computer • 1997                              │    │
│  │  └────────┘  ●Heavy  Parlophone, Capitol Records             │    │
│  └──────────────────────────────────────────────────────────────┘    │  ← PlayCard (140px)
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  ┌────────┐  Fake Plastic Trees                  2:39 PM     │    │
│  │  │ [Art]  │  Radiohead                                       │    │
│  │  │        │  The Bends • 1995                                │    │
│  │  └────────┘  ●Medium  Parlophone                             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  [Loading more plays...]                                              │  ← LoadingSpinner
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (375x667)

```
┌─────────────────────────────────┐
│  KEXP              [🔍]          │  ← Compact Header (60px)
├─────────────────────────────────┤
│                                 │
│  ━━━ Nov 12, 2025 ━━━           │  ← Compact DateDivider
│                                 │
│  ┌─────────────────────────────┐│
│  │[Art] Paranoid Android  2:34P││  ← Compact PlayCard (100px)
│  │ 80px Radiohead              ││
│  │      OK Computer • 1997     ││
│  │      ●Heavy  Parlophone     ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │[Art] Fake Plastic... 2:39PM ││
│  │      Radiohead              ││
│  │      The Bends • 1995       ││
│  └─────────────────────────────┘│
│                                 │
│  [Loading...]                   │
└─────────────────────────────────┘
```

---

## 1. PlayCard Component

### Purpose
Display a single play with all metadata, optimized for virtual scrolling and responsive design.

### Full Implementation

```typescript
// src/components/PlayCard.tsx
import { PlayResult } from '@/types/api'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { forwardRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { AlbumArt } from './AlbumArt'
import { toast } from 'sonner'

const playCardVariants = cva(
  [
    "group relative overflow-hidden rounded-lg border",
    "transition-all duration-200 ease-in-out",
    "hover:shadow-md hover:border-primary/50",
    "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
    "cursor-pointer"
  ],
  {
    variants: {
      variant: {
        default: "bg-card border-border",
        focused: "bg-primary/5 border-primary shadow-lg ring-2 ring-primary",
        dimmed: "opacity-60"
      },
      size: {
        compact: "p-2",
        default: "p-4",
        expanded: "p-6"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

interface PlayCardProps extends VariantProps<typeof playCardVariants> {
  play: PlayResult
  isFocused?: boolean
  onVisible?: () => void
  className?: string
}

export const PlayCard = forwardRef<HTMLDivElement, PlayCardProps>(
  ({ play, variant, size, isFocused, className }, ref) => {
    const imageSize = size === 'compact' ? 80 : size === 'expanded' ? 160 : 120

    const handleCopyLink = () => {
      const url = `${window.location.origin}/play/${play.id}`
      navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard!')
    }

    // Parse release year from airdate
    const releaseYear = play.airdate ? new Date(play.airdate).getFullYear() : null

    return (
      <div
        ref={ref}
        className={cn(
          playCardVariants({
            variant: isFocused ? 'focused' : variant,
            size
          }),
          className
        )}
        tabIndex={0}
        role="article"
        aria-label={`${play.song} by ${play.artist} played ${play.airdate ? formatDistanceToNow(new Date(play.airdate)) + ' ago' : ''}`}
        onClick={handleCopyLink}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCopyLink()
          }
        }}
      >
        <div className="flex gap-3 sm:gap-4">
          {/* Album Art */}
          <AlbumArt
            src={play.thumbnail_uri || play.image_uri || '/placeholder-album.png'}
            alt={`${play.album} by ${play.artist}`}
            size={imageSize}
          />

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Title & Time */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground text-sm sm:text-base truncate" title={play.song}>
                {play.song || 'Untitled'}
              </h3>
              {play.airdate && (
                <time
                  className="text-xs sm:text-sm text-muted-foreground font-mono whitespace-nowrap shrink-0"
                  dateTime={play.airdate}
                >
                  {new Date(play.airdate).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </time>
              )}
            </div>

            {/* Artist */}
            <p className="text-xs sm:text-sm text-foreground/90 truncate" title={play.artist}>
              {play.artist || 'Unknown Artist'}
            </p>

            {/* Album & Year */}
            {play.album && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate" title={play.album}>
                {play.album}
                {releaseYear && ` • ${releaseYear}`}
              </p>
            )}

            {/* Badges */}
            {size !== 'compact' && (
              <div className="flex flex-wrap gap-1 mt-1">
                {play.rotation_status && (
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    {play.rotation_status}
                  </Badge>
                )}
                {play.labels && play.labels.length > 0 && (
                  <span className="text-xs text-muted-foreground truncate" title={play.labels.join(', ')}>
                    {play.labels.slice(0, 2).join(', ')}
                  </span>
                )}
                {play.is_local && (
                  <Badge variant="outline" className="text-xs px-2 py-0 border-secondary text-secondary">
                    Local
                  </Badge>
                )}
                {play.is_request && (
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    ★ Request
                  </Badge>
                )}
                {play.is_live && (
                  <Badge variant="outline" className="text-xs px-2 py-0 border-accent text-accent">
                    ● Live
                  </Badge>
                )}
              </div>
            )}

            {/* Similarity score (for search results) */}
            {play.similarity > 0 && (
              <div className="text-xs text-muted-foreground">
                Similarity: {(play.similarity * 100).toFixed(1)}%
              </div>
            )}

            {/* Comment */}
            {play.comment && size === 'expanded' && (
              <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
                {play.comment}
              </p>
            )}
          </div>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
          <span className="text-xs text-primary font-medium bg-background/90 px-3 py-1 rounded-full">
            Click to copy link
          </span>
        </div>
      </div>
    )
  }
)

PlayCard.displayName = 'PlayCard'
```

### AlbumArt Component

```typescript
// src/components/AlbumArt.tsx
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Music } from 'lucide-react'

interface AlbumArtProps {
  src: string
  alt: string
  size?: number
  className?: string
}

export const AlbumArt = ({ src, alt, size = 120, className }: AlbumArtProps) => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div
      className={cn("relative rounded overflow-hidden bg-muted shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* Loading skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Music className="w-8 h-8 text-muted-foreground/30" />
        </div>
      )}

      {/* Image */}
      {!error && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
```

---

## 2. InfiniteTimeline Component

### Purpose
The core component that renders the chronological stream of plays with virtual scrolling and cursor-based pagination.

### Implementation

```typescript
// src/components/InfiniteTimeline.tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useEffect, Suspense } from 'react'
import { useAtomSuspense, useAtomSet } from '@effect-atom/atom-react'
import { PlayCard } from './PlayCard'
import { DateDivider } from './DateDivider'
import { LoadingSpinner } from './LoadingSpinner'
import { timelineAtom, appendPlaysAtom } from '@/atoms/timeline'
import { isSameDay, parseISO } from 'date-fns'

interface InfiniteTimelineProps {
  anchorId?: number
  since?: string
  until?: string
  percentage?: number
}

const TimelineContent = ({
  anchorId,
  since,
  until,
  percentage
}: InfiniteTimelineProps) => {
  const parentRef = useRef<HTMLDivElement>(null)
  const lastItemRef = useRef<HTMLDivElement>(null)

  // Fetch data using Effect Atoms
  const { plays, hasMore, isLoading, error } = useAtomSuspense(timelineAtom)
  const appendPlays = useAtomSet(appendPlaysAtom)

  // Find anchor position if present
  const anchorPosition = plays.findIndex(play => play.id === anchorId)

  // Virtual scroller
  const virtualizer = useVirtualizer({
    count: plays.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Check if we need a date divider
      const needsDivider = index === 0 || !isSameDay(
        parseISO(plays[index].airdate),
        parseISO(plays[index - 1].airdate)
      )
      return needsDivider ? 180 : 140  // 40px for divider + 140px for card
    },
    overscan: 10
  })

  // Scroll to anchor on mount
  useEffect(() => {
    if (anchorPosition >= 0 && plays.length > 0) {
      virtualizer.scrollToIndex(anchorPosition, { align: 'center', behavior: 'smooth' })
    }
  }, [anchorPosition])

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!lastItemRef.current || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          appendPlays()
        }
      },
      { rootMargin: '400px' }
    )

    observer.observe(lastItemRef.current)

    return () => observer.disconnect()
  }, [hasMore, isLoading, appendPlays])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-destructive">
        Error loading plays: {error}
      </div>
    )
  }

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative'
        }}
      >
        {items.map((virtualRow) => {
          const play = plays[virtualRow.index]
          const prevPlay = plays[virtualRow.index - 1]

          const showDateDivider = !prevPlay || !isSameDay(
            parseISO(play.airdate),
            parseISO(prevPlay.airdate)
          )

          const isLast = virtualRow.index === plays.length - 1

          return (
            <div
              key={virtualRow.key}
              ref={isLast ? lastItemRef : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {showDateDivider && (
                <DateDivider date={parseISO(play.airdate)} />
              )}

              <PlayCard
                play={play}
                isFocused={anchorId === play.id}
                className="mx-auto max-w-4xl mb-2 px-4"
              />
            </div>
          )
        })}
      </div>

      {/* Loading more indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}

      {/* End of results */}
      {!hasMore && plays.length > 0 && (
        <div className="text-center text-muted-foreground py-8">
          You've reached the end of the timeline
        </div>
      )}
    </div>
  )
}

export const InfiniteTimeline = (props: InfiniteTimelineProps) => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <LoadingSpinner />
        </div>
      }
    >
      <TimelineContent {...props} />
    </Suspense>
  )
}
```

---

## 3. SearchBar Component

### Purpose
Semantic search input with debouncing and keyboard shortcuts.

### Implementation

```typescript
// src/components/SearchBar.tsx
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  className?: string
  autoFocus?: boolean
}

export const SearchBar = ({ className, autoFocus }: SearchBarProps) => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''

  const [query, setQuery] = useState(initialQuery)
  const [isFocused, setIsFocused] = useState(false)
  const debouncedQuery = useDebounce(query, 300)

  // Update URL when debounced query changes
  useEffect(() => {
    if (debouncedQuery && debouncedQuery !== initialQuery) {
      navigate(`/search?q=${encodeURIComponent(debouncedQuery)}`, { replace: true })
    } else if (query === '' && initialQuery) {
      navigate('/', { replace: true })
    }
  }, [debouncedQuery])

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleClear = () => {
    setQuery('')
    navigate('/', { replace: true })
  }

  return (
    <div className={cn("relative w-full max-w-2xl", className)}>
      <div className="relative">
        {/* Search icon */}
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />

        {/* Input */}
        <Input
          id="search-input"
          type="search"
          placeholder="Search plays, artists, albums... (⌘K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoFocus={autoFocus}
          className={cn(
            "pl-10 pr-10 h-12 text-base transition-shadow",
            isFocused && "ring-2 ring-primary shadow-lg"
          )}
        />

        {/* Clear button */}
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
```

---

## 4. DateDivider Component

### Purpose
Visual separator showing date boundaries in the timeline.

### Implementation

```typescript
// src/components/DateDivider.tsx
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface DateDividerProps {
  date: Date
  className?: string
  sticky?: boolean
}

export const DateDivider = ({ date, className, sticky = true }: DateDividerProps) => {
  return (
    <div
      className={cn(
        "flex items-center gap-4 py-3 px-4 sm:py-4 sm:px-6",
        sticky && "sticky top-16 bg-background/95 backdrop-blur-sm z-10 border-b border-border/50",
        className
      )}
    >
      <div className="h-px flex-1 bg-border/50" />
      <time
        dateTime={date.toISOString()}
        className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider"
      >
        {format(date, 'MMMM d, yyyy')}
      </time>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  )
}
```

---

## 5. NavigationControls Component

### Purpose
Quick jump controls for timeline exploration (date picker, percentage scrubber, year shortcuts).

### Implementation

```typescript
// src/components/NavigationControls.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Slider } from '@/components/ui/slider'

export const NavigationControls = () => {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [percentage, setPercentage] = useState<number>(0)

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date)
      const isoDate = date.toISOString().split('T')[0] + 'T00:00:00'
      navigate(`/timeline?since=${isoDate}`)
    }
  }

  const handlePercentageChange = (value: number[]) => {
    setPercentage(value[0])
  }

  const handlePercentageCommit = () => {
    navigate(`/timeline?percentage=${percentage / 100}`)
  }

  const handleYearClick = (year: number) => {
    const isoDate = `${year}-01-01T00:00:00`
    navigate(`/timeline?since=${isoDate}`)
  }

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
        {/* Quick year buttons */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Jump to:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/')}
          >
            Today
          </Button>
          {[2024, 2020, 2015, 2010].map((year) => (
            <Button
              key={year}
              variant="ghost"
              size="sm"
              onClick={() => handleYearClick(year)}
            >
              {year}
            </Button>
          ))}
        </div>

        {/* Date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <Calendar className="w-4 h-4 mr-2" />
              {selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Timeline scrubber */}
        <div className="w-full mt-2 flex items-center gap-4">
          <span className="text-xs text-muted-foreground">2007</span>
          <Slider
            value={[percentage]}
            onValueChange={handlePercentageChange}
            onValueCommit={handlePercentageCommit}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground">2025</span>
          <span className="text-xs text-muted-foreground font-mono w-12 text-right">
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  )
}
```

---

## 6. Atoms and State Management

### Timeline Atoms

```typescript
// src/atoms/timeline.ts
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Schema } from "@effect/schema"
import { Effect, pipe } from "effect"

// Schema definitions (matching FastAPI Pydantic models)
export class PlayResult extends Schema.Class<PlayResult>("PlayResult")({
  id: Schema.Number,
  artist: Schema.String,
  song: Schema.String,
  similarity: Schema.Number,
  album: Schema.NullOr(Schema.String),
  airdate: Schema.DateTimeUtc,
  labels: Schema.Array(Schema.String),
  rotation_status: Schema.NullOr(Schema.String),
  is_local: Schema.Boolean,
  is_live: Schema.Boolean,
  is_request: Schema.Boolean,
  comment: Schema.NullOr(Schema.String),
  show: Schema.Number,
  artist_mbid: Schema.NullOr(Schema.Array(Schema.String)),
  recording_mbid: Schema.NullOr(Schema.String),
  release_mbid: Schema.NullOr(Schema.String),
  release_group_mbid: Schema.NullOr(Schema.String),
  thumbnail_uri: Schema.NullOr(Schema.String),
  image_uri: Schema.NullOr(Schema.String),
}) {}

export class TimelineResponse extends Schema.Class<TimelineResponse>("TimelineResponse")({
  results: Schema.Array(PlayResult),
  next_cursor: Schema.NullOr(Schema.String),
  has_more: Schema.Boolean,
  query_time_ms: Schema.Number,
  total_count: Schema.optional(Schema.Number),
  anchor_position: Schema.optional(Schema.Number),
}) {}

// Timeline atom
export const timelineAtom = Atom.make(
  pipe(
    HttpClientRequest.get("/api/plays/timeline"),
    HttpClientRequest.setUrlParam("limit", "50"),
    HttpClient.fetchOk,
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponse)),
    Effect.map((response) => ({
      plays: response.results,
      cursor: response.next_cursor,
      hasMore: response.has_more,
      isLoading: false,
      error: null
    })),
    Effect.catchAll((error) =>
      Effect.succeed({
        plays: [],
        cursor: null,
        hasMore: false,
        isLoading: false,
        error: String(error)
      })
    )
  )
)

// Append plays for infinite scroll
export const appendPlaysAtom = Atom.fnEffect((get) =>
  Effect.gen(function* () {
    const state = yield* get(timelineAtom)
    if (!state.hasMore || state.isLoading) return state

    const response = yield* pipe(
      HttpClientRequest.get("/api/plays/timeline"),
      HttpClientRequest.setUrlParams({
        cursor: state.cursor ?? "",
        limit: "50"
      }),
      HttpClient.fetchOk,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(TimelineResponse))
    )

    return {
      plays: [...state.plays, ...response.results],
      cursor: response.next_cursor,
      hasMore: response.has_more,
      isLoading: false,
      error: null
    }
  })
)
```

### Search Atoms

```typescript
// src/atoms/search.ts
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Schema } from "@effect/schema"
import { Effect, pipe } from "effect"
import { PlayResult } from "./timeline"

export class SearchResponse extends Schema.Class<SearchResponse>("SearchResponse")({
  results: Schema.Array(PlayResult),
  total: Schema.Number,
  query_time_ms: Schema.Number,
  query: Schema.String,
}) {}

// Search atom family (one atom per query string)
export const searchAtom = Atom.family((query: string) =>
  Atom.make(
    pipe(
      HttpClientRequest.post("/api/search"),
      HttpClientRequest.jsonBody({
        query,
        limit: 20,
        offset: 0
      }),
      HttpClient.fetchOk,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(SearchResponse)),
      Effect.map((response) => ({
        results: response.results,
        total: response.total,
        queryTimeMs: response.query_time_ms
      }))
    )
  )
)
```

### useDebounce Hook

```typescript
// src/hooks/useDebounce.ts
import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
```

---

## 7. HTTP Client Configuration

All HTTP requests are handled through Effect's HttpClient within atoms. Configure the base URL using environment variables:

```typescript
// src/lib/http.ts
import { HttpClient } from "@effect/platform"
import { Effect } from "effect"

export const baseHttpClient = HttpClient.mapRequest(
  HttpClient.client,
  HttpClientRequest.prependUrl(
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
  )
)
```

**Note**: Unlike React Query or Axios, Effect's HttpClient is used directly within atoms. This provides:
- Type-safe request/response handling with Effect Schema
- Built-in error handling and retry capabilities
- Composable HTTP operations using pipe
- No need for separate API client layer

---

## 8. Type Definitions

All types are defined using Effect Schema (see atoms section above). Effect Schema provides:
- Runtime validation matching Pydantic models
- Type inference for TypeScript
- Automatic JSON encoding/decoding
- Branded types for safety

Example type usage:

```typescript
// Import schemas from atoms
import { PlayResult, TimelineResponse } from '@/atoms/timeline'

// Types are automatically inferred
type Play = typeof PlayResult.Type
// { id: number, artist: string, ... }
```

---

## Performance Optimizations Checklist

- [ ] **Virtual scrolling**: Only render visible items (~100 DOM nodes)
- [ ] **Image lazy loading**: Load album art on demand with `loading="lazy"`
- [ ] **Debounced search**: 300ms delay to reduce API calls
- [ ] **Effect Atom caching**: Atoms memoize results automatically, reducing re-fetches
- [ ] **Suspense boundaries**: Strategic placement for optimal loading states
- [ ] **Code splitting**: Lazy load routes with React.lazy()
- [ ] **Bundle optimization**: Tree-shaking, minification in production
- [ ] **Vercel Image Optimization**: Automatic WebP/AVIF conversion

---

## Testing Checklist

### Unit Tests
- [ ] PlayCard renders correctly with all variants
- [ ] SearchBar debounces input properly
- [ ] DateDivider shows correct format
- [ ] Hooks return expected data structures

### Integration Tests
- [ ] InfiniteTimeline loads and displays plays
- [ ] Cursor pagination works correctly
- [ ] Search navigation updates URL
- [ ] Navigation controls jump to correct dates

### E2E Tests (Playwright)
- [ ] Infinite scroll loads more plays
- [ ] Search filters and displays results
- [ ] Direct play links work (/play/:id)
- [ ] Timeline percentage scrubber functions
- [ ] Keyboard shortcuts work (Cmd+K)

---

## Deployment Configuration

### Environment Variables

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:8000

# .env.production
VITE_API_BASE_URL=https://api.kxp-crate.com
```

### Vercel Configuration

```json
// vercel.json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://your-backend.com/api/:path*"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

---

This specification provides production-ready React components optimized for the FastAPI backend with FAISS semantic search and cursor-based timeline pagination.
