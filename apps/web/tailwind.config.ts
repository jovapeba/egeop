import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b0e14",
        surface: "#111621",
        panel: "#161d2b",
        line: "#232c3f",
        muted: "#8b96ab",
        primary: { DEFAULT: "#e8b44a", dark: "#c99a35" },
        danger: "#e05561",
        success: "#4cc38a",
        info: "#5aa2e8",
      },
      borderRadius: { lg: "0.75rem" },
    },
  },
  plugins: [],
};

export default config;
