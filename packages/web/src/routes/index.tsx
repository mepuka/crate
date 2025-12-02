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
 * HomePage - Centered split-view layout
 *
 * Layout strategy:
 * - When closed: timeline centered with max-width (672px)
 * - When open: both timeline + panel together are centered
 *   - Timeline shrinks to narrower width (~320px)
 *   - Panel takes up to ~768px
 *   - Total ~1100px centered on screen
 * - Smooth transition between states
 */
function HomePage() {
  const selectedId = useAtomValue(selectedPlayIdAtom)
  const isPanelOpen = Option.isSome(selectedId)

  return (
    <div className="relative min-h-screen w-full">
      {/* Container that centers the whole layout */}
      <div
        className={cn(
          "h-screen mx-auto transition-all duration-300 ease-out",
          // When closed: max-width for timeline only
          // When open: wider max-width to fit both components
          isPanelOpen
            ? "max-w-6xl" // ~1152px to fit timeline (320) + panel (768) + gaps
            : "max-w-2xl" // ~672px for timeline alone
        )}
      >
        {/* Flex container for the two panels */}
        <div className="h-full flex">
          {/* Timeline - shrinks when panel opens */}
          <div
            className={cn(
              "h-screen transition-all duration-300 ease-out shrink-0",
              // Hide on mobile when panel is open
              isPanelOpen
                ? "hidden md:block md:w-[320px] lg:w-[360px]"
                : "w-full"
            )}
          >
            <VirtualizedTimeline />
          </div>

          {/* Panel - takes remaining space */}
          {isPanelOpen && (
            <div className="flex-1 h-screen overflow-y-auto">
              <PlayDetailsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
