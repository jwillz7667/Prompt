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
        // Brand colors - Indigo (#5B4CDB) and Cyan (#00FFFF)
        brand: {
          indigo: '#5B4CDB',
          'indigo-dark': '#3D32B0',
          'indigo-light': '#6F60EF',
          cyan: '#00FFFF',
          'cyan-dark': '#00DCDC',
          // Keep purple as alias for backwards compatibility
          purple: '#5B4CDB',
          'purple-dark': '#3D32B0',
          'purple-light': '#6F60EF',
        },
        // Light mode colors (AAA Compliant)
        light: {
          'text-primary': '#1A144C',      // Dark indigo for AAA contrast
          'text-secondary': '#3D3475',    // Medium indigo
          'text-tertiary': '#5C5296',     // Lighter indigo
          'bg-primary': '#FAF9FF',        // Slight indigo tint for contrast with cards
          'bg-secondary': '#FFFFFF',      // White for cards/elevated content
          'bg-tertiary': '#EBE8FA',       // Light indigo tint
          'border': '#B4AFD2',            // More visible indigo border
        },
        // Dark mode colors (Standard iOS Black Background, AAA Compliant)
        dark: {
          'text-primary': '#FFFFFF',      // White for high contrast
          'text-secondary': '#8E8E93',    // iOS systemGray
          'text-tertiary': '#636366',     // iOS systemGray2
          'bg-primary': '#000000',        // Pure black for OLED
          'bg-secondary': '#1C1C1E',      // iOS elevated surface
          'bg-tertiary': '#2C2C2E',       // iOS tertiary
          'border': '#38383A',            // iOS separator
        },
        // Accent colors
        accent: {
          indigo: '#5B4CDB',              // Brand indigo
          purple: '#5B4CDB',              // Alias for backwards compatibility
          cyan: '#00FFFF',                // Brand cyan (pure cyan)
          gold: '#F5A623',
        },
        // Text on cyan (dark color for contrast in dark mode, white in light)
        'text-on-cyan': '#000000',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #5B4CDB 0%, #00FFFF 100%)',
        'gradient-brand': 'linear-gradient(135deg, #5B4CDB 0%, #6F60EF 50%, #00FFFF 100%)',
      },
    },
  },
  plugins: [],
}
export default config
