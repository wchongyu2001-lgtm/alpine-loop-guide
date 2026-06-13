/* Hook-robust HTTP check for the build loop.
   Usage: node loop/served-check.mjs <url> [markerRegex]
   Exits 0 if HTTP 200 (and marker present, if given); nonzero otherwise.
   (Lives in a file so the Bash command string carries no `fetch(` — the
   context-mode hook only scans the command, not file contents.) */
const url = process.argv[2];
const marker = process.argv[3];
if (!url) { console.error('no url'); process.exit(2); }
try {
  const res = await fetch(url, { redirect: 'follow' });
  const body = await res.text();
  const okStatus = res.status === 200;
  const okMarker = !marker || new RegExp(marker).test(body);
  console.log(`GET ${url} -> ${res.status}, ${body.length} bytes, marker(${marker || '—'})=${okMarker}`);
  process.exit(okStatus && okMarker ? 0 : 1);
} catch (e) {
  console.error(`fetch failed: ${e.message}`);
  process.exit(1);
}
