import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// the Ledger mockup is reference, not code (design/reference/README.md)
	{ ignores: ['design/reference/**'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {
			// A spread argument passes every element on the call stack: over roughly 120,000 of them the call throws
			// "Maximum call stack size exceeded". It has reached imported and fetched data three times in T-0012
			// (project positions, a project's links, a page's icon sizes). Use a loop.
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"CallExpression[callee.object.name='Math'][callee.property.name=/^(max|min)$/] > SpreadElement",
					message:
						'No spread into Math.max/Math.min: a long array overflows the call stack. Use a loop.'
				},
				{
					selector: "CallExpression[callee.property.name='push'] > SpreadElement",
					message: 'No spread into push(): a long array overflows the call stack. Use a loop.'
				},
				{
					selector:
						"CallExpression[callee.object.name='String'][callee.property.name=/^fromC(harCode|odePoint)$/] > SpreadElement",
					message:
						'No spread into String.fromCharCode/fromCodePoint: a long array overflows the call stack. Use a loop or TextDecoder.'
				}
			]
		}
	}
);
