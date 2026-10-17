/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Obsidian base ────────────────────────────────────────────
        ink: {
          950: "#07070A",
          900: "#0B0B0D",
          850: "#101014",
          800: "#141419",
          750: "#191920",
          700: "#1F1F27",
          600: "#2A2A34",
          500: "#3A3A46",
          400: "#5A5A68",
          300: "#8A8A99",
          200: "#B8B8C4",
          100: "#E4E4EA",
          50: "#F6F6F8",
        },
        // ── Royal gold ───────────────────────────────────────────────
        gold: {
          50: "#FDF8E7",
          100: "#FAEFC4",
          200: "#F5E08D",
          300: "#EFD05A",
          400: "#E3BE42",
          500: "#D4AF37",
          600: "#B4922A",
          700: "#8C7122",
          800: "#63501A",
          900: "#3D3113",
        },
        // ── Estate emerald ───────────────────────────────────────────
        jade: {
          50: "#E9F6EE",
          100: "#CDEBD8",
          200: "#9BD8B1",
          300: "#63C086",
          400: "#33A562",
          500: "#22B34A",
          600: "#1A8F3D",
          700: "#146E31",
          800: "#0F3D2E",
          900: "#0A2A20",
        },
        // ── Semantic ─────────────────────────────────────────────────
        sky2: "#3B82F6",
        danger: {
          DEFAULT: "#FF3B3B",
          soft: "#FF6B6B",
          deep: "#C62828",
        },
        paper: "#FFFFFF",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        serif: ["Instrument Serif", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        micro: ["9px", { lineHeight: "12px" }],
      },
      /* Fine-grained opacity scale so colour modifiers like `border-white/12`
       * and `bg-gold-500/8` resolve without arbitrary-value brackets. */
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [i, String(i / 100)]),
      ),
      borderRadius: {
        "4xl": "28px",
        "5xl": "36px",
      },
      scale: {
        92: "0.92",
        97: "0.97",
        98: "0.98",
        99: "0.99",
        995: "0.995",
        103: "1.03",
        115: "1.15",
      },
      brightness: {
        115: "1.15",
        120: "1.2",
      },
      spacing: {
        safe: "env(safe-area-inset-bottom, 0px)",
        "safe-t": "env(safe-area-inset-top, 0px)",
      },
      boxShadow: {
        gold: "0 10px 34px -12px rgba(212,175,55,0.45)",
        jade: "0 10px 34px -12px rgba(26,143,61,0.45)",
        lift: "0 18px 50px -22px rgba(0,0,0,0.85)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.06)",
        sheet: "0 -18px 60px -20px rgba(0,0,0,0.9)",
      },
      backgroundImage: {
        "gold-sheen":
          "linear-gradient(115deg,#8C7122 0%,#D4AF37 22%,#F5E08D 38%,#D4AF37 55%,#8C7122 78%,#D4AF37 100%)",
        "jade-sheen": "linear-gradient(135deg,#0F3D2E 0%,#1A8F3D 55%,#22B34A 100%)",
        "grid-fade":
          "linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "44px 44px",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(14px) scale(0.985)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.055)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-420px 0" },
          "100%": { backgroundPosition: "420px 0" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(212,175,55,0.42)" },
          "70%": { boxShadow: "0 0 0 12px rgba(212,175,55,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(212,175,55,0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-7px)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.3s ease both",
        pop: "pop 0.34s cubic-bezier(0.34,1.56,0.64,1)",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.66,0,0,1) infinite",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
