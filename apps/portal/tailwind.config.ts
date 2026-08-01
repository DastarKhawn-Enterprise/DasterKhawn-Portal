import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/*/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        white: "var(--surface)",
        black: "var(--text)",
        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        secondary: "rgb(var(--secondary-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        background: "var(--background)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        card: "var(--card)",
        panel: "var(--panel)",
        header: "var(--header)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
        text: {
          DEFAULT: "var(--text)",
          soft: "var(--text-soft)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        gray: {
          50: "var(--surface-2)",
          100: "var(--surface-3)",
          200: "var(--border)",
          300: "var(--border-strong)",
          400: "var(--text-faint)",
          500: "var(--text-muted)",
          600: "var(--text-muted)",
          700: "var(--text-soft)",
          800: "var(--text)",
          900: "var(--text)",
          950: "var(--text)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        btn: "var(--radius-btn)",
        input: "var(--radius-input)",
        dialog: "var(--radius-dialog)",
        sidebar: "var(--radius-sidebar)",
        lg: "var(--radius-btn)",
        xl: "var(--radius-card)",
        "2xl": "var(--radius-dialog)",
        "3xl": "var(--radius-sidebar)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        dialog: "var(--shadow-dialog)",
        drawer: "var(--shadow-drawer)",
      },
      fontFamily: {
        sans: ["var(--font)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      spacing: {
        4.5: "18px",
      },
      animation: {
        fade: "fadeIn 180ms ease both",
        "fade-up": "fadeInUp 220ms ease both",
        scale: "scaleIn 180ms ease both",
        "slide-right": "slideInRight 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "slide-bottom": "slideInBottom 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "slide-left": "slideInLeft 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
