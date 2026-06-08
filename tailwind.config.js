/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FDFBF7",
          100: "#F7F2EA",
          200: "#EDE5D8",
        },
        team: {
          red: "#D94F3D",
          "red-light": "#F2735F",
          "red-dark": "#B33D2D",
          blue: "#3D6BD9",
          "blue-light": "#5F87F2",
          "blue-dark": "#2D55B3",
        },
        board: "#E8E2D8",
      },
      fontFamily: {
        display: ["'Fraunces'", "Georgia", "serif"],
        body: ["'DM Sans'", "system-ui", "sans-serif"],
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        pulse_soft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        slide_in: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        win_pop: {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "70%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        pulse_soft: "pulse_soft 2s ease-in-out infinite",
        slide_in: "slide_in 0.5s ease forwards",
        win_pop: "win_pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
      },
    },
  },
  plugins: [],
};
