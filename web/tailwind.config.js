const withAlpha = (token) =>
  `color-mix(in srgb, var(${token}) calc(<alpha-value> * 100%), transparent)`;

module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // `withAlpha` faz os modificadores de opacidade (ex.: bg-rental-surface/95,
      // bg-rental-primary/10) funcionarem com tokens em variáveis CSS.
      colors: {
        rental: {
          bg: withAlpha('--rs-bg'),
          surface: withAlpha('--rs-surface'),
          surface2: withAlpha('--rs-surface-2'),
          border: withAlpha('--rs-border'),
          muted: withAlpha('--rs-text-muted'),
          sand: withAlpha('--rs-accent'),
          gold: withAlpha('--rs-primary'),
          primary: withAlpha('--rs-primary'),
          ink: withAlpha('--rs-text'),
          error: withAlpha('--rs-error'),
          success: withAlpha('--rs-success'),
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
