/**
 * Kebabtesten – mottaker for «Legg inn test»-siden.
 *
 * Limes inn i regnearket «Kebabtesten – tester» under Utvidelser → Apps Script.
 * Publiseres som nettapp: Utfør som «Meg», Tilgang «Alle».
 *
 * Bytt PIN under før du publiserer. Siden spør om PIN-en første gang
 * man legger inn en test, så bare dere som kjenner den kan skrive til arket.
 */
const PIN = 'BYTT-MEG';
const BILDE_MAPPE_ID = '19XtfpZtR_9CSl4mOpMWhAPOHvvrKQtt6'; // Drive: Kebabtesten/Bilder
const HEADER_RAD = 2; // rad med kolonnenavn (rad 1 er gruppeoverskriftene)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (String(data.pin || '') !== PIN) return svar({ ok: false, feil: 'Feil PIN-kode' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ark = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      const kolonner = ark.getRange(HEADER_RAD, 1, 1, ark.getLastColumn()).getValues()[0]
        .map(h => String(h).trim().toLowerCase());
      const kol = navn => kolonner.indexOf(navn.toLowerCase());

      const t = data.test || {};
      const sted = tekst(t.sted, 80);
      if (!sted) return svar({ ok: false, feil: 'Mangler sted' });
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

function doGet() {
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
