import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

interface TimelineErrorStateProps {
  error: unknown
  onRetry?: () => void
  className?: string
}

export function TimelineErrorState({
  error,
  onRetry,
  className
}: TimelineErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : String(error)

  return (
    <Card className={cn("border-destructive/50", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base sm:text-lg">Error loading timeline</CardTitle>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          {errorMessage}
        </CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="w-full sm:w-auto"
          >
            Try Again
          </Button>
        </CardContent>
      )}
    </Card>
  )
}



