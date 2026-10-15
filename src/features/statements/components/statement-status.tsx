import { StatusBadge, type Tone } from "#/components/feedback";
import type { StatementStatus } from "../statements.logic";
import { statusLabel } from "../statements.logic";

/** An unpaid statement due within this many days is shown as a warning. */
export const DUE_SOON_DAYS = 7;

export function statementTone(input: {
	status: StatementStatus;
	daysUntilDue: number;
	paidMinor: number;
}): Tone {
	const { tone } = statusLabel(input);
	if (tone !== "neutral") return tone;
	return input.daysUntilDue <= DUE_SOON_DAYS ? "warning" : "neutral";
}

/** "Paid", "Due in 3 days", "Overdue by 2 days": words first, colour and icon as support. */
export function StatementStatusBadge({
	statement,
}: {
	statement: {
		status: StatementStatus;
		daysUntilDue: number;
		paidMinor: number;
	};
}) {
	return (
		<StatusBadge tone={statementTone(statement)}>
			{statusLabel(statement).label}
		</StatusBadge>
	);
}
