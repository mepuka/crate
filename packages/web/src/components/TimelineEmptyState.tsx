import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Music } from 'lucide-react'

interface TimelineEmptyStateProps {
  message?: string
  description?: string
  className?: string
}

export function TimelineEmptyState({
  message = "No plays yet",
  description = "Waiting for plays from the background service. New plays will appear here automatically.",
  className
}: TimelineEmptyStateProps) {
  return (
    <Card className={cn("border-dashed bg-muted/30", className)}>
      <CardContent className="flex flex-col items-center justify-center p-8 sm:p-12 text-center">
        <Music className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/40 mb-4 animate-pulse" />
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-foreground tracking-tight">
          {message}
        </h3>
        <p className="text-sm sm:text-base text-muted-foreground/80 max-w-md leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

