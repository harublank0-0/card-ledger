/** Seeded once for each new user; they can rename or archive them freely. */
export const DEFAULT_CATEGORY_NAMES = [
	"Groceries",
	"Dining",
	"Transport",
	"Bills & Utilities",
	"Subscriptions",
	"Shopping",
	"Health",
	"Entertainment",
	"Travel",
	"Education",
	"Other",
] as const;

/** The category suggested when recording a subscription charge. */
export const SUBSCRIPTIONS_CATEGORY_NAME = "Subscriptions";

export const MAX_CATEGORY_NAME_LENGTH = 40;

/** Trim and collapse inner whitespace so "  Eating   out " and "Eating out" match. */
export function normalizeCategoryName(name: string) {
	return name.trim().replace(/\s+/g, " ");
}

export function sameCategoryName(a: string, b: string) {
	return (
		normalizeCategoryName(a).toLocaleLowerCase() ===
		normalizeCategoryName(b).toLocaleLowerCase()
	);
}
