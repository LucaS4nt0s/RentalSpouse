module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        rental: {
          bg: 'var(--rs-bg)',
          surface: 'var(--rs-surface)',
          surface2: 'var(--rs-surface-2)',
          border: 'var(--rs-border)',
          muted: 'var(--rs-text-muted)',
          sand: 'var(--rs-accent)',
          gold: 'var(--rs-primary)',
          primary: 'var(--rs-primary)',
          ink: 'var(--rs-text)',
          error: 'var(--rs-error)',
          success: 'var(--rs-success)',
        },
      },
      borderRadius: {
        xl: '0.85rem',
        '2xl': '1.1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'panel': 'var(--rs-shadow)',
        'primary': '0 10px 24px -10px var(--rs-ring)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        bounceOnce: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '60%': { opacity: '1', transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        spinSlow: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        scaleCheck: {
          '0%': { opacity: '0', transform: 'scale(0.4)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out both',
        shake: 'shake 0.45s ease-in-out',
        bounceOnce: 'bounceOnce 0.6s ease-out both',
        spinSlow: 'spinSlow 6s linear infinite',
        scaleCheck: 'scaleCheck 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};
