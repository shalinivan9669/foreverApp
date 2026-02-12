import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        accent: ['var(--font-accent)', 'cursive'],
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
      },
    },
  },
};

export default config;
