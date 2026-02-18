/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#080C1A',
        panel: '#11182F',
        mint: '#7BF1A8',
        cyan: '#6CE4FF'
      },
      boxShadow: {
        soft: '0 12px 40px rgba(6, 11, 29, 0.35)'
      },
      animation: {
        pulsebar: 'pulsebar 1s ease-in-out infinite'
      },
      keyframes: {
        pulsebar: {
          '0%, 100%': { transform: 'scaleY(0.25)' },
          '50%': { transform: 'scaleY(1)' }
        }
      }
    }
  },
  plugins: []
};
