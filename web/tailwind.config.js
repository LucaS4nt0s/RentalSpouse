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
          bg: '#11091a',
          surface: '#2f2f4d',
          muted: '#626970',
          sand: '#bab195',
          gold: '#e8d18e',
          error: '#EF4444',
          success: '#10B981',
        },
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-hover': '0 8px 32px 0 rgba(232, 209, 142, 0.15)',
        'gold-glow': '0 0 20px -3px rgba(232, 209, 142, 0.4)',
      },
    },
  },
  plugins: [],
}
