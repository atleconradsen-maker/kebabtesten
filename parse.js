// Kebabtesten – leser regnearket (én rad per testperson) og regner ut scorer.
// Total = 80 % kebab + 20 % brød. Kebab = snitt av kjøtt, saus, fyll, porsjon og pris/verdi.
(function (root) {
  const W_KEBAB = 0.8, W_BREAD = 0.2;

  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  // Google Visualization JSON table -> rows (header first)
  function gvizToRows(table) {
    const head = (table.cols || []).map(c => c.label || '');
    const body = (table.rows || []).map(r => (r.c || []).map(c => {
      if (!c || c.v == null) return '';
      if (typeof c.v === 'number') return c.v;
      if (typeof c.v === 'string' && /^Date\(/.test(c.v)) return c.v; // keep raw date
      return String(c.v);
    }));
    return [head, ...body].filter((r, i) => i === 0 || r.some(v => String(v).trim() !== ''));
  }

  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå/]+/g, ' ').trim();
  function toNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\s|kr/gi, '');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? n : null;
  }
  const score = v => { const n = toNum(v); return n == null ? null : Math.min(10, Math.max(1, n)); };
  const avg = a => { const x = a.filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };

  // Returns ISO yyyy-mm-dd or ''
  function parseDate(v) {
    if (v == null || v === '') return '';
    let m;
    const s = String(v).trim();
    if ((m = /^Date\((\d{4}),(\d{1,2}),(\d{1,2})/.exec(s))) return iso(+m[1], +m[2] + 1, +m[3]);
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(s))) return iso(new Date().getFullYear(), +m[2], +m[1]); // "24.11" = i år
    if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s))) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      // Norwegian dd.mm.yyyy; US m/d/yyyy only if "/" and first > 12 impossible
      return s.includes('/') && +m[2] > 12 ? iso(y, +m[1], +m[2]) : iso(y, +m[2], +m[1]);
    }
    if (typeof v === 'number' && v > 30000 && v < 80000) { // Sheets serial date
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return '';
  }
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  function imageUrl(v) {
    const s = String(v || '').trim();
    if (!/^https?:\/\//i.test(s)) return null;
    const m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{20,})/i.exec(s) || /[?&]id=([\w-]{20,})/.exec(s);
    if (m && /google\./i.test(s)) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
    return s.slice(0, 1000);
  }

  // Samme sted uansett store/små bokstaver, mellomrom, bindestrek og aksenter
  function placeKey(name) {
    return String(name || '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({length: n + 1}, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // true når to navn trolig er samme sted skrevet litt ulikt
  function similarPlace(a, b) {
    const x = placeKey(a), y = placeKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))) return true;
    return lev(x, y) <= Math.max(1, Math.floor(Math.max(x.length, y.length) / 6));
  }

  const FIELDS = {
    date: ['dato', 'date'],
    place: ['sted', 'kebabsjappa', 'sjappa', 'restaurant'],
    address: ['adresse', 'address'],
    what: ['hva', 'hva spiste dere', 'kjotttype', 'type kebab'],
    served: ['servert som', 'servering', 'type'],
    price: ['pris kr', 'pris', 'pris i kr'],
    heat: ['sterkhet 1 5', 'sterkhet', 'styrke'],
    breadType: ['brodtype', 'brød type', 'brødtype', 'type brod'],
    tester: ['testperson', 'tester', 'navn', 'dommer'],
    meat: ['kjott', 'kjøtt'],
    sauce: ['saus'],
    fill: ['fyll', 'fyll gront', 'gront'],
    portion: ['porsjon'],
    value: ['pris/verdi', 'verdi', 'pris score', 'value'],
    bread: ['brod', 'brød', 'brod score'],
    notes: ['kommentar', 'notat'],
    imgKebab: ['bilde kebab', 'bilde av kebab', 'bilde'],
    imgShop: ['bilde sjappa', 'bilde av sjappa', 'bilde sted'],
    city: ['by', 'kommune'],
    country: ['land'],
    lat: ['lat', 'breddegrad'],
    lon: ['lon', 'lengdegrad'],
    currency: ['valuta']
  };
  const CATS = ['meat', 'sauce', 'fill', 'portion', 'value'];
  const SHARED = ['date', 'place', 'address', 'what', 'served', 'price', 'heat', 'breadType', 'city', 'country', 'lat', 'lon', 'currency'];

  function parseRows(rows) {
    if (!rows.length) return { tests: [] };
    const head = rows[0].map(norm);
    const idx = {};
    const used = new Set();
    // exact matches first, so "pris (kr)" and "pris/verdi" don't collide
    for (const [k, names] of Object.entries(FIELDS)) {
      const ns = names.map(norm);
      // exact header, or a grouped header like "Score kebab 1 10 Kjøtt" (gviz joins header rows)
      let i = head.findIndex((h, j) => !used.has(j) && ns.includes(h));
      if (i < 0) i = head.findIndex((h, j) => !used.has(j) && ns.some(n => h.endsWith(' ' + n)));
      if (i >= 0) { idx[k] = i; used.add(i); }
    }
    const get = (r, k) => idx[k] != null ? r[idx[k]] : '';

    const tests = new Map();
    const places = new Map();
    let prev = null;
    rows.slice(1).forEach((r, n) => {
      const cur = {};
      for (const k of SHARED) cur[k] = get(r, k);
      // A row without "Sted" belongs to the test above (fill-down)
      const isNew = String(cur.place || '').trim() !== '';
      if (!isNew && !prev) return;
      const base = isNew ? cur : prev;
      if (isNew) prev = cur;
      const date = parseDate(base.date);
      const rawPlace = String(base.place).trim().slice(0, 80);
      const pk = placeKey(rawPlace);
      if (!places.has(pk)) places.set(pk, { name: rawPlace, address: '', city: '', country: '', lat: null, lon: null });
      const pinfo = places.get(pk);
      const addr = String(base.address || '').trim();
      if (addr && !pinfo.address) pinfo.address = addr.slice(0, 120);
      if (!pinfo.city && String(base.city || '').trim()) pinfo.city = String(base.city).trim().slice(0, 60);
      if (!pinfo.country && String(base.country || '').trim()) pinfo.country = String(base.country).trim().slice(0, 60);
      const la = toNum(base.lat), lo = toNum(base.lon);
      if (pinfo.lat == null && la != null && lo != null && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { pinfo.lat = la; pinfo.lon = lo; }
      const place = pinfo.name;
      // Mangler datoen (f.eks. tolket som tall i arket), hør til siste test på samme sted
      let key = (date || 'u' + n) + '|' + pk;
      if (!date) { const same = [...tests.keys()].reverse().find(k => k.endsWith('|' + pk)); if (same) key = same; }
      if (!tests.has(key)) {
        tests.set(key, {
          id: 't' + (n + 2), date, place, placeKey: pk,
          what: String(base.what || '').trim().slice(0, 40),
          served: String(base.served || '').trim().slice(0, 40),
          price: toNum(base.price),
          heat: (() => { const h = toNum(base.heat); return h == null ? null : Math.min(5, Math.max(0, Math.round(h))); })(),
          breadType: String(base.breadType || '').trim().slice(0, 40),
          currency: /^eur|€/i.test(String(base.currency || '').trim()) ? 'EUR' : 'NOK',
          notes: [], imgKebab: null, imgShop: null, scores: []
        });
      }
      const t = tests.get(key);
      // later rows may add details the first row lacked
      if (!t.what && cur.what) t.what = String(cur.what).trim();
      if (!t.breadType && cur.breadType) t.breadType = String(cur.breadType).trim();
      if (t.heat == null && toNum(cur.heat) != null) t.heat = Math.min(5, Math.max(0, Math.round(toNum(cur.heat))));
      if (t.price == null && toNum(cur.price) != null) t.price = toNum(cur.price);
      t.imgKebab = t.imgKebab || imageUrl(get(r, 'imgKebab'));
      t.imgShop = t.imgShop || imageUrl(get(r, 'imgShop'));
      const note = String(get(r, 'notes') || '').trim();
      const name = String(get(r, 'tester') || '').trim().slice(0, 40);
      if (note) t.notes.push({ name, text: note.slice(0, 300) });
      const s = { name: name || 'Anonym' };
      CATS.forEach(c => s[c] = score(get(r, c)));
      s.bread = score(get(r, 'bread'));
      s.kebab = avg(CATS.map(c => s[c]));
      if (s.kebab != null || s.bread != null) {
        s.total = combine(s.kebab, s.bread);
        t.scores.push(s);
      }
    });

    const out = [...tests.values()].map(t => {
      const cat = {};
      CATS.forEach(c => cat[c] = avg(t.scores.map(s => s[c])));
      const kebab = avg(t.scores.map(s => s.kebab));
      const bread = avg(t.scores.map(s => s.bread));
      const pi = places.get(t.placeKey) || {};
      return { ...t, address: pi.address || '', city: pi.city || '', country: pi.country || '', lat: pi.lat ?? null, lon: pi.lon ?? null, abroad: isAbroad(pi.country), cat, kebab, bread, total: combine(kebab, bread) };
    });
    // Ett sted = alle tester der samlet, uansett dato. Snittet tas over alle vurderinger (alle personer, alle besøk).
    const placeList = [...places.entries()].map(([pk, p]) => {
      const ts = out.filter(t => t.placeKey === pk).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const all = ts.flatMap(t => t.scores);
      const cat = {};
      CATS.forEach(c => cat[c] = avg(all.map(s => s[c])));
      const kebab = avg(all.map(s => s.kebab)), bread = avg(all.map(s => s.bread));
      const latest = ts[0] || {};
      return {
        key: pk, name: p.name, address: p.address, city: p.city, country: p.country, lat: p.lat, lon: p.lon, abroad: isAbroad(p.country),
        currency: latest.currency || 'NOK', tests: ts, visits: ts.length, ratings: all.length,
        cat, kebab, bread, total: combine(kebab, bread),
        what: latest.what || '', served: latest.served || '', price: latest.price ?? null, date: latest.date || '',
        breadType: (ts.map(t => t.breadType).filter(Boolean)[0]) || '',
        imgKebab: ts.map(t => t.imgKebab).find(Boolean) || null, imgShop: ts.map(t => t.imgShop).find(Boolean) || null
      };
    });
    return { tests: out, places: placeList };
  }
  function isAbroad(c) { const v = String(c || '').trim().toLowerCase(); return !!v && !['norge', 'norway', 'no', 'nor'].includes(v); }
  function combine(k, b) {
    if (k != null && b != null) return k * W_KEBAB + b * W_BREAD;
    return k != null ? k : b;
  }

  const api = { placeKey, similarPlace, parseCSV, parseRows, parseSheet: t => parseRows(parseCSV(t)), gvizToRows, parseDate, imageUrl, isAbroad, W_KEBAB, W_BREAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KTParse = api;
})(typeof self !== 'undefined' ? self : this);
