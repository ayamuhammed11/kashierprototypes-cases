/* Bank Misr batch — fills the bank's own upload sheets with every case that is ready, once a day.

   Unlike NBE, which gets one case at a time, Bank Misr takes a batch: the cases approved during the day go out together in one set of
   sheets, one row per case.
     Online (an Online Card service on Bank Misr, PF): the Online bulk upload and the PF onboarding merchants sheet.
     POS (a POS Card service on Bank Misr, PF): the POS bulk upload, the Manual onboarding sheet and the Add TID sheet.
   The templates in templates/bm/ are the bank's sheets with the merchant rows removed. The export copies the template's model row for
   each case and writes the values in as text, so the bank's headers, widths, styles and city dropdown stay as they are.
   Values come from the application, the Underwriting data saved on the case, and Kashier's fixed values (bm-defaults.js, kept out of
   the public prototype). Needs JSZip. */
window.BMExport = (function () {
  const BM = 'Bank Misr';
  const DM = (window.BM_DEFAULTS || {}).manual || {};
  const T = 'templates/bm/';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* The cities in the bank's dropdown; the bank maps each to a city code. */
  const CITIES = ['CAIRO', 'GIZA', 'ALEXANDRIA', 'PORT SAID', 'ISMAILIA', 'BANHA', 'LUXOR', 'ASWAN', 'ARISH', 'SHARM ELSHEKH', 'HURGHADA', 'MARSA MATROH', 'TABA', 'RAAS ELBAR', 'TANTA', 'MANSOURA',
    'EL MAHALA', 'EL MENIA', 'BANI SWIEF', 'ASSUIT', 'SUHAG', 'SUEZ', 'EL FAYOUM', 'DOMYAT', 'SHEBEN EL KOUM', 'EL ZAGAZEG', 'KAFR ELSHEIKH', 'EL KHARGA', 'DAMANHOU'];
  const LEGAL_FORMS = ['Sole proprietorship', 'Limited liability company (LLC)', 'Joint stock company (JSC)', 'One-person company', 'General partnership', 'Limited partnership', 'Other'];
  const COMPANY_TYPE_AR = { 'Sole proprietorship': 'فردى', 'Limited liability company (LLC)': 'مسؤولية محدودة', 'Joint stock company (JSC)': 'مساهمة',
    'One-person company': 'شركة الشخص الواحد', 'General partnership': 'تضامن', 'Limited partnership': 'توصية بسيطة', 'Other': '' };

  const up = s => String(s == null ? '' : s).toUpperCase();
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');
  const localPhone = s => { let d = digits(s); if (d.startsWith('20') && d.length >= 12) d = '0' + d.slice(2); return d; };
  const splitName = n => { const t = String(n || '').trim().split(/\s+/).filter(Boolean); return { first: t[0] || '', last: t.slice(1).join(' ') }; };
  /* The bank's tool removes special characters: letters, numbers, spaces and hyphens (addresses also allow commas). */
  const clean = s => String(s == null ? '' : s).replace(/[^A-Za-z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanAddr = s => String(s == null ? '' : s).replace(/[^A-Za-z0-9 ,\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const inList = s => CITIES.indexOf(up(s).trim()) !== -1;
  const xmlEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  /* Bank Misr takes a Card service settled on PF; other Bank Misr services, and Card on PSP, do not use these sheets. */
  function bmConfigs(app, prefix) {
    const out = [];
    (app.summary.serviceConfigs || []).forEach(sc => { if (sc.service.startsWith(prefix) && sc.service.endsWith('Card')) (sc.configs || []).forEach(cfg => { if (cfg.bank === BM && cfg.module === 'PF') out.push({ service: sc.service, cfg: cfg }); }); });
    return out;
  }
  const needsOnline = app => bmConfigs(app, 'Online ').length > 0;
  const needsPos = app => bmConfigs(app, 'POS ').length > 0;
  const hasBm = app => needsOnline(app) || needsPos(app);

  /* What Underwriting entered on the case, with the defaults the form shows. */
  function legal(c, saved) {
    const app = c.app, individual = app.summary.entity === 'Individual Seller', S = saved || {};
    const L = { legalName: app.biz, legalForm: individual ? 'Sole proprietorship' : '', ownerIdType: 'National ID', bmCity: inList(S.city) ? up(S.city).trim() : '' };
    Object.keys(S).forEach(k => { if (S[k] != null && String(S[k]) !== '') L[k] = S[k]; });
    return L;
  }

  /* ── The sheets: [key, label, required] per column, in the order of the bank's columns ── */
  const BULK = [['mid', 'Kashier MID', 1], ['name', 'Business name', 1], ['email', 'Email', 1], ['phone', 'Phone', 1], ['address', 'Business address', 1], ['city', 'City', 1], ['legalId', 'Merchant legal ID', 1],
    ['ownerFirst', 'Owner first name', 1], ['ownerLast', 'Owner last name', 1], ['docType', 'Owner ID type', 1], ['ownerId', 'Owner ID number', 1], ['outletName', 'Outlet name', 1],
    ['outletAddress', 'Outlet address', 0], ['outletCity', 'Outlet city', 0], ['mcc', 'MCC', 1]];
  const MANUAL = [['date', 'Date of the search (set when the batch is exported)', 0], ['ownerEn', 'Owner full name', 1], ['brand', 'Business name', 1], ['brand2', 'Business name', 1], ['legalEn', 'Legal name', 0],
    ['addressM', 'Business address', 1], ['cityM', 'City', 1], ['cbe', 'Central Bank initiative', 0], ['companyType', 'Company type (legal form)', 1], ['tax', 'Tax card number', 0],
    ['cr', 'Commercial register number', 0], ['nid', 'Owner national ID (individuals)', 0], ['mobile', 'Mobile', 1], ['activityAr', 'Business activity (Arabic)', 1], ['email', 'Email', 1],
    ['account', 'Kashier account number (Kashier fixed value)', 0], ['profile', 'Profile code (Kashier fixed value)', 0], ['mcc', 'MCC', 1], ['discount', 'Discount code', 1], ['currency', 'Currency', 0]];
  const FILES = [
    { id: 'onlineBulk', channel: 'online', name: 'Online bulk upload', short: 'Online bulk', file: 'bm-online-bulk-upload.xlsx', cols: BULK.concat([['discount', 'Discount code', 1]]) },
    { id: 'onlineManual', channel: 'online', name: 'PF onboarding merchants', short: 'PF onboarding', file: 'bm-manual-onboarding.xlsx', cols: MANUAL },
    { id: 'posBulk', channel: 'pos', name: 'POS bulk upload', short: 'POS bulk', file: 'bm-pos-bulk-upload.xlsx', cols: BULK.concat([['tid', 'POS terminal ID (TID)', 1], ['posName', 'POS name', 0], ['pinPad', 'PIN pad serial', 0], ['discount', 'Discount code', 1]]) },
    { id: 'posManual', channel: 'pos', name: 'Manual onboarding', short: 'Manual onboarding', file: 'bm-manual-onboarding.xlsx', cols: MANUAL },
    { id: 'addTid', channel: 'pos', name: 'Add TID', short: 'Add TID', file: 'bm-add-tid.xlsx', cols: [['hps', 'HPS merchant number', 0], ['tid', 'POS terminal ID (TID)', 1]] },
  ];
  const fileById = id => FILES.filter(f => f.id === id)[0];

  /* The values of one case on one channel, keyed by column key. */
  function values(c, saved, date) {
    const app = c.app, s = app.summary, L = legal(c, saved), owner = splitName(L.ownerName);
    const individual = s.entity === 'Individual Seller', natId = (L.ownerIdType || 'National ID') === 'National ID';
    const soleProp = L.legalForm ? L.legalForm === 'Sole proprietorship' : individual;
    const addr = [L.address1, L.address2].filter(Boolean).join(' '), city = L.bmCity || '';
    const phone = localPhone(s.phone);
    return {
      mid: c.mid, name: clean(app.biz), email: s.email, phone: phone, address: cleanAddr(addr), city: city,
      legalId: L.bmLegalId || (individual ? L.ownerId : (L.taxNumber || L.crNumber || '')),
      ownerFirst: clean(L.ownerFirstName || owner.first), ownerLast: clean(L.ownerLastName || owner.last), docType: natId ? '02' : '01', ownerId: L.ownerId,
      outletName: clean(L.outletName || app.biz), outletAddress: cleanAddr(L.outletAddress || addr), outletCity: inList(L.outletCity) ? up(L.outletCity).trim() : city,
      mcc: L.mcc, tid: L.posTid, posName: clean(L.posName), pinPad: L.pinPadSerial, discount: L.bmDiscountCode,
      // Manual onboarding
      date: date || '', ownerEn: L.ownerName, brand: app.biz, brand2: app.biz, legalEn: L.legalName && up(L.legalName).trim() !== up(app.biz).trim() ? L.legalName : '', addressM: addr, cityM: city, cbe: '',
      companyType: COMPANY_TYPE_AR[L.legalForm] || '', tax: L.taxNumber || 'NA', cr: L.crNumber || 'NA', nid: soleProp && natId ? L.ownerId : '', mobile: phone,
      activityAr: L.activityAr || L.activity || '', account: DM.account || '', profile: DM.profileCode || '', currency: DM.currency || 'EGP',
      // Add TID
      hps: L.bmHps,
    };
  }
  const filesFor = app => FILES.filter(f => f.channel === 'online' ? needsOnline(app) : needsPos(app));

  /* For each sheet this case goes on: its values, which are filled and which are missing. */
  function review(c, saved) {
    const v = values(c, saved, '');
    return filesFor(c.app).map(f => {
      const rows = f.cols.map(([k, label, req]) => ({ key: k, label: label, value: v[k] == null ? '' : String(v[k]), optional: !req }));
      return { id: f.id, name: f.name, channel: f.channel, rows: rows, missing: rows.filter(r => !r.value.trim() && !r.optional), filled: rows.filter(r => r.value.trim()).length };
    });
  }
  /* The required cells still empty, each named once however many sheets it sits on. */
  function missing(c, saved) {
    const seen = {}, out = [];
    review(c, saved).forEach(f => f.missing.forEach(m => { if (!seen[m.label]) { seen[m.label] = 1; out.push(m); } }));
    return out;
  }
  /* A case's rows for the batch: its values on each channel it uses. Kept with a sent batch so it can be downloaded again. */
  function snapshot(c, saved) {
    const v = values(c, saved, '');
    return { appId: c.app.id, biz: c.app.biz, mid: c.mid, online: needsOnline(c.app) ? v : null, pos: needsPos(c.app) ? v : null };
  }

  /* ── The form: what the bank asks for that the application does not hold ── */
  const SHEET = { ob: 'Online bulk upload', om: 'PF onboarding merchants', pb: 'POS bulk upload', pm: 'Manual onboarding', pt: 'Add TID' };
  function groups(c, saved) {
    const app = c.app, S = saved || {}, L = legal(c, S), onl = needsOnline(app), pos = needsPos(app);
    const both = ['ob', 'om', 'pb', 'pm'];
    const sheets = keys => keys.filter(k => (k[0] === 'o' ? onl : pos)).map(k => SHEET[k]);
    const g = [
      { title: 'Business', fields: [
        { k: 'legalName', label: 'Legal name', sh: ['om', 'pm'], hint: 'Leave it as the business name when they are the same; the sheet then leaves it empty.' },
        { k: 'address1', label: 'Business address', req: 1, sh: both, hint: 'Letters, numbers, spaces, hyphens and commas only. The bank’s sheet allows 30 characters.' },
        { k: 'bmCity', label: 'City', req: 1, type: 'select', options: CITIES, def: L.bmCity, sh: both, hint: 'From the bank’s list. The bank maps it to a city code.' },
        { k: 'mcc', label: 'MCC', req: 1, sh: both, pattern: /^\d{4}$/, patternMsg: 'The MCC has 4 digits.', hint: 'Four digits, for example 5814 for restaurants or 8099 for clinics.' },
        { k: 'bmDiscountCode', label: 'Discount code', req: 1, sh: both, pattern: /^[A-Za-z0-9]{3}$/, patternMsg: 'The discount code has 3 characters, for example M17.', hint: 'The bank’s code, for example M17.' },
        { k: 'legalForm', label: 'Legal form / registration type', req: 1, type: 'select', options: LEGAL_FORMS, def: L.legalForm, sh: ['om', 'pm'], hint: 'Written in Arabic as the company type.' },
        { k: 'crNumber', label: 'Commercial registration number', sh: ['om', 'pm'], hint: 'Written as NA when the merchant has none.' },
        { k: 'taxNumber', label: 'Tax card number', sh: ['om', 'pm'], hint: 'Written as NA when the merchant has none.' },
        { k: 'activityAr', label: 'Business activity description (Arabic)', req: 1, type: 'textarea', rtl: true, wide: true, sh: ['om', 'pm'], hint: 'What the merchant actually sells or does.' } ] },
      { title: 'Owner', fields: [
        { k: 'ownerName', label: 'Owner full name', req: 1, sh: both, hint: 'Split into first name and last name on the bulk upload.' },
        { k: 'ownerIdType', label: 'Owner ID type', req: 1, type: 'select', options: ['National ID', 'Passport'], def: L.ownerIdType, sh: ['ob', 'pb'], hint: 'Written as 02 for a national ID and 01 for a passport.' },
        { k: 'ownerId', label: 'Owner national ID / passport number', req: 1, sh: ['ob', 'pb', 'om', 'pm'], hint: 'A national ID is 14 digits.' },
        { k: 'bmLegalId', label: 'Merchant legal ID', req: 1, def: L.bmLegalId || (app.summary.entity === 'Individual Seller' ? S.ownerId || '' : S.taxNumber || S.crNumber || ''), sh: ['ob', 'pb'], hint: 'The tax or legal ID, 14 characters. For an individual it is the owner’s national ID.' } ] },
      { title: onl && !pos ? 'Online outlet' : 'Outlet', fields: [
        { k: 'outletName', label: onl && !pos ? 'Outlet name (the online channel)' : 'Outlet name', def: app.biz, sh: ['ob', 'pb'], hint: 'Defaults to the business name; for an online outlet it can be the channel, for example Website.' },
        { k: 'outletAddress', label: 'Outlet address', def: S.address1 || '', sh: ['ob', 'pb'], hint: 'Optional. Defaults to the business address.' },
        { k: 'outletCity', label: 'Outlet city', type: 'select', options: CITIES, def: S.bmCity || '', sh: ['ob', 'pb'], hint: 'Optional. Defaults to the business city.' } ] },
    ];
    if (pos) g.push({ title: 'POS terminal', fields: [
      { k: 'posTid', label: 'POS terminal ID (TID)', req: 1, sh: ['pb', 'pt'], hint: 'As provided by the bank, for example KA008775.' },
      { k: 'posName', label: 'POS name', sh: ['pb'], hint: 'Optional.' },
      { k: 'pinPadSerial', label: 'PIN pad serial', sh: ['pb'], hint: 'Optional. 25 characters at most.' },
      { k: 'bmHps', label: 'HPS merchant number', sh: ['pt'], hint: 'Optional. The bank’s merchant number the terminal is added to.' } ] });
    g.forEach(grp => grp.fields.forEach(f => { f.sheets = sheets(f.sh); f.tag = f.req ? 'Required' : 'Optional'; }));
    return g;
  }

  /* ── Files ── */
  let available = true;
  fetch(T + 'bm-pos-bulk-upload.xlsx', { method: 'HEAD' }).then(r => { available = r.ok; }).catch(() => { available = false; }).then(() => window.dispatchEvent(new Event('bm-ready')));
  const cache = {};
  async function template(file) {
    if (!cache[file]) {
      const r = await fetch(T + file);
      if (!r.ok) throw new Error('The Bank Misr template ' + file + ' is not available on this site.');
      cache[file] = await r.arrayBuffer();
    }
    return cache[file];
  }
  const colName = i => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const serial = d => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);

  /* The snapshots that go on this sheet, as rows of values. */
  const rowsFor = (f, snaps) => snaps.map(s => s[f.channel]).filter(Boolean);
  /* The sheets a batch of snapshots needs, with their row counts (a sheet nobody needs is left out). */
  function filesOf(snaps) { return FILES.map(f => ({ id: f.id, name: f.name, short: f.short, channel: f.channel, count: rowsFor(f, snaps).length })).filter(f => f.count); }

  /* Fill one sheet: the template's model row is copied for each case. */
  async function build(fileId, snaps, when) {
    const f = fileById(fileId), rows = rowsFor(f, snaps), date = new Date(when || Date.now());
    const zip = await JSZip.loadAsync(await template(f.file));
    let xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const model = xml.match(/<row r="2"[^>]*>[\s\S]*?<\/row>/)[0], open = model.match(/<row [^>]*>/)[0], styles = {};
    model.replace(/<c r="([A-Z]+)2"(?: s="(\d+)")?/g, (m, col, s) => { styles[col] = s; return m; });
    const out = rows.map((r, ri) => {
      const n = ri + 2, v = Object.assign({}, r, { date: serial(date) });
      const cells = f.cols.map(([k], i) => {
        const col = colName(i), st = styles[col] != null ? ' s="' + styles[col] + '"' : '', val = v[k];
        if (val == null || val === '') return '<c r="' + col + n + '"' + st + '/>';
        if (k === 'date') return '<c r="' + col + n + '"' + st + '><v>' + val + '</v></c>';
        return '<c r="' + col + n + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(val) + '</t></is></c>';
      }).join('');
      return open.replace(/r="2"/, 'r="' + n + '"') + cells + '</row>';
    }).join('');
    xml = xml.replace(model, out).replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:' + colName(f.cols.length - 1) + (rows.length + 1) + '"/>');
    zip.file('xl/worksheets/sheet1.xml', xml);
    return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
  }
  const fmtDay = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const fileName = (label, name) => 'Bank Misr batch - ' + label + ' - ' + name + '.xlsx';
  function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

  return { BM: BM, CITIES: CITIES, LEGAL_FORMS: LEGAL_FORMS, hasBm: hasBm, needsOnline: needsOnline, needsPos: needsPos, groups: groups, review: review, missing: missing, snapshot: snapshot,
    filesOf: filesOf, build: build, fileName: fileName, fmtDay: fmtDay, save: save, available: () => available };
})();
