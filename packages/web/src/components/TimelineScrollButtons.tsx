import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function TimelineScrollButtons() {
  const [showScrollUp, setShowScrollUp] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)

  useEffect(() => {
    const updateScrollButtons = () => {
      const scrollTop = window.scrollY
      const scrollHeight = document.documentElement.scrollHeight
      const clientHeight = window.innerHeight

      // Show scroll up button if scrolled down more than 200px
      setShowScrollUp(scrollTop > 200)

      // Show scroll down button if not at bottom (with 100px threshold)
      setShowScrollDown(scrollTop + clientHeight < scrollHeight - 100)
    }

    // Initial check
    updateScrollButtons()

    // Update on scroll
    window.addEventListener('scroll', updateScrollButtons, { passive: true })
    window.addEventListener('resize', updateScrollButtons, { passive: true })

    return () => {
      window.removeEventListener('scroll', updateScrollButtons)
      window.removeEventListener('resize', updateScrollButtons)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const scrollDown = () => {
    // Scroll down by one viewport height
    window.scrollBy({
      top: window.innerHeight * 0.8,
      behavior: 'smooth',
    })
  }

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-2">
      {showScrollUp && (
        <Button
          onClick={scrollToTop}
          size="icon"
          variant="outline"
          className={cn(
            // Glassmorphism styling
            'backdrop-blur-md bg-background/30 border-white/10',
            'hover:bg-background/50 hover:border-white/20',
            'shadow-lg shadow-black/20',
            'transition-all duration-300',
            'group',
            // Animation
            'animate-fade-in-up'
          )}
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
        </Button>
      )}

      {showScrollDown && (
        <Button
          onClick={scrollDown}
          size="icon"
          variant="outline"
          className={cn(
            // Glassmorphism styling
            'backdrop-blur-md bg-background/30 border-white/10',
            'hover:bg-background/50 hover:border-white/20',
            'shadow-lg shadow-black/20',
            'transition-all duration-300',
            'group',
            // Animation
            'animate-fade-in-up'
          )}
          aria-label="Scroll down"
        >
          <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
        </Button>
      )}
    </div>
  )
}
