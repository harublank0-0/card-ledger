import { defineMiddleware } from "nitro";
import { assertBodySize } from "nitro/h3";

/**
 * The most a request body may carry. Nothing in this application sends more than a few
 * kilobytes (the largest field is a 500-character note), so 1 MiB is generous; a bigger body is
 * refused with 413 before anything parses it.
 */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Registered in vite.config.ts as middleware for every route. It has to be middleware: errors
 * thrown from Nitro's `request` hook are only logged, not turned into a response. `assertBodySize`
 * checks Content-Length and also counts the bytes of a streamed (chunked) body, so a client that
 * sends no length cannot get past it. Requests without a body are untouched.
 */
export default defineMiddleware((event) =>
	assertBodySize(event, MAX_BODY_BYTES),
);
