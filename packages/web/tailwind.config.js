/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['IBM Plex Sans', 'sans-serif'],
        serif: ['Libre Baskerville', 'Georgia', 'serif'],
      },
      // Modular typographic scale (1.25 ratio - "Major Third")
      fontSize: {
        'liner-xs': ['0.64rem', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        'liner-sm': ['0.8rem', { lineHeight: '1.6', letterSpacing: '0.01em' }],
        'liner-base': ['1rem', { lineHeight: '1.7', letterSpacing: '0' }],
        'liner-lg': ['1.25rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        'liner-xl': ['1.563rem', { lineHeight: '1.35', letterSpacing: '-0.015em' }],
        'liner-2xl': ['1.953rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        'liner-3xl': ['2.441rem', { lineHeight: '1.15', letterSpacing: '-0.025em' }],
      },
      // Spacing based on 8px baseline grid
      spacing: {
        'liner-1': '0.5rem',   // 8px
        'liner-2': '1rem',     // 16px
        'liner-3': '1.5rem',   // 24px
        'liner-4': '2rem',     // 32px
        'liner-6': '3rem',     // 48px
        'liner-8': '4rem',     // 64px
      },
      // Optimal line lengths for reading
      maxWidth: {
        'prose-tight': '45ch',
        'prose-optimal': '65ch',
        'prose-wide': '75ch',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')],
}
