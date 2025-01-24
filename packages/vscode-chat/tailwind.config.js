/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--vscode-input-border)",
        input: "var(--vscode-input-background)",
        ring: "var(--vscode-focusBorder)",
        background: "var(--vscode-editor-background)",
        foreground: "var(--vscode-editor-foreground)",
        primary: {
          DEFAULT: "var(--vscode-button-background)",
          foreground: "var(--vscode-button-foreground)",
        },
        secondary: {
          DEFAULT: "var(--vscode-button-secondaryBackground)",
          foreground: "var(--vscode-button-secondaryForeground)",
        },
        muted: {
          DEFAULT: "var(--vscode-input-placeholderForeground)",
          foreground: "var(--vscode-descriptionForeground)",
        },
        accent: {
          DEFAULT: "var(--vscode-textLink-foreground)",
          foreground: "var(--vscode-textLink-activeForeground)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} 