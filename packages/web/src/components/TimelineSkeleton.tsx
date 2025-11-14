import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface TimelineSkeletonProps {
  count?: number
  className?: string
}

export function TimelineSkeleton({ count = 5, className }: TimelineSkeletonProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="border-b border-border/40 bg-card"
        >
          <div className="flex gap-3 py-3">
            {/* Album Art Skeleton */}
            <Skeleton className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded" />
            
            {/* Content Skeleton */}
            <div className="flex-1 min-w-0 space-y-0.5 py-0.5">
              {/* Title and Time */}
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-16 rounded shrink-0" />
              </div>
              
              {/* Artist */}
              <Skeleton className="h-3 w-1/2 rounded" />
              
              {/* Album */}
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

