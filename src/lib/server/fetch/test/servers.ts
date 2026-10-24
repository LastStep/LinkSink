import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

/** A real listener on 127.0.0.1 that counts every TCP connection made to it. The SSRF tests require zero. */
export async function startTrap() {
	const connections: Socket[] = [];
	const server = createServer((_req, res) => res.end('reached'));
	server.on('connection', (socket) => connections.push(socket));
	await listen(server);
	return {
		port: (server.address() as AddressInfo).port,
		get connections() {
			return connections.length;
		},
		reset() {
			connections.length = 0;
		},
		close: () => close(server)
	};
}

export interface Seen {
	path: string;
	headers: IncomingMessage['headers'];
}

/** A stub web server on 127.0.0.1; `handler` answers, and every request is recorded. */
export async function startStub(handler: (req: IncomingMessage, res: ServerResponse) => void) {
	const seen: Seen[] = [];
	const server = createServer((req, res) => {
		seen.push({ path: req.url ?? '', headers: req.headers });
		handler(req, res);
	});
	await listen(server);
	return {
		port: (server.address() as AddressInfo).port,
		seen,
		close: () => close(server)
	};
}

function listen(server: Server) {
	return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server: Server) {
	server.closeAllConnections();
	return new Promise<void>((resolve) => server.close(() => resolve()));
}
