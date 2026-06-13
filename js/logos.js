/* Brand logos: airline logo by IATA code for flights, provider logo by domain
   for everything else. Returns an <img> that removes itself on load failure so
   the card's existing type icon stays visible (no broken-image box). */
import { esc, iataFromFlight, airlineLogoUrl, brandDomain, brandLogoUrl } from './core.js';

export function logoImg(booking) {
  let src = null;
  if (booking.type === 'flight') {
    const ia = iataFromFlight(booking.flight || booking.title);
    if (ia) src = airlineLogoUrl(ia);
  }
  if (!src) {
    const d = brandDomain(booking.provider || booking.title);
    if (d) src = brandLogoUrl(d);
  }
  return src ? `<img class="brandlogo" alt="" loading="lazy" src="${esc(src)}" onerror="this.remove()">` : '';
}
