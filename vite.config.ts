import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// The public origin, fixed at build time (SvelteKit 3 has no runtime ORIGIN for adapter-node): the trusted
			// origin for CSRF checks on form posts. Unset, SvelteKit derives it from the request.
			paths: { origin: process.env.ORIGIN || undefined }
		})
	],
	test: {
		expect: { requireAssertions: true },
		// `--mode junit` (the ladder's unit rung): a JUnit report on standard output and nothing else there.
		reporters: mode === 'junit' ? [['junit', { stdout: true }]] : ['default'],
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
}));
