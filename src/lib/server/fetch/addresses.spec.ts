import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './addresses.ts';
import { checkUrl, FetchRefused, pickAddress } from './safe.ts';

describe('isPublicAddress', () => {
	it.each([
		'127.0.0.1',
		'127.255.255.254',
		'0.0.0.0',
		'0.1.2.3',
		'10.0.0.1',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'169.254.169.254',
		'169.254.0.1',
		'100.64.0.1',
		'100.127.255.255',
		'192.0.0.8',
		'192.0.2.1',
		'198.18.0.1',
		'198.51.100.1',
		'203.0.113.1',
		'224.0.0.1',
		'239.255.255.255',
		'240.0.0.1',
		'255.255.255.255',
		'::1',
		'::',
		'[::1]',
		'fc00::1',
		'fd12:3456::1',
		'fe80::1',
		'fe80::1%eth0',
		'ff02::1',
		'::ffff:7f00:1',
		'::ffff:127.0.0.1',
		'::ffff:8.8.8.8',
		'::127.0.0.1',
		'64:ff9b::7f00:1',
		'64:ff9b::808:808',
		'64:ff9b:1::1',
		'2001::1',
		'2001:db8::1',
		'2002:7f00:1::1',
		'not-an-ip',
		''
	])('refuses %s', (address) => {
		expect(isPublicAddress(address)).toBe(false);
	});

	it.each([
		'8.8.8.8',
		'93.184.216.34',
		'1.1.1.1',
		'172.32.0.1',
		'100.128.0.1',
		'2606:4700::1111',
		'2a00:1450::1'
	])('allows %s', (address) => {
		expect(isPublicAddress(address)).toBe(true);
	});
});

describe('checkUrl (a): before any connection', () => {
	// Every form the plan's SSRF list names. The WHATWG parser normalises them; the check must read the result.
	it.each([
		['http://127.0.0.1/', '127.0.0.1'],
		['http://2130706433/', '127.0.0.1'],
		['http://0x7f000001/', '127.0.0.1'],
		['http://0177.0.0.1/', '127.0.0.1'],
		['http://127.1/', '127.0.0.1'],
		['http://[::1]/', '[::1]'],
		['http://[::ffff:127.0.0.1]/', '[::ffff:7f00:1]'],
		['http://169.254.169.254/latest/meta-data/', '169.254.169.254'],
		['http://10.0.0.1/', '10.0.0.1'],
		['http://0/', '0.0.0.0'],
		['http://[::]/', '[::]'],
		['http://[fe80::1]/', '[fe80::1]'],
		['https://192.168.0.1/', '192.168.0.1'],
		['http://localhost/', 'localhost'],
		['http://api.localhost/', 'api.localhost']
	])('refuses %s (host %s)', (input, host) => {
		const url = new URL(input);
		expect(url.hostname).toBe(host);
		expect(() => checkUrl(url)).toThrow(FetchRefused);
	});

	it.each([
		'ftp://example.com/',
		'file:///etc/passwd',
		'data:text/html,hi',
		'javascript:alert(1)',
		'gopher://example.com/'
	])('refuses the scheme of %s', (input) => {
		expect(() => checkUrl(new URL(input))).toThrow(/only http and https/);
	});

	it.each([
		'http://example.com:8080/',
		'https://example.com:22/',
		'http://example.com:443/',
		'https://example.com:80/'
	])('only ports 80 and 443: %s', (input) => {
		// 443 on http and 80 on https are still ports 443 and 80, so those two pass.
		const allowed = input.endsWith(':443/') || input.endsWith(':80/');
		if (allowed) expect(() => checkUrl(new URL(input))).not.toThrow();
		else expect(() => checkUrl(new URL(input))).toThrow(/port/);
	});

	it('lets a public URL through', () => {
		expect(() => checkUrl(new URL('https://example.com/a?b=c'))).not.toThrow();
		expect(() => checkUrl(new URL('http://93.184.216.34/'))).not.toThrow();
	});
});

describe('pickAddress (b): every resolved address checked', () => {
	const resolver = (table: Record<string, string[]>) => async (host: string) => {
		const answer = table[host];
		if (!answer) throw new Error(`ENOTFOUND ${host}`);
		return answer;
	};

	it('refuses 127.0.0.1.nip.io, which resolves to loopback', async () => {
		const resolve = resolver({ '127.0.0.1.nip.io': ['127.0.0.1'] });
		await expect(pickAddress('127.0.0.1.nip.io', resolve)).rejects.toThrow(FetchRefused);
	});

	it('refuses a name answering public then private (rebinding)', async () => {
		const resolve = resolver({ 'rebind.test': ['93.184.216.34', '127.0.0.1'] });
		await expect(pickAddress('rebind.test', resolve)).rejects.toThrow(/127\.0\.0\.1/);
	});

	it('refuses a name answering private then public', async () => {
		const resolve = resolver({ 'mixed.test': ['10.0.0.5', '93.184.216.34'] });
		await expect(pickAddress('mixed.test', resolve)).rejects.toThrow(FetchRefused);
	});

	it('refuses a name with an IPv4-mapped loopback answer', async () => {
		const resolve = resolver({ 'mapped.test': ['::ffff:127.0.0.1'] });
		await expect(pickAddress('mapped.test', resolve)).rejects.toThrow(FetchRefused);
	});

	it('returns the validated address for a public name', async () => {
		const resolve = resolver({ 'example.test': ['93.184.216.34', '2606:2800:220:1::1'] });
		await expect(pickAddress('example.test', resolve)).resolves.toBe('93.184.216.34');
	});

	it('checks an IP literal without resolving it', async () => {
		let asked = 0;
		const resolve = async () => {
			asked++;
			return ['93.184.216.34'];
		};
		await expect(pickAddress('127.0.0.1', resolve)).rejects.toThrow(FetchRefused);
		await expect(pickAddress('[::1]', resolve)).rejects.toThrow(FetchRefused);
		expect(asked).toBe(0);
	});
});
