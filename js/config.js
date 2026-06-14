// App config. Safe to commit: the Google Maps key is a *browser* key restricted by HTTP
// referrer to this site's domain, so exposing it here is the standard, intended setup.
//
// To turn on the embedded Google Maps interface:
//   1. Google Cloud Console -> create/select a project -> enable "Maps JavaScript API".
//   2. APIs & Services -> Credentials -> Create credentials -> API key.
//   3. Restrict the key:
//        Application restrictions -> Websites -> add these referrers:
//          https://wchongyu2001-lgtm.github.io/*
//          http://localhost:*       (for local testing)
//        API restrictions -> restrict to "Maps JavaScript API".
//   4. Paste the key between the quotes below and commit/deploy.
//
// Until a key is set, the Map view falls back to the existing Leaflet/OpenStreetMap map,
// so nothing breaks.
export const MAPS_KEY = '';
