/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Note: In Tailwind v4, dark mode is configured via @custom-variant in CSS
  // See src/index.css for dark mode configuration
  theme: {
    extend: {
      transitionDuration: {
        '300': '300ms',
      },
    },
  },
  plugins: [],
}

