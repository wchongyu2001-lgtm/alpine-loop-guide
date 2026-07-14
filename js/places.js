/* Place enrichment: designed as a Google Places proxy via trips-sync, but the
   /place endpoint was never built (needs a paid Places API key — deliberately
   skipped). Short-circuited to the graceful path: callers get null and keep
   the free Wikipedia photos. Restore the proxy fetch if a key ever lands. */

export async function enrich(name, ll) {
  return null;
}
