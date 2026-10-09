/**
 * Calendar dates are plain `YYYY-MM-DD` strings with no time zone. They are used for
 * business dates (renewals, due dates, expiry). Arithmetic never goes through the
 * server's local time zone, so results are identical everywhere.
 */
export type CalendarDate = string;

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number) {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number) {
	if (month === 2) return isLeapYear(year) ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidCalendarDate(value: string): value is CalendarDate {
	const match = PATTERN.exec(value);
	if (!match) return false;
	const [year, month, day] = [
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
	];
	return (
		year >= 1900 &&
		month >= 1 &&
		month <= 12 &&
		day >= 1 &&
		day <= daysInMonth(year, month)
	);
}

export function parseCalendarDate(value: CalendarDate) {
	if (!isValidCalendarDate(value)) {
		throw new Error(`Invalid calendar date: ${value}`);
	}
	return {
		year: Number(value.slice(0, 4)),
		month: Number(value.slice(5, 7)),
		day: Number(value.slice(8, 10)),
	};
}

export function formatCalendarDate(year: number, month: number, day: number) {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Add whole months, clamping the day to the target month's length (Jan 31 + 1 = Feb 28/29). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
	const { year, month, day } = parseCalendarDate(date);
	const index = year * 12 + (month - 1) + months;
	const newYear = Math.floor(index / 12);
	const newMonth = (index % 12) + 1;
	return formatCalendarDate(
		newYear,
		newMonth,
		Math.min(day, daysInMonth(newYear, newMonth)),
	);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
	const { year, month, day } = parseCalendarDate(date);
	const moved = new Date(Date.UTC(year, month - 1, day + days));
	return formatCalendarDate(
		moved.getUTCFullYear(),
		moved.getUTCMonth() + 1,
		moved.getUTCDate(),
	);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffInDays(from: CalendarDate, to: CalendarDate) {
	const a = parseCalendarDate(from);
	const b = parseCalendarDate(to);
	return Math.round(
		(Date.UTC(b.year, b.month - 1, b.day) -
			Date.UTC(a.year, a.month - 1, a.day)) /
			86_400_000,
	);
}

/** Calendar months from `from` to `to`, ignoring the day of month. */
export function diffInMonthIndex(from: CalendarDate, to: CalendarDate) {
	const a = parseCalendarDate(from);
	const b = parseCalendarDate(to);
	return (b.year - a.year) * 12 + (b.month - a.month);
}

/** ISO-style ordering: negative if a < b, 0 if equal, positive if a > b. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** The current calendar date in an IANA time zone, e.g. "Asia/Kathmandu". */
export function todayIn(
	timeZone: string,
	now: Date = new Date(),
): CalendarDate {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidTimeZone(timeZone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone });
		return true;
	} catch {
		return false;
	}
}
