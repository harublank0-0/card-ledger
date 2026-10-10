import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createMailer, shouldRequireTls } from "./mailer.server";

describe("shouldRequireTls", () => {
	it("requires STARTTLS for a relay that is not on this machine", () => {
		for (const host of [
			"smtp.example.com",
			"10.0.0.5",
			"mail.internal",
			"mailpit",
		]) {
			expect(shouldRequireTls({ host, secure: false }), host).toBe(true);
		}
	});

	it("does not insist on it for the loopback interface, where nothing crosses a network", () => {
		for (const host of [
			"localhost",
			"127.0.0.1",
			"127.1.2.3",
			"::1",
			"[::1]",
		]) {
			expect(shouldRequireTls({ host, secure: false }), host).toBe(false);
		}
	});

	it("lets the operator decide explicitly, either way", () => {
		expect(
			shouldRequireTls({
				host: "smtp.example.com",
				secure: false,
				requireTls: false,
			}),
		).toBe(false);
		expect(
			shouldRequireTls({ host: "127.0.0.1", secure: false, requireTls: true }),
		).toBe(true);
	});
});

/** A minimal SMTP server that advertises AUTH but never STARTTLS, recording what it is sent. */
function plaintextSmtp() {
	const commands: string[] = [];
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.write("220 fake ESMTP\r\n");
		let buffer = "";
		let inData = false;
		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			for (;;) {
				const end = buffer.indexOf("\r\n");
				if (end < 0) break;
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				if (inData) {
					if (line === ".") {
						inData = false;
						socket.write("250 queued\r\n");
					}
					continue;
				}
				commands.push(line);
				const verb = line.split(" ")[0].toUpperCase();
				if (verb === "EHLO" || verb === "LHLO") {
					socket.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
				} else if (verb === "STARTTLS") {
					// What a server without TLS says; the client must treat it as fatal.
					socket.write("502 5.5.1 STARTTLS not supported\r\n");
				} else if (verb === "AUTH") {
					socket.write("235 ok\r\n");
				} else if (verb === "DATA") {
					inData = true;
					socket.write("354 go ahead\r\n");
				} else if (verb === "QUIT") {
					socket.write("221 bye\r\n");
					socket.end();
				} else {
					socket.write("250 ok\r\n");
				}
			}
		});
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => {});
	});
	return new Promise<{
		port: number;
		commands: string[];
		close: () => Promise<void>;
	}>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as net.AddressInfo;
			resolve({
				port: address.port,
				commands,
				close: () =>
					new Promise<void>((done) => {
						for (const socket of sockets) socket.destroy();
						server.close(() => done());
					}),
			});
		});
	});
}

describe("SMTP transport and STARTTLS", () => {
	let closeServer: (() => Promise<void>) | null = null;
	afterEach(async () => {
		await closeServer?.();
		closeServer = null;
	});

	const message = { to: "to@example.test", subject: "Subject", text: "Body" };
	const config = (port: number, requireTls: boolean) => ({
		host: "127.0.0.1",
		port,
		user: "operator",
		password: "app-password-1234",
		from: "Card Ledger <ledger@example.test>",
		secure: false,
		requireTls,
		production: true,
	});

	it("refuses to authenticate or send over a connection that cannot be encrypted", async () => {
		const smtp = await plaintextSmtp();
		closeServer = smtp.close;
		const mailer = createMailer(config(smtp.port, true));
		await expect(mailer?.send(message)).rejects.toThrow();

		const verbs = smtp.commands.map((c) => c.split(" ")[0].toUpperCase());
		expect(verbs).not.toContain("AUTH");
		expect(verbs).not.toContain("MAIL");
		expect(verbs).not.toContain("DATA");
		// And the password never crossed the wire.
		expect(smtp.commands.join("\n")).not.toContain("app-password-1234");
	});

	it("does send in the clear when the operator explicitly opts out", async () => {
		const smtp = await plaintextSmtp();
		closeServer = smtp.close;
		const mailer = createMailer(config(smtp.port, false));
		await mailer?.send(message);

		const verbs = smtp.commands.map((c) => c.split(" ")[0].toUpperCase());
		expect(verbs).toContain("AUTH");
		expect(verbs).toContain("MAIL");
	});
});
