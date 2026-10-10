import { useState } from "react";

import { Input } from "#/components/ui/input";
import type { CalendarDate } from "#/lib/calendar-date";
import { dateFilterEntry } from "../transactions.logic";

/**
 * A date filter that can be typed with a keyboard. It keeps what the person is typing in its
 * own state and only reports a change once the entry is a real date or empty, so a half-typed
 * year is not thrown away when the page re-renders from the URL. It follows the URL when that
 * changes from outside (clear filters, back button).
 */
export function DateFilterInput({
	id,
	value,
	onChange,
}: {
	id: string;
	value: CalendarDate | undefined;
	onChange: (value: CalendarDate | undefined) => void;
}) {
	const [draft, setDraft] = useState<string>(value ?? "");
	const [seen, setSeen] = useState(value);
	if (value !== seen) {
		setSeen(value);
		setDraft(value ?? "");
	}

	return (
		<Input
			id={id}
			type="date"
			value={draft}
			onChange={(e) => {
				const entry = e.target.value;
				setDraft(entry);
				const decision = dateFilterEntry(entry);
				if (decision.action === "set") onChange(decision.value);
			}}
		/>
	);
}
