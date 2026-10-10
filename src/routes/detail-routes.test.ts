import { describe, expect, it } from "vitest";

import { Route as card } from "./_authed/cards/$cardId";
import { Route as statement } from "./_authed/statements/$statementId";
import { Route as subscription } from "./_authed/subscriptions/$subscriptionId";
import { Route as transaction } from "./_authed/transactions/$transactionId";

// A mistyped or hand-edited id in the URL is "not found", not a validation failure from a
// server function. The loaders must decide that before calling the server.
const cases = [
	["cards/$cardId", card, "cardId"],
	["statements/$statementId", statement, "statementId"],
	["subscriptions/$subscriptionId", subscription, "subscriptionId"],
	["transactions/$transactionId", transaction, "transactionId"],
] as const;

describe.each(cases)("%s loader", (_name, route, param) => {
	it.each([
		"abc",
		"123",
		"not-a-uuid",
	])("treats %j as not found", async (value) => {
		const loader = route.options.loader as unknown as (ctx: {
			params: Record<string, string>;
		}) => Promise<unknown>;
		await expect(loader({ params: { [param]: value } })).rejects.toMatchObject({
			isNotFound: true,
		});
	});
});
