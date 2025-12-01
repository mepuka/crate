import { Skeleton } from '@/components/ui/skeleton'

export function PlayCardSkeleton() {
  return (
    <div className="play-card p-2 pointer-events-none">
      <div className="relative z-10 flex gap-2.5 py-1">
        {/* Album Art Skeleton - 72px matches default size */}
        <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-md" />

        {/* Content Skeleton */}
        <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
          {/* Title & Time */}
          <div className="flex items-baseline justify-between gap-2">
            <Skeleton className="h-5 w-3/4 rounded" />
            <Skeleton className="h-3 w-12 rounded shrink-0" />
          </div>

          {/* Artist */}
          <Skeleton className="h-3.5 w-1/2 rounded" />

          {/* Album */}
          <Skeleton className="h-3 w-2/5 rounded" />
        </div>
      </div>
    </div>
  )
}
