// size-limit's config (npm run size, after npm run build): the gzipped JS a browser loads on the first visit to
// each first screen. Read from the build's own records, so it follows the real chunks:
// - Vite's client manifest (.svelte-kit/output/client/.vite/manifest.json) gives every chunk's static imports;
// - SvelteKit's generated client app (.svelte-kit/generated/build/client-optimized/app.js) maps routes to nodes.
// First load = the start entry, the client runtime it always loads, the app entry, the root layout (node 0), every
// other layout on the route's chain and its page node, each with everything they statically import (code loaded with
// import() on first use is not first load). Fails loudly if either record is missing.
import { readFileSync } from 'node:fs';

const LIMIT = '60 KB';
const ROUTES = ['/', '/login', '/signup'];
const out = '.svelte-kit/output/client';

const manifest = JSON.parse(readFileSync(`${out}/.vite/manifest.json`, 'utf8'));
const app = readFileSync('.svelte-kit/generated/build/client-optimized/app.js', 'utf8');

// Each route's entry is [page, [layouts], [errors]] (a "~" marks a node with a server load); the root layout, node 0,
// is not listed and is always loaded. Every layout on the chain counts, so a route group's layout cannot hide JS.
const dictionary = Object.fromEntries(
	[...app.matchAll(/"(\/[^"]*)":\s*\[~?(\d+)(?:,\s*\[([^\]]*)\])?/g)].map((m) => [
		m[1],
		{
			page: Number(m[2]),
			layouts: (m[3] ?? '')
				.split(',')
				.map((n) => n.trim().replace(/^~/, ''))
				.filter((n) => /^\d+$/.test(n))
				.map(Number)
		}
	])
);

const key = (suffix) => {
	const found = Object.keys(manifest).filter((k) => k.endsWith(suffix));
	if (found.length !== 1)
		throw new Error(`size-limit: expected one manifest entry ending ${suffix}, got ${found}`);
	return found[0];
};

function closure(keys) {
	const files = new Set();
	const visit = (k) => {
		const chunk = manifest[k];
		if (!chunk) throw new Error(`size-limit: ${k} is not in the Vite manifest`);
		if (files.has(chunk.file)) return;
		files.add(chunk.file);
		for (const i of chunk.imports ?? []) visit(i);
	};
	keys.forEach(visit);
	return [...files].map((f) => `${out}/${f}`);
}

const always = [
	key('@sveltejs/kit/src/runtime/client/entry.js'),
	key('@sveltejs/kit/src/runtime/client/client-entry.js'),
	key('client-optimized/app.js'),
	key('client-optimized/nodes/0.js')
];

export default ROUTES.map((route) => {
	const entry = dictionary[route];
	if (entry === undefined)
		throw new Error(`size-limit: no route ${route} in the generated client app`);
	const nodes = [...entry.layouts.filter((n) => n !== 0), entry.page];
	return {
		name: `first load JS, ${route}`,
		path: closure([...always, ...nodes.map((n) => key(`client-optimized/nodes/${n}.js`))]),
		limit: LIMIT,
		gzip: true
	};
});
