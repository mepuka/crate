import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface DateDividerProps {
  date: Date
  className?: string
  sticky?: boolean
}

export function DateDivider({ date, className, sticky = true }: DateDividerProps) {
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
