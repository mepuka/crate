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
          className="rounded-lg bg-card/30 p-2"
        >
          <div className="flex gap-2.5">
            {/* Album Art Skeleton - smaller */}
            <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-md" />

            {/* Content Skeleton */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              {/* Title and Time */}
              <div className="flex items-baseline justify-between gap-2">
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-2.5 w-12 rounded shrink-0" />
              </div>

              {/* Artist */}
              <Skeleton className="h-3 w-1/2 rounded" />

              {/* Album */}
              <Skeleton className="h-2.5 w-2/5 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

