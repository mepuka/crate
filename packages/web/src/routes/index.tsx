import { createFileRoute } from '@tanstack/react-router'
import { VirtualizedTimeline } from '@/components/VirtualizedTimeline'
import { PlayDetailsPanel } from '@/components/PlayDetailsPanel'
import { useAtomValue } from '@effect-atom/atom-react'
import { selectedPlayIdAtom } from '@/atoms/play-details'
import { Option } from 'effect'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: HomePage,
})

/**
 * HomePage - Split-view layout for timeline and play details
 *
 * Layout strategy:
 * - Mobile (<768px): Timeline full-width, panel overlays as modal
 * - Tablet+ (≥768px): Side-by-side split view
 *   - Timeline takes left portion, shrinks when panel opens
 *   - Panel slides in from right as fixed sidebar
 *
 * Optimized for iPad (768-1024px) and MacBook Air (1280-1440px)
 */
function HomePage() {
  const selectedId = useAtomValue(selectedPlayIdAtom)
  const isPanelOpen = Option.isSome(selectedId)

  return (
    <div className="relative min-h-screen w-full">
      {/*
        Split-view container:
        - On mobile: timeline is full width, panel overlays
        - On tablet+: flexbox layout with timeline shrinking when panel opens
      */}
      <div className="flex h-screen">
        {/* Timeline column - responsive width */}
        <div
          className={cn(
            "h-screen transition-all duration-300 ease-out",
            // Mobile: always full width
            "w-full",
            // Tablet+: shrink when panel opens to make room
            isPanelOpen
              ? "md:w-[45%] lg:w-[50%] xl:w-[55%]"
              : "md:w-full"
          )}
        >
          <VirtualizedTimeline />
        </div>

        {/* Panel column - only visible on tablet+ when open */}
        <div
          className={cn(
            "hidden md:block h-screen overflow-hidden",
            "transition-all duration-300 ease-out",
            isPanelOpen
              ? "md:w-[55%] lg:w-[50%] xl:w-[45%]"
              : "md:w-0"
          )}
        >
          <PlayDetailsPanel variant="sidebar" />
        </div>
      </div>

      {/* Mobile overlay panel - only on small screens */}
      <div className="md:hidden">
        <PlayDetailsPanel variant="overlay" />
      </div>
    </div>
  )
}
