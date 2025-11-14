import { useAtomValue, Result } from '@effect-atom/atom-react'
import { scrollYAtom, viewportHeightAtom, playIdsSortedAtom } from '@/atoms/timeline'

/**
 * Development utility component that displays atom values fixed to the top of the page.
 * Useful for debugging and monitoring atom state during development.
 */
export function DevAtomDisplay() {
  const scrollY = useAtomValue(scrollYAtom)
  const viewportHeight = useAtomValue(viewportHeightAtom)
  const playIds = useAtomValue(playIdsSortedAtom)

  // Get newest 10 play IDs for display
  const newestPlayIds = Result.matchWithWaiting(playIds, {
    onWaiting: () => [],
    onError: () => [],
    onDefect: () => [],
    onSuccess: (s) => s.value.slice(0, 10),
  })

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-black/80 text-white text-xs font-mono p-2 border-b border-white/20"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <div className="max-w-7xl mx-auto flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">scrollY:</span>
          <span className="text-green-400 font-semibold">{scrollY.toFixed(0)}px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">viewportHeight:</span>
          <span className="text-blue-400 font-semibold">{viewportHeight.toFixed(0)}px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">scrollRatio:</span>
          <span className="text-yellow-400 font-semibold">
            {viewportHeight > 0 ? ((scrollY / viewportHeight) * 100).toFixed(1) : '0.0'}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">newestPlayIds:</span>
          <span className="text-purple-400 font-semibold">
            {newestPlayIds.length > 0 ? newestPlayIds.join(', ') : 'none'}
          </span>
        </div>
      </div>
    </div>
  )
}

