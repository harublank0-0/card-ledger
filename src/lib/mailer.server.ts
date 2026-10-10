import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string };

export interface Mailer {
	kind: "smtp" | "console";
	send(message: MailMessage): Promise<void>;
}

export type MailerConfig = {
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	from?: string;
	secure?: boolean;
	/**
	 * Refuse to authenticate or send unless the connection is upgraded with STARTTLS (when
	 * `secure` is false). Left undefined it is required for every relay except the loopback
	 * interface; set it to false only for a plaintext relay on a network you trust.
	 */
	requireTls?: boolean;
	production: boolean;
};

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|::1)$/i;

/**
 * Whether the SMTP connection must be encrypted. Nodemailer's default is opportunistic
 * STARTTLS: it upgrades only if the server says it can, so anyone on the path who strips that
 * capability from the greeting receives the operator's SMTP password and the reminder text in
 * the clear. Required by default; the loopback interface (a local Mailpit in development)
 * crosses no network, so it is exempt unless asked.
 */
export function shouldRequireTls(config: {
	host: string;
	secure?: boolean;
	requireTls?: boolean;
}): boolean {
	if (config.requireTls !== undefined) return config.requireTls;
	return !LOOPBACK.test(config.host.replace(/^\[|\]$/g, ""));
}

/** What the settings page may show. Never includes credentials. */
export function mailTransportKind(
	config: Pick<MailerConfig, "host" | "production">,
): "smtp" | "console" | "disabled" {
	if (config.host) return "smtp";
	return config.production ? "disabled" : "console";
}

/**
 * Email is optional. With SMTP configured it sends through the operator's server (Mailpit in
 * development). Without it, development logs a one-line summary; production returns null and
 * callers disable reminders. Nothing here contacts any Card Ledger service.
 */
export function createMailer(config: MailerConfig): Mailer | null {
	const kind = mailTransportKind(config);
	if (kind === "disabled") return null;

	if (kind === "console") {
		return {
			kind,
			async send(message) {
				// Subject only: bodies can contain financial details.
				console.log(
					`[mail:console] to=${message.to} subject="${message.subject}"`,
				);
			},
		};
	}

	if (!config.from) {
		throw new Error("SMTP_FROM is required when SMTP_HOST is set");
	}
	const transport = nodemailer.createTransport({
		host: config.host,
		port: config.port ?? (config.secure ? 465 : 587),
		secure: config.secure ?? false,
		requireTLS: shouldRequireTls({
			host: config.host as string,
			secure: config.secure,
			requireTls: config.requireTls,
		}),
		auth:
			config.user && config.password
				? { user: config.user, pass: config.password }
				: undefined,
	});
	return {
		kind,
		async send(message) {
			await transport.sendMail({ from: config.from, ...message });
		},
	};
}
