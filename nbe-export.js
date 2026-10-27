/* NBE export — fills the bank's own forms from a case and downloads them.

   Scenario 1: the case is sent to National Bank of Egypt, with at least one Card service on PF.
     Online (an Online Card service on NBE, PF): the email body, the E-Commerce application form and the MATCH KYC sheet.
     POS (a POS Card service on NBE, PF): the POS application form and the POS KYC sheet.
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


  /* ── Fields the application does not have ──
     The KYC workbook vs Sales Application field gap analysis lists every workbook field and whether the application holds it. These are the
     ones marked "No" (rows 26–68) that sit on the sheets NBE uses (PF Online, PF POS, MCC e-commerce, MCC POS, NBE POS KYC, Governorate).
     Underwriting enters them on the case. n = the row number in the analysis; tag = what the analysis says about the field. */
  const SH = { po: 'PF Online', pp: 'PF POS', br: 'BM Recurring', me: 'MCC e-commerce', mp: 'MCC POS', gv: 'Governorate', nk: 'NBE POS KYC' };
  const GAP_GROUPS = ['Business', 'Integration and bank codes', 'Owner', 'POS: delegate and outlet', 'Bank reference'];
  const CITY_NOTE = 'Calculated in the workbook; entered here.';
  const GAP = [
    { n: 26, k: 'legalName', g: 0, label: 'Legal name', sh: ['po', 'pp', 'br'], tag: 'Required', req: true, hint: 'Defaults to the business name; change it if the legal name differs.' },
    { n: 27, k: 'address1', g: 0, label: 'Business address line 1', sh: ['po', 'pp', 'br'], tag: 'Required', req: true },
    { n: 28, k: 'address2', g: 0, label: 'Business address line 2', sh: ['po', 'pp'], tag: 'Optional' },
    { n: 29, k: 'governorate', g: 0, label: 'Governorate', sh: ['po', 'pp', 'br', 'mp', 'gv'], tag: 'Required', req: true, type: 'select', options: 'GOV' },
    { n: 30, k: 'city', g: 0, label: 'City', sh: ['po', 'pp', 'me', 'mp'], tag: 'Required', req: true },
    { n: 31, k: 'country', g: 0, label: 'Country', sh: ['po'], tag: 'Required', req: true, def: 'Egypt' },
    { n: 32, k: 'postalCode', g: 0, label: 'Postal code', sh: ['po', 'me'], tag: 'Optional' },
    { n: 33, k: 'isOtherCity', g: 0, label: 'Is other city', sh: ['po'], tag: 'Optional', type: 'select', options: ['No', 'Yes'], hint: 'Yes when the city is not in the bank\u2019s city list.' },
    { n: 34, k: 'nbeCityCode', g: 0, label: 'NBE city code', sh: ['mp'], tag: 'Optional', hint: 'For example \u201cALEX 02A\u201d. ' + CITY_NOTE },
    { n: 35, k: 'altPhone', g: 0, label: 'Alternate phone', sh: ['po'], tag: 'No need' },
    { n: 36, k: 'avgTicket', g: 1, label: 'Average ticket size (EGP)', sh: ['po', 'br'], tag: 'No need' },
    { n: 37, k: 'integrationModel', g: 1, label: 'Integration model', sh: ['po', 'br'], tag: 'Underwriting input', type: 'select', options: ['Payment Link', 'Merchant Website', 'Merchant App'], hint: 'The bank input is 2 (subscription), 2.5 (OTP) or 3 (hold amount).' },
    { n: 38, k: 'integrationType', g: 1, label: 'Integration type', sh: ['po', 'br'], tag: 'No need', type: 'select', options: ['2P', '2.5P', '3P'] },
    { n: 39, k: 'mcc', g: 1, label: 'MCC', sh: ['po', 'pp', 'br', 'me', 'mp'], tag: 'Underwriting input', hint: 'Calculated from the sector in the workbook; entered here.' },
    { n: 40, k: 'discountCode', g: 1, label: 'Discount code', sh: ['po', 'pp', 'br', 'me', 'mp'], tag: 'Underwriting input', hint: 'The bank code, not the application\u2019s fee percentages.' },
    { n: 41, k: 'nbeAgCode', g: 1, label: 'NBE AG code', sh: ['pp', 'mp'], tag: 'Underwriting input', hint: 'Calculated from the MCC in the workbook; entered here.' },
    { n: 42, k: 'descriptor', g: 1, label: 'Bank descriptor', sh: ['po', 'pp', 'br'], tag: 'Calculated', calc: true, hint: 'Built from the business name.' },
    { n: 43, k: 'ownerTitle', g: 2, label: 'Owner title', sh: ['pp'], tag: 'No need', type: 'select', options: ['MR', 'MRS'] },
    { n: 44, k: 'ownerFirstName', g: 2, label: 'Owner first name', sh: ['po', 'pp', 'br'], tag: 'No need', hint: 'Defaults to the first word of the owner\u2019s full name.' },
    { n: 45, k: 'ownerMiddle', g: 2, label: 'Owner middle initial', sh: ['po'], tag: 'No need' },
    { n: 46, k: 'ownerLastName', g: 2, label: 'Owner last name', sh: ['po', 'pp', 'br'], tag: 'No need', hint: 'Defaults to the rest of the owner\u2019s full name.' },
    { n: 47, k: 'ownerAddress1', g: 2, label: 'Owner address line 1', sh: ['po'], tag: 'No need' },
    { n: 48, k: 'ownerAddress2', g: 2, label: 'Owner address line 2', sh: ['po'], tag: 'No need' },
    { n: 49, k: 'ownerCity', g: 2, label: 'Owner city', sh: ['po'], tag: 'No need', hint: 'The MATCH sheet uses the business city when this is empty.' },
    { n: 50, k: 'ownerState', g: 2, label: 'Owner state / province', sh: ['po'], tag: 'No need', hint: 'Probably the governorate.' },
    { n: 51, k: 'ownerCountry', g: 2, label: 'Owner country', sh: ['po'], tag: 'No need' },
    { n: 52, k: 'ownerPostal', g: 2, label: 'Owner postal code', sh: ['po'], tag: 'No need' },
    { n: 53, k: 'ownerIsOtherCity', g: 2, label: 'Owner is other city', sh: ['po'], tag: 'No need', type: 'select', options: ['No', 'Yes'] },
    { n: 54, k: 'ownerAltPhone', g: 2, label: 'Owner alternate phone', sh: ['po'], tag: 'No need' },
    { n: 55, k: 'delegateFirst', g: 3, label: 'Delegate first name', sh: ['pp'], tag: 'No need', hint: 'The company\u2019s authorized representative.' },
    { n: 56, k: 'delegateSurname', g: 3, label: 'Delegate surname', sh: ['pp'], tag: 'No need' },
    { n: 57, k: 'delegateIdType', g: 3, label: 'Delegate ID type', sh: ['pp'], tag: 'No need', type: 'select', options: ['National ID', 'Passport'] },
    { n: 58, k: 'delegateId', g: 3, label: 'Delegate ID number', sh: ['pp'], tag: 'No need' },
    { n: 59, k: 'delegateNationality', g: 3, label: 'Delegate nationality', sh: ['pp'], tag: 'No need' },
    { n: 60, k: 'outletName', g: 3, label: 'Outlet name', sh: ['pp'], tag: 'No need' },
    { n: 61, k: 'outletAddress', g: 3, label: 'Outlet address', sh: ['pp'], tag: 'No need' },
    { n: 62, k: 'outletCity', g: 3, label: 'Outlet city', sh: ['pp'], tag: 'No need' },
    { n: 63, k: 'pinPadSerial', g: 3, label: 'PIN pad serial', sh: ['pp'], tag: 'No need' },
    { n: 64, k: 'bankBatch', g: 4, label: 'Bank batch number', sh: ['po', 'pp', 'br', 'nk'], tag: 'Underwriting input' },
    { n: 65, k: 'bankNotes', g: 4, label: 'Bank notes / HPS reference', sh: ['po', 'pp', 'br'], tag: 'Bank response', type: 'textarea', wide: true },
    { n: 66, k: 'bankComment', g: 4, label: 'Bank comment', sh: ['nk'], tag: 'Bank response', type: 'textarea', wide: true, hint: 'The application only has internal Underwriting reject reasons.' },
    { n: 67, k: 'cbeInitiative', g: 4, label: 'CBE initiative', sh: ['po', 'pp', 'br'], tag: 'No need', hint: 'Only if still required.' },
    { n: 68, k: 'caseNumber', g: 4, label: 'Case #', sh: ['po', 'br'], tag: 'Underwriting input', hint: 'Only if still required.' },
  ];
  /* The gap fields that apply to a case: those on a sheet of a channel the case uses (Online: PF Online, MCC e-commerce; POS: PF POS, MCC POS,
     NBE POS KYC); the Governorate and BM Recurring sheets serve both. */
  function gapFields(app) {
    const online = nbeConfigs(app, 'Online ').length > 0, pos = nbeConfigs(app, 'POS ').length > 0;
    return GAP.filter(f => f.sh.some(s => (s === 'po' || s === 'me') ? online : (s === 'pp' || s === 'mp' || s === 'nk') ? pos : true))
      .map(f => Object.assign({}, f, { sheets: f.sh.map(s => SH[s]), options: f.options === 'GOV' ? GOVERNORATES : f.options }));
  }

  /* The name on the cardholder's statement: Kashier's prefix plus the business name, 25 characters at most. */
  const descriptorOf = app => ((DP.descriptorPrefix || 'KASHIER*') + String(app.biz || '').toUpperCase()).slice(0, 25);
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');
  const localPhone = s => { let d = digits(s); if (d.startsWith('20') && d.length >= 12) d = '0' + d.slice(2); return d; };
  const up = s => String(s == null ? '' : s).toUpperCase();
  const splitName = n => { const t = String(n || '').trim().split(/\s+/).filter(Boolean); return { first: t[0] || '', last: t.slice(1).join(' ') }; };
  const xmlEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  /* The NBE sheets apply only to a Card service on NBE settled on PF; other NBE services, and Card on PSP, do not use them.
     Returns those services of the case for one channel ('Online ' or 'POS '). */
  function nbeConfigs(app, prefix) {
    const out = [];
    (app.summary.serviceConfigs || []).forEach(sc => { if (sc.service.startsWith(prefix) && sc.service.endsWith('Card')) (sc.configs || []).forEach(cfg => { if (cfg.bank === NBE && cfg.module === 'PF') out.push({ service: sc.service, cfg: cfg }); }); });
    return out;
  }
  const hasNbe = app => nbeConfigs(app, 'Online ').length + nbeConfigs(app, 'POS ').length > 0;

  /* What Underwriting entered on the case, with the defaults the form fields show. */
  function legal(c, saved) {
    const app = c.app, s = app.summary, pay = window.KashierRates.currentPayout(app);
    const def = {
      legalName: app.biz, country: 'Egypt', ownerCountry: '', merchantCategory: s.industry, nbeBranch: DO.branch || '', platformType: DO.platformType || '', gateway: DO.gateway || '',
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
      // fields from the gap analysis
      state: governorate, country: L.country || '', isOtherCity: L.isOtherCity || '', altPhone0: localPhone(L.altPhone).replace(/^0/, ''), ownerMiddle: L.ownerMiddle || '',
      ownerAddress1: L.ownerAddress1 || '', ownerAddress2: L.ownerAddress2 || '', ownerCity: up(L.ownerCity || L.city), ownerState: L.ownerState || '', ownerCountry: L.ownerCountry || '', ownerZip: L.ownerPostal || '',
      ownerIsOtherCity: L.ownerIsOtherCity || '', ownerAltPhone0: localPhone(L.ownerAltPhone).replace(/^0/, ''),
      delegateFirst: up(L.delegateFirst), delegateSurname: up(L.delegateSurname), delegateIdType: up(L.delegateIdType), delegateId: L.delegateId || '', delegateNationality: up(L.delegateNationality),
      // online
      merchantCategory: L.merchantCategory, merchantType: DO.merchantType || '', merchantUnder: (onl[0] && onl[0].cfg.module) || '', identifier: c.mid,
      currentActivity: activityAr, serviceRequest: svcNames.length ? 'Enable the ' + svcNames.join(', ') + ' service' + (svcNames.length === 1 ? '' : 's') + '.' : '',
      nbeBranch: L.nbeBranch, accountNumber: L.bankAccount, platformType: L.platformType, gateway: L.gateway, programmingLanguage: L.programmingLanguage, hostedPayments: hosted,
      // MATCH
      merchantName: L.legalName, dba: DO.dba || '', city: up(L.city), zip: postal, phone0: phone.replace(/^0/, ''), mcc: L.mcc, website: sites[0] || '', ownerFirst: L.ownerFirstName || owner.first, ownerLast: L.ownerLastName || owner.last,
      // POS KYC
      title: up(L.ownerTitle), first: up(L.ownerFirstName || owner.first), surname: up(L.ownerLastName || owner.last), cityCode: up(L.nbeCityCode || L.city), dbaCode: DP.dbaCode || '', phone: phone, currency: DP.currency || '',
      nbeMerchantId: L.nbeMerchantId, mType: DP.mType || '', descriptor: descriptorOf(app), agreementModel: DP.agreementModel || '',
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
    isOtherCity: 'Is other city', state: 'State / province (governorate)', country: 'Country', altPhone0: 'Alternate phone', ownerMiddle: 'Owner middle initial', ownerAddress1: 'Owner address line 1', ownerAddress2: 'Owner address line 2',
    ownerIsOtherCity: 'Owner is other city', ownerCity: 'Owner city', ownerState: 'Owner state / province', ownerCountry: 'Owner country', ownerZip: 'Owner postal code', ownerAltPhone0: 'Owner alternate phone',
    delegateFirst: 'Delegate first name', delegateSurname: 'Delegate surname', delegateIdType: 'Delegate ID type', delegateId: 'Delegate ID number', delegateNationality: 'Delegate nationality',
    mobile0: 'Mobile', accountNumberKashier: 'Bank account number (Kashier fixed value)', taxNumber: 'Tax card number', merchantNationality: 'Merchant nationality (Kashier fixed value)',
  };
  const OPTIONAL = { address2: 1, programmingLanguage: 1, accountNumber: 1, nbeMerchantId: 1, hostedPayments: 1, ownerMiddle: 1, isOtherCity: 1, altPhone0: 1, ownerAddress1: 1, ownerAddress2: 1, ownerIsOtherCity: 1,
    ownerCity: 1, ownerState: 1, ownerCountry: 1, ownerZip: 1, ownerAltPhone0: 1, delegateFirst: 1, delegateSurname: 1, delegateIdType: 1, delegateId: 1, delegateNationality: 1, zip: 1, state: 1 };
  const T = 'templates/nbe/';
  const PACKS = [
    { id: 'online', title: 'NBE Online — e-commerce', applies: app => nbeConfigs(app, 'Online ').length > 0, files: [
      { id: 'body', name: 'Email body', file: 'nbe-online-email-body.docx', ext: 'docx', part: 'word/document.xml',
        keys: ['merchantCategory', 'merchantType', 'merchantUnder', 'identifier', 'mobile0', 'email', 'currentActivity', 'postalCode', 'serviceRequest'] },
      { id: 'ecom', name: 'E-Commerce application form', file: 'nbe-ecommerce-application.docx', ext: 'docx', part: 'word/document.xml',
        keys: ['companyName', 'brandName', 'companyType', 'personInCharge', 'address', 'postalCode', 'tel', 'mobile', 'email', 'url', 'nbeBranch', 'accountNumber', 'services', 'platformType', 'gateway', 'programmingLanguage', 'hostedPayments', 'signatory'] },
      { id: 'match', name: 'MATCH KYC sheet', file: 'nbe-match-kyc.xlsx', ext: 'xlsx', part: 'xl/worksheets/sheet1.xml',
        keys: ['merchantName', 'dba', 'address1', 'address2', 'isOtherCity', 'city', 'state', 'country', 'zip', 'phone0', 'altPhone0', 'mcc', 'website', 'ownerFirst', 'ownerMiddle', 'ownerLast',
          'ownerAddress1', 'ownerAddress2', 'ownerIsOtherCity', 'ownerCity', 'ownerState', 'ownerCountry', 'ownerZip', 'ownerAltPhone0', 'email'] } ] },
    { id: 'pos', title: 'NBE POS', applies: app => nbeConfigs(app, 'POS ').length > 0, files: [
      { id: 'posapp', name: 'POS application form', file: 'nbe-pos-application.docx', ext: 'docx', part: 'word/document.xml',
        keys: ['companyName', 'companyType', 'personInCharge', 'address', 'tel', 'mobile', 'services', 'signatory'] },
      { id: 'poskyc', name: 'POS KYC sheet', file: 'nbe-pos-kyc.xlsx', ext: 'xlsx', part: 'xl/worksheets/sheet1.xml',
        keys: ['title', 'first', 'surname', 'address1', 'address2', 'cityCode', 'dbaCode', 'mcc', 'phone', 'currency', 'nbeMerchantId', 'mType', 'descriptor', 'agreementModel', 'structureId', 'structurePosition',
          'parentMerchant', 'accountCurrency', 'accountNumberKashier', 'accountName', 'customerType', 'idType', 'idNumber', 'nationality', 'delegateFirst', 'delegateSurname', 'delegateIdType', 'delegateId', 'delegateNationality', 'crNumber', 'taxNumber', 'merchantNationality'] } ] },
  ];

  function packsFor(c) { return PACKS.filter(p => p.applies(c.app)); }

  /* For each file: its values, which are filled and which are missing. */
  function review(c, saved) {
    const v = values(c, saved);
    return packsFor(c).map(p => ({ id: p.id, title: p.title, files: p.files.map(f => {
      // Kashier's fixed values come from the private defaults file; where it is absent (the public prototype) they stay empty and never block the approval.
      const rows = f.keys.map(k => ({ key: k, label: FIELD[k] || k, value: v[k] == null ? '' : String(v[k]), optional: !!OPTIONAL[k] || /Kashier fixed value/.test(FIELD[k] || '') }));
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

  return { NBE: NBE, GOVERNORATES: GOVERNORATES, hasNbe: hasNbe, descriptorOf: descriptorOf, gapFields: gapFields, GAP_GROUPS: GAP_GROUPS, packsFor: packsFor, review: review, build: build, fileName: fileName, save: save, defaults: defaults,
    available: () => available, needsPos: app => nbeConfigs(app, 'POS ').length > 0, needsOnline: app => nbeConfigs(app, 'Online ').length > 0 };
})();
