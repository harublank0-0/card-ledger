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
import { errorClass, logger } from "#/lib/logger.server";
import { createMailer } from "#/lib/mailer.server";

async function main() {
	const mailer = createMailer({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		user: env.SMTP_USER,
		password: env.SMTP_PASSWORD,
		from: env.SMTP_FROM,
		secure: env.SMTP_SECURE,
		requireTls: env.SMTP_REQUIRE_TLS,
		production: process.env.NODE_ENV === "production",
	});

	if (!mailer) {
		logger.info("reminders disabled: SMTP_HOST is not configured");
		return;
	}

	const summary = await runReminders({
		mailer,
		settingsUrl: new URL("/settings", env.BETTER_AUTH_URL).toString(),
	});
	logger.info("reminder run finished", { transport: mailer.kind, ...summary });
	if (summary.failed > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		logger.error("reminder run failed", { error: errorClass(error) });
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
