import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral grays everywhere: legacy `slate-*` classes resolve to the same neutral scale.
        slate: { ...colors.zinc, 850: '#1f1f23', 750: '#333338' },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'panel-lg': '0 16px 48px -12px rgba(0, 0, 0, 0.7)',
      },
    },
  },
  plugins: [],
}
