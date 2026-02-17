/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary — HEB green
        primary: {
          DEFAULT: '#16a34a',   // green-600
          hover: '#15803d',     // green-700
          light: '#f0fdf4',     // green-50
          border: '#bbf7d0',    // green-200
        },
        // Secondary — neutral
        secondary: {
          DEFAULT: '#4b5563',   // gray-600
          hover: '#374151',     // gray-700
        },
        // Accent — amber (cooking screens)
        accent: {
          DEFAULT: '#f59e0b',   // amber-500
          dark: '#d97706',      // amber-600
        },
        // Danger — red
        danger: {
          DEFAULT: '#dc2626',   // red-600
          hover: '#b91c1c',     // red-700
          light: '#fef2f2',     // red-50
        },
        // Surfaces
        surface: '#ffffff',
        background: '#f9fafb',  // gray-50
        // Text
        heading: '#1f2937',     // gray-800
        body: '#4b5563',        // gray-600
        muted: '#6b7280',       // gray-500
        // Borders
        default: '#e5e7eb',     // gray-200
      },
      ringColor: {
        focus: '#22c55e',       // green-500
      },
      borderColor: {
        default: '#e5e7eb',     // gray-200
      },
    },
  },
  plugins: [],
}
