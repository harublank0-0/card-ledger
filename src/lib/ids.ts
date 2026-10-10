import { z } from "zod";

const uuid = z.uuid();

/**
 * Whether a URL segment can be a row id. Loaders check this before calling a server function,
 * so `/cards/abc` is "not found" rather than a validation failure from the server.
 */
export function isUuid(value: string): boolean {
	return uuid.safeParse(value).success;
}
