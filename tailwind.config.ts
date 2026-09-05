import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        onyx: {
          50: "#f4f5f6",
          100: "#e4e6e8",
          200: "#c8cccf",
          300: "#a2a8ad",
          400: "#767f86",
          500: "#5b636b",
          600: "#4a5058",
          700: "#3d4248",
          800: "#292d31",
          900: "#16181b",
          950: "#0a0b0d",
        },
        accent: {
          50: "#fdf8ec",
          100: "#faedc9",
          200: "#f4d98e",
          300: "#eec053",
          400: "#e6a92c",
          500: "#d4941c",
          600: "#b57415",
          700: "#915615",
          800: "#774518",
          900: "#653a18",
        },
      },
    },
  },
  plugins: [],
};
export default config;
