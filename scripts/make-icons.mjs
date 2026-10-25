// Draws the app's PNG icons from the mark (src/lib/ui/Mark.svelte): `node scripts/make-icons.mjs` (T-0028).
// favicon-32.png: a white tile with a hairline edge and the mark in ink, for browsers that do not draw SVG icons;
// it reads on a light and on a dark tab. apple-touch-icon.png: 180 px, ink tile and white mark, square corners (the
// home screen rounds them itself and has no transparency). The SVG icon, src/lib/assets/favicon.svg, is written by hand.
import sharp from 'sharp';

const INK = '#0a0a0a';
const mark = (ink, scale, size) => {
	// The mark's own drawing, 24 units wide, centred in `size` and scaled
	const offset = (size - 24 * scale) / 2;
	return `<g transform="translate(${offset} ${offset}) scale(${scale})">
		<path d="M3 11h18a9 9 0 0 1-18 0Z" fill="${ink}"/>
		<path d="M12 10V5.5a2.5 2.5 0 0 1 5 0" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>
	</g>`;
};
const svg = (size, body) =>
	Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`
	);

const small = svg(
	32,
	`<rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="#ffffff" stroke="#c9ccd3"/>${mark(INK, 1.0, 32)}`
);
const touch = svg(
	180,
	`<rect width="180" height="180" fill="${INK}"/>${mark('#ffffff', 5.5, 180)}`
);

await sharp(small, { density: 384 }).resize(32, 32).png().toFile('static/favicon-32.png');
await sharp(touch, { density: 72 }).resize(180, 180).png().toFile('static/apple-touch-icon.png');
