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
        // Light mode colors (matching iOS app)
        light: {
          'text-primary': '#000000',
          'text-secondary': '#3D3D3D',
          'text-tertiary': '#525252',
          'bg-primary': '#FFFFFF',
          'bg-secondary': '#F5F5F5',
          'bg-tertiary': '#EBEBEB',
          'border': '#CCCCCC',
        },
        // Dark mode colors (matching iOS app)
        dark: {
          'text-primary': '#FFFFFF',
          'text-secondary': '#E5E5E5',
          'text-tertiary': '#B8B8B8',
          'bg-primary': '#000000',
          'bg-secondary': '#1C1C1E',
          'bg-tertiary': '#2C2C2E',
          'border': '#4D4D4D',
        },
        // Accent colors
        accent: {
          purple: '#6366f1',
          gold: '#F5A623',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      },
    },
  },
  plugins: [],
}
export default config
