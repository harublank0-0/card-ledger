// Kept on purpose although nothing imports it yet: components.json maps shadcn's `utils` alias
// here, so `npx shadcn@latest add <component>` generates components that import `cn` from this
// file. (The components already in src/components/ui import `cn` from the `cn` package.)
import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
