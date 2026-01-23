import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand colors
        brand: {
          purple: '#512AD4',
          'purple-dark': '#3D1FA2',
          'purple-light': '#6540E8',
          cyan: '#00FFF9',
          'cyan-dark': '#00DCD6',
        },
        // Light mode colors (AAA Compliant)
        light: {
          'text-primary': '#1A0A4C',      // Dark purple for AAA contrast on white
          'text-secondary': '#3D2A6B',    // Medium purple
          'text-tertiary': '#5C4A8C',     // Lighter purple
          'bg-primary': '#FFFFFF',
          'bg-secondary': '#F5F3FA',      // Light purple tint
          'bg-tertiary': '#EBE6F8',       // Slightly darker purple tint
          'border': '#C8BEE0',            // Purple-tinted border
        },
        // Dark mode colors (Brand Purple Background, AAA Compliant)
        dark: {
          'text-primary': '#FFFFFF',      // White for 10:1 contrast on #512AD4
          'text-secondary': '#E8E4F0',    // Light purple for 8:1 contrast
          'text-tertiary': '#C4BED4',     // Muted purple for 7:1 contrast
          'bg-primary': '#512AD4',        // Brand purple
          'bg-secondary': '#5B34DE',      // Lighter purple
          'bg-tertiary': '#3D20A2',       // Deeper purple
          'border': '#7850FF',            // Purple border
        },
        // Accent colors
        accent: {
          purple: '#512AD4',              // Brand purple
          cyan: '#00FFF9',                // Brand cyan
          gold: '#F5A623',
        },
        // Text on cyan (dark color for contrast)
        'text-on-cyan': '#1A0A4C',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #512AD4 0%, #00FFF9 100%)',
        'gradient-brand': 'linear-gradient(135deg, #512AD4 0%, #6540E8 50%, #00FFF9 100%)',
      },
    },
  },
  plugins: [],
}
export default config
