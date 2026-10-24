import type { Media } from '../../fields.ts';

export interface MediaEvidence {
	/** The link's URL after redirects (or as saved, when the page could not be fetched). */
	url: string;
	contentType?: string | null;
	ogType?: string | null;
	oembedType?: string | null;
}

const EXTENSIONS: [RegExp, Media][] = [
	[/\.pdf$/, 'pdf'],
	[/\.(png|jpe?g|gif|webp|avif|svg|bmp|heic)$/, 'image'],
	[/\.(mp4|webm|mov|m4v)$/, 'video'],
	[/\.(mp3|m4a)$/, 'podcast']
];

// github.com/<first segment> pages that are not an owner.
const GITHUB_NOT_OWNERS = new Set([
	'about',
	'apps',
	'collections',
	'contact',
	'customer-stories',
	'enterprise',
	'events',
	'explore',
	'features',
	'issues',
	'login',
	'marketplace',
	'new',
	'notifications',
	'orgs',
	'organizations',
	'pricing',
	'pulls',
	'search',
	'security',
	'settings',
	'signup',
	'site',
	'sponsors',
	'team',
	'topics',
	'trending'
]);

function hostIs(host: string, domain: string) {
	return host === domain || host.endsWith(`.${domain}`);
}

/** Rule 2: what the host and path alone say. */
function fromHostAndPath(url: URL): Media | null {
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	const path = url.pathname;
	const segments = path.split('/').filter(Boolean);
	if (hostIs(host, 'youtube.com')) {
		if (
			(path === '/watch' && url.searchParams.has('v')) ||
			/^\/(shorts|live|embed)\/[^/]+/.test(path)
		)
			return 'video';
	}
	if (host === 'youtu.be' && segments.length >= 1) return 'video';
	if (
		hostIs(host, 'vimeo.com') &&
		/^\d+$/.test(segments.at(-1) ?? '') &&
		host !== 'player.vimeo.com'
	)
		return 'video';
	if (host === 'player.vimeo.com' && /^\/video\/\d+/.test(path)) return 'video';
	if (
		(host === 'github.com' || host === 'www.github.com') &&
		segments.length >= 2 &&
		!GITHUB_NOT_OWNERS.has(segments[0].toLowerCase())
	)
		return 'repo';
	if ((hostIs(host, 'x.com') || hostIs(host, 'twitter.com')) && /^\/[^/]+\/status\/\d+/.test(path))
		return 'post';
	if (hostIs(host, 'reddit.com') && /^\/r\/[^/]+\/comments\/[^/]+/.test(path)) return 'post';
	if (host === 'open.spotify.com' && /^\/episode\/[^/]+/.test(path)) return 'podcast';
	if (host === 'podcasts.apple.com') return 'podcast';
	if (hostIs(host, 'arxiv.org') && /^\/(abs|pdf)\//.test(path)) return 'pdf';
	return null;
}

/**
 * The plan's six rules, first match wins: (1) the URL path's extension; (2) host and path rules; (3) the response's
 * Content-Type; (4) og:type; (5) the oEmbed type; (6) Page.
 */
export function classifyMedia(evidence: MediaEvidence): Media {
	const url = URL.parse(evidence.url);
	if (url) {
		let path = url.pathname.toLowerCase();
		try {
			path = decodeURIComponent(path);
		} catch {
			// a malformed escape: read the path as it is
		}
		for (const [pattern, media] of EXTENSIONS) if (pattern.test(path)) return media;
		const byHost = fromHostAndPath(url);
		if (byHost) return byHost;
	}
	const type = (evidence.contentType ?? '').split(';')[0].trim().toLowerCase();
	if (type === 'application/pdf') return 'pdf';
	if (type.startsWith('image/')) return 'image';
	if (type.startsWith('video/')) return 'video';
	if (type.startsWith('audio/')) return 'podcast';
	const og = (evidence.ogType ?? '').trim().toLowerCase();
	if (og.startsWith('video')) return 'video';
	if (og === 'article') return 'article';
	if (og.startsWith('music')) return 'podcast';
	const oembed = (evidence.oembedType ?? '').trim().toLowerCase();
	if (oembed === 'video') return 'video';
	if (oembed === 'photo') return 'image';
	return 'page';
}
