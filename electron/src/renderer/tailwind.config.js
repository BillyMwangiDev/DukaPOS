/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: "var(--accent)",
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        "input-background": "var(--input-background)",
        ring: "var(--ring)",
        "safaricom-green": "var(--safaricom-green)",
        "ocean-blue": "var(--ocean-blue)",
        "tomato-red": "var(--tomato-red)",
        "surface-2": "var(--surface-2)",
        "return-bg": "#450a0a",
        "return-border": "#7f1d1d",
      },
    },
  },
  plugins: [],
};
