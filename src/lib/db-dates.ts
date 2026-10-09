import type { CalendarDate } from "#/lib/calendar-date";

/** Prisma returns `@db.Date` columns as a Date at 00:00 UTC; the app uses `YYYY-MM-DD` strings. */
export function fromDbDate(value: Date): CalendarDate {
	return value.toISOString().slice(0, 10);
}

export function toDbDate(value: CalendarDate): Date {
	return new Date(`${value}T00:00:00.000Z`);
}
