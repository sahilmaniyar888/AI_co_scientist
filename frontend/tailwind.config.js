/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          0: 'rgb(var(--bg-0) / <alpha-value>)',
          1: 'rgb(var(--bg-1) / <alpha-value>)',
          2: 'rgb(var(--bg-2) / <alpha-value>)',
        },
        ink: {
          0: 'rgb(var(--ink-0) / <alpha-value>)',
          1: 'rgb(var(--ink-1) / <alpha-value>)',
          2: 'rgb(var(--ink-2) / <alpha-value>)',
          3: 'rgb(var(--ink-3) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        phosphor: 'rgb(var(--phosphor) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        magenta: 'rgb(var(--magenta) / <alpha-value>)',
        azure: 'rgb(var(--azure) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
