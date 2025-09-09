export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: { 
    extend: {
      keyframes: {
        'rainbow-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        },
        'ring-pulse': {
          '0%,100%': { opacity: 0.55, transform: 'scale(1)' },
          '50%': { opacity: 0.85, transform: 'scale(1.04)' }
        },
        'soft-pulse': {
          '0%,100%': { opacity: 0.18 },
          '50%': { opacity: 0.35 }
        }
      },
      animation: {
        'rainbow-spin': 'rainbow-spin 9s linear infinite',
        'ring-pulse': 'ring-pulse 2.4s ease-in-out infinite',
        'soft-pulse': 'soft-pulse 3.4s ease-in-out infinite'
      }
    } 
  },
  plugins: []
};
