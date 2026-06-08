import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        base: {
          blue: "#0052FF",
          deep: "#061022",
          ink: "#0A0B12",
          mist: "#EEF4FF"
        }
      },
      boxShadow: {
        glow: "0 20px 80px rgba(0, 82, 255, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
