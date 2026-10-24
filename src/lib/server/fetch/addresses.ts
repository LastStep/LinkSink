import { BlockList, isIP } from 'node:net';

/**
 * Which IP addresses the fetcher may connect to: only public unicast ones.
 *
 * IPv4: everything except the private, loopback, link-local (169.254.169.254, the cloud metadata address), CGNAT,
 * "this network", benchmarking, documentation, IETF protocol, multicast and reserved ranges.
 *
 * IPv6: only global unicast (2000::/3) is allowed at all, which already refuses ::1, ::, fc00::/7, fe80::/10,
 * ff00::/8, IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64 (64:ff9b::/96, 64:ff9b:1::/48) forms.
 * Inside 2000::/3, Teredo, 6to4 (which embed an IPv4 address), ORCHID and documentation ranges are refused too.
 */
const denied = new BlockList();
for (const [net, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.88.99.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4]
] as const) {
	denied.addSubnet(net, prefix, 'ipv4');
}

const globalUnicast = new BlockList();
globalUnicast.addSubnet('2000::', 3, 'ipv6');

const deniedV6 = new BlockList();
for (const [net, prefix] of [
	['2001::', 32], // Teredo (embeds an obfuscated IPv4 address)
	['2001:2::', 48], // benchmarking
	['2001:10::', 28], // ORCHID
	['2001:20::', 28], // ORCHIDv2
	['2001:db8::', 32], // documentation
	['2002::', 16], // 6to4 (embeds an IPv4 address)
	['3fff::', 20] // documentation
] as const) {
	deniedV6.addSubnet(net, prefix, 'ipv6');
}

/** Strips the brackets a URL puts round an IPv6 host. */
export function unbracket(host: string): string {
	return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** True only for a public unicast address; false for anything denied, and for anything that is not an IP. */
export function isPublicAddress(address: string): boolean {
	const ip = unbracket(address);
	const family = isIP(ip);
	if (family === 4) return !denied.check(ip, 'ipv4');
	if (family === 6) {
		if (ip.includes('%')) return false; // a zone id: link-local by definition
		return globalUnicast.check(ip, 'ipv6') && !deniedV6.check(ip, 'ipv6');
	}
	return false;
}
