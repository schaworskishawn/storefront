import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        "bg-deep": "#0d0d1a",
        "bg-surface": "#0f0f14",
        "bg-section": "#1a1a2e",
        "control-bg-default": "#05030a",
        "black-860": "#0d0d1f",
        "black-880": "#0a0a14",
        "black-890": "#06060e",
        // Text / accents
        "text-accent-bright": "#00e5ff",
        "border-accent": "#69ebff",
        "border-highlight": "#f179fb",
        "border-purple": "#7a1fa2",
        "control-label-default": "#ffffff",
        "control-border-inactive": "#b8b4c4",
        "text-muted": "#7e7487",
        "footer-muted": "#8a8a99",
      },
      fontFamily: {
        display: ["Bungee", "cursive"],
        marker: ["'Permanent Marker'", "cursive"],
        comic: ["'Hey Comic'", "sans-serif"],
        mono: ["Orbitron", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
