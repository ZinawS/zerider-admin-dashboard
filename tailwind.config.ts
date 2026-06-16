import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: '#F8FAFC',
        border: '#E2E8F0',
        ink: '#0F172A',
        muted: '#475569',
        accent: '#3B82F6',
        success: '#16A34A',
        danger: '#DC2626',
      },
    },
  },
  plugins: [],
};
export default config;
