/** @type {import('tailwindcss').Config} */
import daisyui from "daisyui"
import typography from "@tailwindcss/typography"
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [daisyui,typography],
  daisyui: {
    themes: ["cupcake", "retro", "aqua", "lemonade", "retro", "dark", "valentine", "cyberpunk"],
  },
}