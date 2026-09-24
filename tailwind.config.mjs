/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	darkMode: 'class',
	theme: {
		extend: {
			fontFamily: {
				mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
			},
			keyframes: {
				marquee: {
					from: { transform: 'translateX(0)' },
					to: { transform: 'translateX(-50%)' },
				},
				'gradient-x': {
					'0%, 100%': { backgroundPosition: '0% 50%' },
					'50%': { backgroundPosition: '100% 50%' },
				},
				blink: {
					'0%, 49%': { opacity: '1' },
					'50%, 100%': { opacity: '0' },
				},
				float: {
					'0%, 100%': { transform: 'translate3d(0, 0, 0)' },
					'50%': { transform: 'translate3d(0, -12px, 0)' },
				},
			},
			animation: {
				marquee: 'marquee 40s linear infinite',
				'gradient-x': 'gradient-x 6s ease infinite',
				blink: 'blink 1s step-end infinite',
				float: 'float 8s ease-in-out infinite',
			},
		},
	},
	plugins: [],
}
