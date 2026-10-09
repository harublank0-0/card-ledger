/**
 * Cron entry point: sends due reminder emails and exits.
 *
 *   npm run reminders:send            (development, reads .env.local)
 *   node/tsx scripts/send-reminders.ts (production, environment provided by the container)
 *
 * Safe to run as often as you like (for example hourly): each reminder is claimed in the
 * database before sending, so repeated or overlapping runs never send duplicates.
 */
import { prisma } from "#/db";
import { env } from "#/env";
import { runReminders } from "#/features/notifications/notifications.service.server";
import { createMailer } from "#/lib/mailer.server";

async function main() {
	const mailer = createMailer({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		user: env.SMTP_USER,
		password: env.SMTP_PASSWORD,
		from: env.SMTP_FROM,
		secure: env.SMTP_SECURE,
		production: process.env.NODE_ENV === "production",
	});

	if (!mailer) {
		console.log("Reminders are disabled: SMTP_HOST is not configured.");
		return;
	}

	const summary = await runReminders({
		mailer,
		settingsUrl: new URL("/settings", env.BETTER_AUTH_URL).toString(),
	});
	console.log(
		`[reminders] transport=${mailer.kind} ${JSON.stringify(summary)}`,
	);
	if (summary.failed > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error(
			"[reminders] run failed:",
			error instanceof Error ? error.message : error,
		);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
