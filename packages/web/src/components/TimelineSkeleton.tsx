import { PlayCardSkeleton } from './PlayCardSkeleton'
import { cn } from '@/lib/utils'

interface TimelineSkeletonProps {
  count?: number
  className?: string
}

export function TimelineSkeleton({ count = 5, className }: TimelineSkeletonProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <PlayCardSkeleton key={index} />
      ))}
    </div>
  )
}
