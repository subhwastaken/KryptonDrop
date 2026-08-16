// Client-safe World ID config. Only NEXT_PUBLIC_* values — safe to ship to the browser.
// The IDKit widget needs the app_id; the rp_context (signed server-side) carries the rest.
export const WORLD_APP_ID = (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "") as `app_${string}`;
