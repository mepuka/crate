/**
 * Test Components Route
 *
 * DEV ONLY: Showcases base UI components.
 * Redirects to home in production builds.
 */

import { createFileRoute, Navigate } from '@tanstack/react-router'
import { AlbumArt, DateDivider, LoadingSpinner } from '@/components'

export const Route = createFileRoute('/test-components')({
  component: TestComponentsPage
})

function TestComponentsPage() {
  // Gate demo routes to development only
  if (!import.meta.env.DEV) {
    return <Navigate to="/" />;
  }
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Base UI Components Test</h1>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">AlbumArt Component</h2>
        <div className="flex gap-4 items-start flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Default size (120px)</p>
            <AlbumArt src={null} alt="Test Album" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Small size (80px)</p>
            <AlbumArt src={null} alt="Test Album" size={80} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Large size (160px)</p>
            <AlbumArt src={null} alt="Test Album" size={160} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">With valid image</p>
            <AlbumArt
              src="https://placekitten.com/200/200"
              alt="Cat Album"
              size={120}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">DateDivider Component</h2>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Default sticky divider</p>
          <DateDivider date={new Date()} />

          <p className="text-sm text-muted-foreground mt-4">Non-sticky divider</p>
          <DateDivider date={new Date('2024-01-15')} sticky={false} />

          <p className="text-sm text-muted-foreground mt-4">Custom date</p>
          <DateDivider date={new Date('2020-06-20')} sticky={false} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">LoadingSpinner Component</h2>
        <div className="flex gap-8 items-center">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Small</p>
            <LoadingSpinner size="sm" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Medium (default)</p>
            <LoadingSpinner size="md" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Large</p>
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Component Status</h2>
        <div className="border rounded-lg p-4 bg-muted/50">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span>AlbumArt: Loading skeleton, error fallback, and image rendering</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span>DateDivider: Sticky and non-sticky variants with date formatting</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span>LoadingSpinner: Size variants (sm, md, lg) with proper accessibility</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
