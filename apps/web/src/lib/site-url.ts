/**
 * Public base URL of the panel.
 *
 * Never derive this from the incoming request: behind Traefik the request's
 * origin is the container's internal address (`localhost:3000`), so links built
 * from it dead-end on the user's own machine.
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}
