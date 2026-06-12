// One-off: pull data constants out of legacy v1.html into data/*.json
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Grab `const NAME = <literal>;` by scanning with brace/bracket/string balance.
function grab(name) {
  const decl = `const ${name}=`;
  let i = src.indexOf(decl);
  if (i < 0) throw new Error(`not found: ${name}`);
  i += decl.length;
  let depth = 0, j = i, q = null;
  for (; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (q) {
      if (q === '`' && c === '`' && p !== '\\') q = null;
      else if (q !== '`' && c === q && p !== '\\') q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ';' && depth === 0) break;
  }
  return src.slice(i, j);
}

const names = ['REGION','TAG','ALPINE_DAYS','ALPINE_ORDER','ALPINE_PRESETS','ALPINE_BUD',
  'ICELAND_DAYS','ICELAND_PRESETS','ICELAND_BUD','ALPINE_META','ICELAND_META',
  'CATS','CATCOLOR','CATLABEL','ALPINE_IDEAS','ICELAND_IDEAS','CHF2EUR'];
const ctx = {
  s: (n, t, ll, d, o = {}) => Object.assign({ n, t, ll, d }, o),
  i: (title, cat, area, desc, wiki) => ({
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title, cat, area, desc, wiki: wiki || title,
  }),
};
vm.createContext(ctx);
for (const n of names) {
  ctx[n] = vm.runInContext(`(${grab(n)})`, ctx, { timeout: 5000 });
}

const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const w = (f, o) => fs.writeFileSync(path.join(dataDir, f), JSON.stringify(o, null, 1) + '\n');

w('taxonomy.json', { regions: ctx.REGION, tags: ctx.TAG, cats: ctx.CATS,
  catColors: ctx.CATCOLOR, catLabels: ctx.CATLABEL, chf2eur: ctx.CHF2EUR });
w('alpine.json', { meta: ctx.ALPINE_META, days: ctx.ALPINE_DAYS, order: ctx.ALPINE_ORDER,
  presets: ctx.ALPINE_PRESETS, budget: ctx.ALPINE_BUD, ideas: ctx.ALPINE_IDEAS });
w('iceland.json', { meta: ctx.ICELAND_META, days: ctx.ICELAND_DAYS,
  presets: ctx.ICELAND_PRESETS, budget: ctx.ICELAND_BUD, ideas: ctx.ICELAND_IDEAS });

console.log('alpine days:', ctx.ALPINE_DAYS.length, '| iceland days:', ctx.ICELAND_DAYS.length,
  '| alpine ideas:', ctx.ALPINE_IDEAS.length, '| iceland ideas:', ctx.ICELAND_IDEAS.length);
