import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pesa: {
          bg: "#0a0a0a",
          card: "#111827",
          accent: "#F59E0B",
          success: "#10B981",
          terminal: "#00FF41",
          text: "#F9FAFB",
          muted: "#6B7280",
          border: "#1F2937",
          error: "#EF4444",
        },
      },
      boxShadow: {
        glow: "0 0 30px rgba(245, 158, 11, 0.15)",
      },
      animation: {
        "fade-up": "fadeUp 0.35s ease-out",
        pulseSoft: "pulseSoft 1.8s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
