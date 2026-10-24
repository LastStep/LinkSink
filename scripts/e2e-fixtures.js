// A local stand-in for a website, for the e2e tests (never the internet): one article page with a preview image and
// an icon. The e2e server lets the fetch guard reach this one address and port (TEST_ONLY_FETCH_ALLOW).
import { createServer } from 'node:http';
import sharp from 'sharp';

const solid = (width, height, background) =>
	sharp({ create: { width, height, channels: 3, background } })
		.png()
		.toBuffer();

export async function startFixtureSite(port) {
	const lead = await solid(1200, 630, { r: 40, g: 90, b: 200 });
	const icon = await solid(32, 32, { r: 220, g: 60, b: 40 });
	const page = `<!doctype html><html><head><meta charset="utf-8">
<title>Fixture article for LinkSink</title>
<meta property="og:title" content="Fixture article for LinkSink">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Fixture Site">
<meta property="og:description" content="A page served by the e2e fixture site.">
<meta property="og:image" content="/lead.png">
<link rel="icon" href="/icon.png" sizes="32x32">
</head><body><p>Fixture.</p></body></html>`;
	const server = createServer((req, res) => {
		if (req.url === '/article.html') {
			// A little slow, like a real site: the row shows its hostname first.
			setTimeout(
				() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page),
				800
			);
		} else if (req.url === '/lead.png')
			res.writeHead(200, { 'content-type': 'image/png' }).end(lead);
		else if (req.url === '/icon.png') res.writeHead(200, { 'content-type': 'image/png' }).end(icon);
		else res.writeHead(404, { 'content-type': 'text/plain' }).end('not here');
	});
	await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
	return server;
}
