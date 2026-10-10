/**
 * Fills the database with SYNTHETIC demo data for development, screenshots and evaluation.
 *
 *   npm run db:seed
 *
 * It (re)creates one account, demo@card-ledger.test, with invented cards, subscriptions,
 * transactions and statements, and prints a freshly generated password once. Running it
 * again replaces that account's data and nothing else. It refuses to run in production
 * unless SEED_ALLOW_PRODUCTION=true.
 */
import { prisma } from "#/db";
import { env } from "#/env";
import {
	DEMO_EMAIL,
	assertSeedAllowed,
	buildDemoData,
} from "#/features/demo/demo-data";
import {
	applyDemoData,
	createDemoUser,
	generateDemoPassword,
} from "#/features/demo/demo.service.server";
import { todayIn } from "#/lib/calendar-date";

async function main() {
	assertSeedAllowed({
		nodeEnv: process.env.NODE_ENV,
		allowProduction: process.env.SEED_ALLOW_PRODUCTION === "true",
	});

	const today = todayIn(env.DEFAULT_TIMEZONE);
	const password = generateDemoPassword();
	const userId = await createDemoUser(password);
	const summary = await applyDemoData(userId, buildDemoData({ today }), today);

	console.log("Demo data created (synthetic, nothing here is real).");
	console.log(
		`  ${summary.cards} cards, ${summary.subscriptions} subscriptions, ${summary.transactions} transactions, ${summary.statements} statements, ${summary.payments} payments`,
	);
	console.log("Sign in with:");
	console.log(`  email:    ${DEMO_EMAIL}`);
	console.log(`  password: ${password}`);
	console.log("The password is generated on every run and is not stored anywhere.");
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
