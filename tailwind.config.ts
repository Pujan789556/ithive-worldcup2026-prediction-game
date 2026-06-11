import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          50: "#eefdf1",
          100: "#d7f8df",
          200: "#a6ebb4",
          300: "#6dda82",
          400: "#38bf5a",
          500: "#21a046",
          600: "#1c833b",
          700: "#186932",
          800: "#154f29",
          900: "#113d21"
        },
        chalk: "#f7f4ec",
        turf: "#0d3b2e",
        line: "#1b6d42",
        card: "rgba(255,255,255,0.88)"
      },
      boxShadow: {
        soft: "0 20px 50px rgba(6, 25, 12, 0.18)"
      },
      backgroundImage: {
        "pitch-grid":
          "radial-gradient(circle at top, rgba(255,255,255,0.12), transparent 35%), linear-gradient(135deg, rgba(16,73,45,0.98), rgba(11,49,31,0.98))"
      }
    }
  },
  plugins: []
};

export default config;

