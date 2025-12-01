import { useEffect, useRef, useState } from 'react'

export function FPSIndicator() {
  if (!import.meta.env.DEV) {
    return null
  }

  return <FPSIndicatorImpl />
}

function FPSIndicatorImpl() {
  const [fps, setFps] = useState(60)
  const [avgFps, setAvgFps] = useState(60)
  const frameTimesRef = useRef<number[]>([])
  const lastFrameTimeRef = useRef(performance.now())
  const rafRef = useRef<number>()
  const frameCountRef = useRef(0)

  useEffect(() => {
    const measureFPS = () => {
      const now = performance.now()
      const delta = now - lastFrameTimeRef.current
      lastFrameTimeRef.current = now

      // Calculate instantaneous FPS
      const currentFps = 1000 / delta

      // Keep last 60 frames for average
      frameTimesRef.current.push(currentFps)
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift()
      }

      frameCountRef.current++

      // Update every 30 frames (debounced for readability - updates ~twice per second at 60fps)
      if (frameCountRef.current % 30 === 0) {
        const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
        setFps(Math.round(currentFps))
        setAvgFps(Math.round(avg))
      }

      rafRef.current = requestAnimationFrame(measureFPS)
    }

    rafRef.current = requestAnimationFrame(measureFPS)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const getColor = (fps: number) => {
    if (fps >= 55) return 'text-green-400'
    if (fps >= 30) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-black/80 backdrop-blur-sm px-3 py-2 rounded-lg font-mono text-xs space-y-1 border border-white/10">
      <div className="flex items-center gap-2">
        <span className="text-white/60">FPS:</span>
        <span className={`font-bold ${getColor(fps)}`}>{fps}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-white/60">Avg:</span>
        <span className={`font-bold ${getColor(avgFps)}`}>{avgFps}</span>
      </div>
      {avgFps < 30 && (
        <div className="text-red-400 text-[10px] mt-1">
          ⚠ Performance issue detected
        </div>
      )}
    </div>
  )
}
