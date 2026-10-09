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
	production: boolean;
};

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
