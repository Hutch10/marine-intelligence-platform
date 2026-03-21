import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          950: "#020d18",
          900: "#041425",
          850: "#061b30",
          800: "#0a2540",
          750: "#0d2f50",
          700: "#103960",
          600: "#164e7a",
          500: "#1d6494",
          400: "#2b7fb5",
          300: "#3d9fd8",
        },
        cyan: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
        },
        surface: {
          primary: "#061b30",
          secondary: "#0a2540",
          elevated: "#0d2f50",
          border: "#164e7a",
          borderSubtle: "#103960",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(34,211,238,0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(34,211,238,0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
