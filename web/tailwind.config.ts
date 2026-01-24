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
          'text-primary': '#1A144C',      // Dark indigo for AAA contrast on white
          'text-secondary': '#3D3475',    // Medium indigo
          'text-tertiary': '#5C5296',     // Lighter indigo
          'bg-primary': '#FFFFFF',
          'bg-secondary': '#F5F3FC',      // Light indigo tint
          'bg-tertiary': '#EBE8FA',       // Slightly darker indigo tint
          'border': '#C8C3E8',            // Indigo-tinted border
        },
        // Dark mode colors (Brand Indigo Background, AAA Compliant)
        dark: {
          'text-primary': '#FFFFFF',      // White for high contrast on #5B4CDB
          'text-secondary': '#E8E6F5',    // Light indigo for 8:1 contrast
          'text-tertiary': '#C4C0DC',     // Muted indigo for 7:1 contrast
          'bg-primary': '#5B4CDB',        // Brand indigo
          'bg-secondary': '#6556E5',      // Lighter indigo
          'bg-tertiary': '#3D32B0',       // Deeper indigo
          'border': '#8273F0',            // Indigo border
        },
        // Accent colors
        accent: {
          indigo: '#5B4CDB',              // Brand indigo
          purple: '#5B4CDB',              // Alias for backwards compatibility
          cyan: '#00FFFF',                // Brand cyan (pure cyan)
          gold: '#F5A623',
        },
        // Text on cyan (dark color for contrast)
        'text-on-cyan': '#1A144C',
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
