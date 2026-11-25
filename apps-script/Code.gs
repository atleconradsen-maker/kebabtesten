/**
 * Kebabtesten – mottaker for «Legg inn test»-siden.
 *
 * Limes inn i regnearket «Kebabtesten – tester» under Utvidelser → Apps Script.
 * Publiseres som nettapp: Utfør som «Meg», Tilgang «Alle».
 */
const BILDE_MAPPE_ID = '19XtfpZtR_9CSl4mOpMWhAPOHvvrKQtt6'; // Drive: Kebabtesten/Bilder
const HEADER_RAD = 2; // rad med kolonnenavn (rad 1 er gruppeoverskriftene)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'like') return like(data);

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ark = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      const kolonner = ark.getRange(HEADER_RAD, 1, 1, ark.getLastColumn()).getValues()[0]
        .map(h => String(h).trim().toLowerCase());
      const kol = navn => kolonner.indexOf(navn.toLowerCase());

      const t = data.test || {};
      let sted = tekst(t.sted, 80);
      let adresse = tekst(t.adresse, 120);
      if (!sted) return svar({ ok: false, feil: 'Mangler sted' });

      // Samme sted skal alltid skrives likt: bruk skrivemåten som allerede står i arket,
      // og fyll inn adressen på tidligere rader hvis den manglet.
      const stedKol = kol('Sted'), adrKol = kol('Adresse');
      const forste = HEADER_RAD + 1, antall = Math.max(0, ark.getLastRow() - HEADER_RAD);
      if (stedKol >= 0 && antall > 0) {
        const steder = ark.getRange(forste, stedKol + 1, antall, 1).getValues().map(r => String(r[0]).trim());
        const adresser = adrKol >= 0 ? ark.getRange(forste, adrKol + 1, antall, 1).getValues().map(r => String(r[0]).trim()) : [];
        const n = stedNokkel(sted);
        const treff = steder.map((v, i) => i).filter(i => steder[i] && stedNokkel(steder[i]) === n);
        if (treff.length) {
          sted = steder[treff[0]];
          const kjent = treff.map(i => adresser[i]).find(a => a);
          if (kjent) adresse = kjent;
          else if (adresse && adrKol >= 0) treff.forEach(i => ark.getRange(forste + i, adrKol + 1).setValue(adresse));
        }
      }
      const testere = (data.testere || []).filter(p => tekst(p.navn, 40));
      if (!testere.length) return svar({ ok: false, feil: 'Legg inn minst én testperson' });

      const stamp = Utilities.formatDate(new Date(), 'Europe/Oslo', 'yyyyMMdd-HHmm');
      const bildeKebab = lagreBilde(data.bildeKebab, `${sted} – kebab ${stamp}`);
      const bildeSjappa = lagreBilde(data.bildeSjappa, `${sted} – sjappa ${stamp}`);

      const rader = testere.map((p, i) => {
        const rad = new Array(kolonner.length).fill('');
        const sett = (navn, verdi) => { const k = kol(navn); if (k >= 0 && verdi !== '' && verdi != null) rad[k] = verdi; };
        sett('Dato', tekst(t.dato, 12));
        sett('Sted', sted);
        sett('Adresse', adresse);
        sett('Hva', tekst(t.hva, 40));
        sett('Servert som', tekst(t.servert, 40));
        sett('Pris (kr)', tall(t.pris, 0, 10000));
        sett('Sterkhet (1-5)', tall(t.sterkhet, 0, 5));
        sett('Brødtype', ['Hjemmelaget', 'Butikkbrød'].includes(t.brodtype) ? t.brodtype : '');
        sett('Testperson', tekst(p.navn, 40));
        sett('Kjøtt', tall(p.kjott, 1, 10));
        sett('Saus', tall(p.saus, 1, 10));
        sett('Fyll', tall(p.fyll, 1, 10));
        sett('Porsjon', tall(p.porsjon, 1, 10));
        sett('Pris/verdi', tall(p.verdi, 1, 10));
        sett('Brød', tall(p.brod, 1, 10));
        sett('Kommentar', tekst(p.kommentar, 300));
        if (i === 0) { sett('Bilde kebab', bildeKebab); sett('Bilde sjappa', bildeSjappa); }
        return rad;
      });

      const start = Math.max(ark.getLastRow() + 1, HEADER_RAD + 1);
      const datoKol = kol('Dato');
      if (datoKol >= 0) ark.getRange(start, datoKol + 1, rader.length, 1).setNumberFormat('@'); // dato som tekst
      ark.getRange(start, 1, rader.length, kolonner.length).setValues(rader);
      return svar({ ok: true, rader: rader.length });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return svar({ ok: false, feil: String(err && err.message || err) });
  }
}

// 👍 på kommentarer: ett trykk legger til, ett til fjerner. Én like per navn per kommentar.
function like(data) {
  const id = tekst(data.id, 40), fra = tekst(data.fra, 40);
  if (!/^k[a-z0-9]+$/.test(id) || !fra) return svar({ ok: false, feil: 'Mangler kommentar eller navn' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let ark = ss.getSheetByName('Likes');
    if (!ark) { ark = ss.insertSheet('Likes'); ark.appendRow(['Tid', 'Kommentar-ID', 'Fra']); }
    const n = ark.getLastRow() - 1;
    const rader = n > 0 ? ark.getRange(2, 1, n, 3).getValues() : [];
    const i = rader.findIndex(r => String(r[1]) === id && String(r[2]).toLowerCase() === fra.toLowerCase());
    if (i >= 0) ark.deleteRow(i + 2);
    else {
      const rad = ark.getLastRow() + 1;
      ark.getRange(rad, 1, 1, 3).setNumberFormat('@').setValues([[Utilities.formatDate(new Date(), 'Europe/Oslo', 'yyyy-MM-dd HH:mm'), id, fra]]);
    }
    return svar({ ok: true, liked: i < 0 });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // Reserve for oppslag i Brønnøysundregistrene hvis nettleseren ikke får lov til å spørre direkte.
  const p = (e && e.parameter) || {};
  if (p.action === 'brreg') {
    const lov = ['navn', 'naeringskode', 'size', 'beliggenhetsadresse.postnummer', 'beliggenhetsadresse.adresse'];
    const qs = lov.filter(k => p[k]).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(p[k]).slice(0, 120))).join('&');
    const r = UrlFetchApp.fetch('https://data.brreg.no/enhetsregisteret/api/underenheter?' + qs, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    return ContentService.createTextOutput(r.getContentText()).setMimeType(ContentService.MimeType.JSON);
  }
  return svar({ ok: true, melding: 'Kebabtesten-mottakeren kjører.' });
}

function lagreBilde(dataUrl, navn) {
  if (!dataUrl) return '';
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl));
  if (!m) return '';
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 8 * 1024 * 1024) return '';
  const blob = Utilities.newBlob(bytes, m[1], navn + (m[1] === 'image/png' ? '.png' : '.jpg'));
  const fil = DriveApp.getFolderById(BILDE_MAPPE_ID).createFile(blob);
  return fil.getUrl();
}

function stedNokkel(navn) {
  return String(navn || '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function tekst(v, maks) {
  // Fjerner tegn som kan få Sheets til å tolke teksten som en formel
  return String(v == null ? '' : v).trim().replace(/^[=+\-@]+/, '').slice(0, maks);
}
function tall(v, min, maks) {
  const n = Number(String(v == null ? '' : v).replace(',', '.'));
  if (v === '' || v == null || !isFinite(n)) return '';
  return Math.min(maks, Math.max(min, n));
}
function svar(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
