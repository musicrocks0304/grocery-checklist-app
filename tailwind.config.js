/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Semantic tokens via CSS custom properties (light/dark auto-switch)
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          light: 'var(--color-primary-light)',
          border: 'var(--color-primary-border)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          light: 'var(--color-accent-light)',
          dark: 'var(--color-accent)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover: 'var(--color-danger-hover)',
          light: 'var(--color-danger-light)',
        },
        meal: {
          DEFAULT: 'var(--color-meal)',
          light: 'var(--color-meal-light)',
        },
        // Surfaces
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        background: 'var(--color-background)',
        // Text
        heading: 'var(--color-text-primary)',
        body: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
        // Borders
        default: 'var(--color-border)',
        // Sidebar
        'sidebar-bg': 'var(--color-sidebar-bg)',
        'sidebar-hover': 'var(--color-sidebar-hover)',
        'sidebar-active': 'var(--color-sidebar-active)',
        'sidebar-text': 'var(--color-sidebar-text)',
        'sidebar-text-muted': 'var(--color-sidebar-text-muted)',
        'sidebar-border': 'var(--color-sidebar-border)',
      },
      ringColor: {
        focus: 'var(--color-primary)',
      },
      borderColor: {
        default: 'var(--color-border)',
      },
      boxShadow: {
        'warm-sm': '0 1px 2px rgba(45, 52, 54, 0.05)',
        'warm': '0 4px 14px rgba(45, 52, 54, 0.08)',
        'warm-lg': '0 10px 30px rgba(45, 52, 54, 0.12)',
        'warm-xl': '0 20px 50px rgba(45, 52, 54, 0.16)',
      },
      screens: {
        'xs': '475px',
      },
    },
  },
  plugins: [],
}
