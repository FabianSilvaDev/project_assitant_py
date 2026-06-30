/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#06090f',
        panel: '#0b1920',
        border: '#1e293b',
        primary: '#38bdf8',
      },
    },
  },
  plugins: [],
};
