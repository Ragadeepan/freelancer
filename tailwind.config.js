/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          900: "#06070b",
          800: "#0b0f19",
          700: "#121829",
          600: "#1a2238",
          500: "#222b45"
        },
        glow: {
          violet: "#7c5cff",
          cyan: "#4df2ff",
          blue: "#3a82ff"
        },
        glass: "rgba(255,255,255,0.06)"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,92,255,0.35), 0 0 24px rgba(124,92,255,0.25)",
        card: "0 12px 32px rgba(0,0,0,0.45)"
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px"
      },
      backdropBlur: {
        glass: "14px"
      },
      fontFamily: {
        display: ["Sora", "ui-sans-serif", "system-ui"],
        body: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};
