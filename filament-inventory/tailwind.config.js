/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        filament: "#1A419C",
        ink: "#333333",
        mute: "#777777",
        line: "#E1E1E1",
        soft: "#F6F7F9",
        hero: "#080706",
      },
      fontFamily: {
        sans: ["var(--font-noto)", "Malgun Gothic", "Apple SD Gothic Neo", "sans-serif"],
      },
      maxWidth: {
        page: "1440px",
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [],
};
