/* NBE export — fills the bank's own forms from a case and downloads them.

   Scenario 1: the case is sent to National Bank of Egypt.
     Online (a service on NBE that is Online): the email body, the E-Commerce application form and the MATCH KYC sheet.
     POS (a service on NBE that is POS): the POS application form and the POS KYC sheet.
   The templates in templates/nbe/ are the bank's forms with placeholders ({{key}}) where the merchant's data goes. Each form is
   a zip: the placeholders are replaced in the document/sheet XML and the file is zipped again, so the bank's layout is untouched.
   Values come from the application, the Underwriting legal and bank data saved on the case, and Kashier's fixed values
   (nbe-defaults.js, kept out of the public prototype). Needs JSZip. */
window.NBEExport = (function () {
  const NBE = 'National Bank of Egypt';
  const D = window.NBE_DEFAULTS || {}, DO = D.online || {}, DP = D.pos || {};
  const GOVERNORATES = ['Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Port Said', 'Suez', 'Damietta', 'Dakahlia', 'Sharkia', 'Gharbia', 'Menofia', 'Kafr El Sheikh', 'Beheira', 'Ismailia',
    'Beni Suef', 'Fayoum', 'Minya', 'Assiut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea', 'New Valley', 'Matrouh', 'North Sinai', 'South Sinai'];
  const COMPANY_TYPE_AR = { 'Sole proprietorship': 'فردى', 'Limited liability company (LLC)': 'مسؤولية محدودة',
    'Joint stock company (JSC)': 'مساهمة', 'One-person company': 'شركة الشخص الواحد',
    'General partnership': 'تضامن', 'Limited partnership': 'توصية بسيطة', 'Other': '' };
  const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');
  const localPhone = s => { let d = digits(s); if (d.startsWith('20') && d.length >= 12) d = '0' + d.slice(2); return d; };
  const up = s => String(s == null ? '' : s).toUpperCase();
  const splitName = n => { const t = String(n || '').trim().split(/\s+/).filter(Boolean); return { first: t[0] || '', last: t.slice(1).join(' ') }; };
  const xmlEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  /* Services of the case that go to NBE, by channel. */
  function nbeConfigs(app, prefix) {
    const out = [];
    (app.summary.serviceConfigs || []).forEach(sc => { if (sc.service.startsWith(prefix)) (sc.configs || []).forEach(cfg => { if (cfg.bank === NBE) out.push({ service: sc.service, cfg: cfg }); }); });
    return out;
  }
  const hasNbe = app => nbeConfigs(app, 'Online ').length + nbeConfigs(app, 'POS ').length > 0;

  /* What Underwriting entered on the case, with the defaults the form fields show. */
  function legal(c, saved) {
    const app = c.app, s = app.summary, pay = window.KashierRates.currentPayout(app);
    const def = {
      legalName: app.biz, merchantCategory: s.industry, nbeBranch: DO.branch || '', platformType: DO.platformType || '', gateway: DO.gateway || '',
      bankAccount: pay && pay.method === 'bank' ? pay.account : '',
    };
    const L = {};
    Object.keys(def).forEach(k => { L[k] = def[k]; });
    Object.keys(saved || {}).forEach(k => { if (saved[k] != null && String(saved[k]) !== '') L[k] = saved[k]; });
    return L;
  }
  function defaults(c) { return legal(c, {}); }

  /* Every value the five forms use, keyed by placeholder. */
  function values(c, saved) {
    const app = c.app, s = app.summary, L = legal(c, saved), sites = app.websites && app.websites.length ? app.websites : (app.website ? [app.website] : []);
    const owner = splitName(L.ownerName), phone = localPhone(s.phone), onl = nbeConfigs(app, 'Online '), pos = nbeConfigs(app, 'POS ');
    const governorate = L.governorate || '', postal = L.postalCode || '';
    const hosted = L.hostedPayments === 'Hosted session' ? 'Hosted session     ( x )\nHosted Checkout (   )' : L.hostedPayments === 'Hosted checkout' ? 'Hosted session     (   )\nHosted Checkout ( x )' : 'Hosted session     (   )\nHosted Checkout (   )';
    const activityAr = L.activityAr || L.activity || '';
    const individual = s.entity === 'Individual Seller';
    const natId = (L.ownerIdType || 'National ID') === 'National ID';
    const svcNames = [...new Set(onl.map(x => x.service))];
    return {
      // shared
      companyName: L.legalName, brandName: app.biz, companyType: COMPANY_TYPE_AR[L.legalForm] || '', personInCharge: L.ownerName, address: [L.address1, L.address2].filter(Boolean).join(', '),
      postalCode: governorate && postal ? governorate + ' — ' + postal : (postal || governorate), tel: phone, mobile: phone, mobile0: phone.replace(/^0/, ''), email: s.email, url: sites[0] || '',
      signatory: L.signatory || L.ownerName, services: activityAr, address1: L.address1, address2: L.address2,
      // online
      merchantCategory: L.merchantCategory, merchantType: DO.merchantType || '', merchantUnder: (onl[0] && onl[0].cfg.module) || '', identifier: c.mid,
      currentActivity: activityAr, serviceRequest: svcNames.length ? 'Enable the ' + svcNames.join(', ') + ' service' + (svcNames.length === 1 ? '' : 's') + '.' : '',
      nbeBranch: L.nbeBranch, accountNumber: L.bankAccount, platformType: L.platformType, gateway: L.gateway, programmingLanguage: L.programmingLanguage, hostedPayments: hosted,
      // MATCH
      merchantName: L.legalName, dba: DO.dba || '', city: up(L.city), zip: postal, phone0: phone.replace(/^0/, ''), mcc: L.mcc, website: sites[0] || '', ownerFirst: owner.first, ownerLast: owner.last,
      // POS KYC
      title: up(L.ownerTitle), first: up(owner.first), surname: up(owner.last), cityCode: up(L.nbeCityCode || L.city), dbaCode: DP.dbaCode || '', phone: phone, currency: DP.currency || '',
      nbeMerchantId: L.nbeMerchantId, mType: DP.mType || '', descriptor: DP.descriptorPrefix ? (DP.descriptorPrefix + up(app.biz)).slice(0, 25) : '', agreementModel: DP.agreementModel || '',
      structureId: DP.structureId || '', structurePosition: DP.structurePosition || '', parentMerchant: DP.parentMerchant || '', accountCurrency: DP.accountCurrency || '',
      accountNumberKashier: DP.accountNumber || '', accountName: DP.accountName || '', customerType: individual ? 'INDIVIDUAL' : 'CORPORATE', idType: up(L.ownerIdType || 'National ID'),
      idNumber: L.ownerId, nationality: natId ? 'EGYPTIAN' : up(L.ownerNationality), crNumber: L.crNumber, taxNumber: L.taxNumber, merchantNationality: DP.merchantNationality || '',
    };
  }

  /* The files of each pack, with the fields they need ([key, label, optional]). */
  const FIELD = {
    companyName: 'Company (legal) name', brandName: 'Brand name', companyType: 'Company type (legal form)', personInCharge: 'Owner full name', address: 'Business address', postalCode: 'Governorate and postal code',
    tel: 'Phone', mobile: 'Mobile', email: 'Email', url: 'Website', signatory: 'Authorized signatory', services: 'Business activity (Arabic)', merchantCategory: 'Merchant category', merchantType: 'Merchant type (Kashier fixed value)',
    merchantUnder: 'Settlement model (PF / PSP)', identifier: 'Kashier MID', currentActivity: 'Business activity (Arabic)', serviceRequest: 'Service to enable', nbeBranch: 'NBE branch', accountNumber: 'Merchant account number',
    platformType: 'Platform type', gateway: 'Gateway', programmingLanguage: 'Programming language', hostedPayments: 'Hosted payments', merchantName: 'Merchant name', dba: 'Doing business as (Kashier fixed value)',
    address1: 'Business address line 1', address2: 'Business address line 2', city: 'City', zip: 'Postal code', phone0: 'Business phone', mcc: 'Merchant category code (MCC)', website: 'Website', ownerFirst: 'Owner first name',
    ownerLast: 'Owner last name', title: 'Owner title (MR / MRS)', first: 'Owner first name', surname: 'Owner surname', cityCode: 'NBE city code', dbaCode: 'DBA merchant name code (Kashier fixed value)', phone: 'Phone',
    currency: 'Merchant currency (Kashier fixed value)', nbeMerchantId: 'NBE-assigned merchant ID', mType: 'MType (Kashier fixed value)', descriptor: 'Merchant name on statements', agreementModel: 'Agreement model (Kashier fixed value)',
    structureId: 'Structure ID (Kashier fixed value)', structurePosition: 'Structure position (Kashier fixed value)', parentMerchant: 'Parent merchant (Kashier fixed value)', accountCurrency: 'Bank account currency (Kashier fixed value)',
    accountName: 'Bank account name (Kashier fixed value)', customerType: 'Customer type', idType: 'Owner ID type', idNumber: 'Owner ID number', nationality: 'Owner nationality', crNumber: 'Commercial registration number',
    mobile0: 'Mobile', accountNumberKashier: 'Bank account number (Kashier fixed value)', taxNumber: 'Tax card number', merchantNationality: 'Merchant nationality (Kashier fixed value)',
  };
  const OPTIONAL = { address2: 1, programmingLanguage: 1, accountNumber: 1, nbeMerchantId: 1, hostedPayments: 1, ownerMiddle: 1 };
  const T = 'templates/nbe/';
  const PACKS = [
    { id: 'online', title: 'NBE Online — e-commerce', applies: app => nbeConfigs(app, 'Online ').length > 0, files: [
      { id: 'body', name: 'Email body', file: 'nbe-online-email-body.docx', ext: 'docx', part: 'word/document.xml',
        keys: ['merchantCategory', 'merchantType', 'merchantUnder', 'identifier', 'mobile0', 'email', 'currentActivity', 'postalCode', 'serviceRequest'] },
      { id: 'ecom', name: 'E-Commerce application form', file: 'nbe-ecommerce-application.docx', ext: 'docx', part: 'word/document.xml',
        keys: ['companyName', 'brandName', 'companyType', 'personInCharge', 'address', 'postalCode', 'tel', 'mobile', 'email', 'url', 'nbeBranch', 'accountNumber', 'services', 'platformType', 'gateway', 'programmingLanguage', 'hostedPayments', 'signatory'] },
      { id: 'match', name: 'MATCH KYC sheet', file: 'nbe-match-kyc.xlsx', ext: 'xlsx', part: 'xl/worksheets/sheet1.xml',
        keys: ['merchantName', 'dba', 'address1', 'address2', 'city', 'zip', 'phone0', 'mcc', 'website', 'ownerFirst', 'ownerLast', 'email'] } ] },
    { id: 'pos', title: 'NBE POS', applies: app => nbeConfigs(app, 'POS ').length > 0, files: [
      { id: 'posapp', name: 'POS application form', file: 'nbe-pos-application.docx', ext: 'docx', part: 'word/document.xml',
        keys: ['companyName', 'companyType', 'personInCharge', 'address', 'tel', 'mobile', 'services', 'signatory'] },
      { id: 'poskyc', name: 'POS KYC sheet', file: 'nbe-pos-kyc.xlsx', ext: 'xlsx', part: 'xl/worksheets/sheet1.xml',
        keys: ['title', 'first', 'surname', 'address1', 'address2', 'cityCode', 'dbaCode', 'mcc', 'phone', 'currency', 'nbeMerchantId', 'mType', 'descriptor', 'agreementModel', 'structureId', 'structurePosition',
          'parentMerchant', 'accountCurrency', 'accountNumberKashier', 'accountName', 'customerType', 'idType', 'idNumber', 'nationality', 'crNumber', 'taxNumber', 'merchantNationality'] } ] },
  ];

  function packsFor(c) { return PACKS.filter(p => p.applies(c.app)); }

  /* For each file: its values, which are filled and which are missing. */
  function review(c, saved) {
    const v = values(c, saved);
    return packsFor(c).map(p => ({ id: p.id, title: p.title, files: p.files.map(f => {
      const rows = f.keys.map(k => ({ key: k, label: FIELD[k] || k, value: v[k] == null ? '' : String(v[k]), optional: !!OPTIONAL[k] }));
      return { id: f.id, name: f.name, ext: f.ext, rows: rows, missing: rows.filter(r => !r.value.trim() && !r.optional), filled: rows.filter(r => r.value.trim()).length };
    }) }));
  }

  /* Sites without the templates (the public prototype keeps the bank's forms out) hide the export instead of failing. */
  let available = true;
  fetch(T + 'nbe-match-kyc.xlsx', { method: 'HEAD' }).then(r => { available = r.ok; }).catch(() => { available = false; }).then(() => window.dispatchEvent(new Event('nbe-ready')));
  const cache = {};
  async function template(file) {
    if (!cache[file]) {
      const r = await fetch(T + file);
      if (!r.ok) throw new Error('The NBE template ' + file + ' is not available on this site.');
      cache[file] = await r.arrayBuffer();
    }
    return cache[file];
  }
  /* Fill one form and return it as a Blob. */
  async function build(c, saved, fileId) {
    const spec = PACKS.reduce((a, p) => a.concat(p.files), []).filter(f => f.id === fileId)[0];
    const v = values(c, saved);
    // the POS sheet's Kashier account sits in the column the template calls accountNumber
    if (spec.id === 'poskyc') v.accountNumber = v.accountNumberKashier;
    const zip = await JSZip.loadAsync(await template(spec.file));
    let xml = await zip.file(spec.part).async('string');
    xml = xml.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      const val = v[k] == null ? '' : String(v[k]);
      return spec.ext === 'docx' ? xmlEsc(val).split('\n').join('</w:t><w:br/><w:t xml:space="preserve">') : xmlEsc(val);
    });
    zip.file(spec.part, xml);
    return zip.generateAsync({ type: 'blob', mimeType: MIME[spec.ext], compression: 'DEFLATE' });
  }
  const fileName = (c, f, pack) => pack.title.replace(/ — .*/, '') + ' - ' + c.app.biz.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' - ' + f.name + '.' + f.ext;
  function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

  return { NBE: NBE, GOVERNORATES: GOVERNORATES, hasNbe: hasNbe, packsFor: packsFor, review: review, build: build, fileName: fileName, save: save, defaults: defaults,
    available: () => available, needsPos: app => nbeConfigs(app, 'POS ').length > 0, needsOnline: app => nbeConfigs(app, 'Online ').length > 0 };
})();
