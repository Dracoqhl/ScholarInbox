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
        background: "oklch(var(--background) / <alpha-value>)",
        surface: "oklch(var(--surface) / <alpha-value>)",
        "surface-muted": "oklch(var(--surface-muted) / <alpha-value>)",
        line: "oklch(var(--line) / <alpha-value>)",
        primary: "oklch(var(--primary) / <alpha-value>)",
        muted: "oklch(var(--muted) / <alpha-value>)",
        accent: "oklch(var(--accent) / <alpha-value>)",
        "accent-soft": "oklch(var(--accent-soft) / <alpha-value>)",
        danger: "oklch(var(--danger) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

export default config;
