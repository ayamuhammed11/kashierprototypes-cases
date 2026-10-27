/* ── iPad / mobile view ────────────────────────────────────────────────────────────────────────
   Opening mobile.html (or any page with ?view=mobile) turns on the touch view and remembers it: the phone layouts
   (stacked tables, hamburger menu, full-width drawers) apply up to iPad width, and buttons and fields get touch-size
   targets. ?view=desktop turns it off again. */
(function touchView() {
  try {
    var q = new URLSearchParams(location.search).get('view');
    if (q === 'mobile' || q === 'tablet' || q === 'touch') localStorage.setItem('kashierView', 'touch');
    else if (q === 'desktop') localStorage.removeItem('kashierView');
    if (localStorage.getItem('kashierView') !== 'touch') return;
  } catch (e) { return; }
  document.documentElement.classList.add('touch-view');
  var st = document.createElement('style');
  st.textContent =
    'html.touch-view body{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}' +
    '.touch-view .btn,.touch-view .cell-link,.touch-view .nav-link,.touch-view .subtab,.touch-view .setup-step{min-height:44px}' +
    '.touch-view select,.touch-view textarea,.touch-view input:not([type=checkbox]):not([type=radio]):not([type=file]){min-height:44px;font-size:16px}' +
    '.touch-view input[type=checkbox],.touch-view input[type=radio]{width:22px;height:22px;flex-shrink:0}' +
    '.touch-view .btn-icon,.touch-view .hamburger{min-width:44px;min-height:44px}' +
    '.touch-view .drawer{max-width:100vw}.touch-view .modal{max-width:94vw}' +
    '.touch-view .view-switch{display:block;margin:18px 14px;padding:12px;text-align:center;font-size:13px;font-weight:600;color:inherit;border:1px solid rgba(128,128,128,.4);border-radius:8px;text-decoration:none}';
  (document.head || document.documentElement).appendChild(st);
  /* Phone-size rules also cover tablets: widen their breakpoints to iPad width. */
  function widen() {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.type === 4 && /^\(max-width:\s*(620|640|720|800|820|900)px\)$/.test(r.media.mediaText)) r.media.mediaText = '(max-width: 1100px)';
      }
    }
  }
  widen();
  document.addEventListener('DOMContentLoaded', function () {
    widen();
    var side = document.querySelector('.sidebar');
    if (side && !side.querySelector('.view-switch')) {
      var a = document.createElement('a'); a.className = 'view-switch'; a.href = '?view=desktop'; a.textContent = 'Switch to desktop view';
      side.appendChild(a);
    }
  });
})();

/* Shared rate-approval rules, used by the Rate Approvals queue, the rate request page and the
   application page so all three agree on who may sign off and what a decision does.

   Rates between the Manager and Standard rate are a Sales Manager's call; anything under
   the Manager rate needs the Head of Sales. Each approver sees and decides only the
   requests at their own level — the Head does not review the Manager's requests.

   What an approver decides is an approval request: one application at one approval level.
   Every rate line on the application that needs that level — across all of its services —
   sits in the same request and is approved or rejected together. An application that has
   lines in both bands therefore produces two requests, one for each approver. */
window.KashierRates = (function () {
  const ROLES = {
    sales:   { label: 'Salesperson',     name: 'Aya Muhammed', initials: 'AM', approves: [] },
    manager: { label: 'Sales Manager', name: 'Nadia Salah',  initials: 'NS', approves: ['manager'] },
    head:    { label: 'Head of Sales',   name: 'Tarek Fahmy',  initials: 'TF', approves: ['head'] },
    // Works submitted applications in the Merchant module; approves no rates.
    onboarding: { label: 'Onboarding Team', name: 'Rana Adel', initials: 'RA', approves: [] },
  };
  const TIER_LABEL = { manager: 'Manager approval', head: 'Head approval' };
  const TIER_OWNER = { manager: 'Sales Manager', head: 'Head of Sales' };

  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
  }
  function writeStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* storage unavailable */ }
  }

  function getRole() {
    try {
      const saved = localStorage.getItem('kashierDemoRole');
      if (saved && ROLES[saved]) return saved;
    } catch (e) { /* storage unavailable */ }
    return 'sales';
  }
  function setRole(role) {
    if (!ROLES[role]) return;
    try { localStorage.setItem('kashierDemoRole', role); } catch (e) { /* storage unavailable */ }
  }

  function decisionsFor(appId) { return readStore('kashierRateDecisions')[appId] || {}; }
  function canRoleAct(role, tier) { return ROLES[role].approves.indexOf(tier) !== -1; }

  /* Where the application sits once a decision lands. Approvers review every requested rate
     — rejecting one does not stop the others being reviewed. While any rate is still open the
     application waits on rate approval; once all are reviewed it goes back to the salesperson
     if one or more were rejected, or on to Underwriting Review if every rate was approved. */
  function statusFor(requests, decisions) {
    const rejected = requests.filter(r => decisions[r.id] && decisions[r.id].decision === 'rejected');
    const pending = requests.filter(r => !decisions[r.id]);
    if (pending.length) return 'pending-rate-approval';
    if (rejected.length) return 'returned-to-sales';
    return 'pending-onboarding-review';
  }
  const LEAD_STATUS = {
    'returned-to-sales': 'application',
    'pending-onboarding-review': 'onboarding-review',
    'pending-rate-approval': 'rate-approval',
  };

  /* Write one decision onto a set of rate lines, then carry the consequence through to the
     application and its lead once. */
  function applyDecision(app, lines, opts) {
    const all = readStore('kashierRateDecisions');
    const decisions = all[app.id] || {};
    const entry = {
      decision: opts.decision,
      reason: opts.reason || '',
      by: ROLES[opts.role].name,
      roleLabel: ROLES[opts.role].label,
      ts: new Date().toISOString(),
    };
    lines.forEach(r => { decisions[r.id] = entry; });
    all[app.id] = decisions;
    writeStore('kashierRateDecisions', all);

    const status = statusFor(app.requests, decisions);
    const statuses = readStore('kashierAppStatus');
    statuses[app.id] = status;
    writeStore('kashierAppStatus', statuses);

    if (app.leadId) {
      const leadStatuses = readStore('kashierLeadStatusOverrides');
      leadStatuses[app.leadId] = LEAD_STATUS[status];
      writeStore('kashierLeadStatusOverrides', leadStatuses);

      // Leave a trail on the lead so the salesperson sees why it came back.
      const rejected = app.requests.filter(r => decisions[r.id] && decisions[r.id].decision === 'rejected');
      const notes = readStore('kashierLeadReturnNote');
      if (status === 'returned-to-sales') {
        const byReason = {};
        rejected.forEach(r => {
          const d = decisions[r.id];
          const key = d.by + '|' + d.reason;
          (byReason[key] = byReason[key] || { d: d, rates: [] }).rates.push(
            [r.service, r.bank].filter(Boolean).join(' · ') + ' — ' + r.rate);
        });
        notes[app.leadId] = {
          ts: new Date().toISOString(),
          text: Object.keys(byReason).map(k => {
            const g = byReason[k];
            return g.rates.join(', ') + ' rejected by ' + g.d.by + ': ' + g.d.reason;
          }).join(' | '),
        };
      } else {
        delete notes[app.leadId];
      }
      writeStore('kashierLeadReturnNote', notes);
    }
    addContributor(app.leadId, opts.role);
    notifyContributors(app.leadId, opts.role, ROLES[opts.role].name + ' ' + (opts.decision === 'approved' ? 'approved' : 'rejected') + ' ' + lines.length + ' rate' + (lines.length === 1 ? '' : 's') + ' \u2014 ' + app.biz,
      lines.map(r => r.rate + ' (' + [r.service, r.bank].filter(Boolean).join(' \u00b7 ') + '): ' + (opts.decision === 'approved' ? 'approved' : 'rejected') + (opts.reason ? ' \u2014 ' + opts.reason : ''))
        .concat(status === 'returned-to-sales' ? ['Every rate is reviewed. The application is back with ' + app.actor + ' to change the rejected rates.']
          : status === 'pending-onboarding-review' ? ['Every rate is approved. The application is now in Underwriting Review.'] : []), { biz: app.biz, by: ROLES[opts.role].name });
    return status;
  }

  /* Decide a whole approval request — every still-undecided line at that level. */
  function recordRequestDecision(opts) {
    const app = opts.app;
    if (!canRoleAct(opts.role, opts.tier) || roleOfName(app.actor) === opts.role) return null;
    const decisions = decisionsFor(app.id);
    if (readStore('kashierSupersededApplications')[app.id]) return null;
    const lines = app.requests.filter(r => r.tier === opts.tier && !decisions[r.id]);
    if (!lines.length) return null;
    return { status: applyDecision(app, lines, opts), lines: lines };
  }

  /* Decide a single rate line from inside its request. Other rates stay open for review;
     the application goes back to the salesperson once every rate has been reviewed. */
  function recordDecision(opts) {
    const app = opts.app;
    const req = app.requests.filter(r => r.id === opts.reqId)[0];
    if (!req || !canRoleAct(opts.role, req.tier) || roleOfName(app.actor) === opts.role) return null;
    const decisions = decisionsFor(app.id);
    if (decisions[req.id]) return null;
    if (readStore('kashierSupersededApplications')[app.id]) return null;
    if (opts.decision === 'rejected' && !String(opts.reason || '').trim()) return null;
    return { status: applyDecision(app, [req], opts), request: req };
  }

  /* Applications carrying rate requests. Real ones are the tracking links the onboarding
     page stored on submit; the seeded pair stands in for applications that were already
     sitting with the Rate Approval desk before this demo started. */
  const SEEDED = [
    {
      id: 'APP-00000001', leadId: 'L-001', website: 'https://cairofresh.com', biz: 'Cairo Fresh Market', actor: 'Mostafa Khaled',
      ts: '2026-09-06T14:20:00.000Z',
      summary: {
        email: 'ops@cairofresh.eg', phone: '+20 100 123 4567',
        entity: 'Registered Business', industry: 'Retail & E-commerce',
        services: ['Online Card', 'Online Bank Installments'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'Bank Misr', module: 'PSP' }] },
          { service: 'Online Bank Installments', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
        ],
        posTerminals: '', docsDone: '6', docsTotal: '6',
      },
      documents: [
        { name: 'Commercial Register', file: 'commercial-register.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'owner-id-front-back.pdf' },
        { name: 'Bank Account Letter', file: 'bank-misr-letter.pdf' },
        { name: 'Signed Merchant Agreement', file: 'merchant-agreement-signed.pdf' },
        { name: 'Shop Front Photo', file: 'shop-front.jpg' },
      ],
      requests: [
        { id: 'Online Card::Bank Misr::national-onus', service: 'Online Card', bank: 'Bank Misr',
          rate: 'National — On-us rate (Mastercard/Visa)', tier: 'manager', from: 1, to: 1.5, requested: 1.2, standard: 1.5, requestedFee: 1, standardFee: 2,
          note: 'Processes 450K EGP/month across 3 branches — matching the rate their current provider quoted.' },
        { id: 'Online Card::Bank Misr::meeza-onus', service: 'Online Card', bank: 'Bank Misr',
          rate: 'Meeza — On-us rate', tier: 'manager', from: 0.9, to: 1.2, requested: 1, standard: 1.2, requestedFee: 1.5, standardFee: 1.5,
          note: 'Most of their in-store customers pay with Meeza cards.' },
        { id: 'Online Bank Installments::National Bank of Egypt::6-month', service: 'Online Bank Installments', bank: 'National Bank of Egypt',
          rate: '6-month plan', tier: 'manager', from: 2.5, to: 3, requested: 2.75, standard: 3, requestedFee: 2, standardFee: 2,
          note: 'Installments on large grocery baskets are a key part of their loyalty programme.' },
      ],
    },
    {
      id: 'APP-00000007', leadId: 'L-007', website: 'https://mansouratech.io', biz: 'Mansoura Tech Studio', actor: 'Mostafa Khaled',
      ts: '2026-09-05T11:00:00.000Z',
      summary: {
        email: 'karim@mansouratech.eg', phone: '+20 122 998 7766',
        entity: 'Registered Business', industry: 'Software & SaaS',
        services: ['Online Card', 'Online Wallet'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'National Bank of Egypt', module: 'PF' }] },
          { service: 'Online Wallet', configs: [{ bank: '', module: 'PF' }] },
        ],
        posTerminals: '', docsDone: '7', docsTotal: '7',
      },
      documents: [
        { name: 'Commercial Register', file: 'cr-mansoura-tech.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'karim-nabil-id.pdf' },
        { name: 'Bank Account Letter', file: 'qnb-account-letter.pdf' },
        { name: 'Signed Merchant Agreement', file: 'agreement-signed.pdf' },
        { name: 'Website Terms & Refund Policy', file: 'terms-and-refunds.pdf' },
        { name: 'Wallet Service Addendum', file: 'wallet-addendum.pdf' },
      ],
      requests: [
        { id: 'Online Card::National Bank of Egypt::national-offus', service: 'Online Card', bank: 'National Bank of Egypt',
          rate: 'National — Off-us rate (Mastercard/Visa)', tier: 'head', from: 1, to: 1.5, requested: 0.9, standard: 2, requestedFee: 2, standardFee: 2,
          note: 'Subscription product on thin margins — Karim negotiated this rate before signing.' },
        { id: 'Online Wallet::::wallet', service: 'Online Wallet', bank: '',
          rate: 'Wallet rate', tier: 'head', from: 1, to: 1.5, requested: 0.8, standard: 2, requestedFee: 1, standardFee: 1.5,
          note: 'Their app users top up by wallet — the same deal as cards keeps checkout consistent.' },
        { id: 'Online Card::National Bank of Egypt::intl-EGP', service: 'Online Card', bank: 'National Bank of Egypt',
          rate: 'International rate — EGP', tier: 'manager', from: 2, to: 2.5, requested: 2.2, standard: 2.5, requestedFee: 1.5, standardFee: 3,
          note: 'Half their volume is international clients paying in USD.' },
      ],
    },
    // Returned to the salesperson: reviewed, with rates rejected — waiting on a resubmission.
    {
      id: 'APP-00000005', leadId: 'L-005', website: 'https://gizalearning.edu', biz: 'Giza Learning Hub', actor: 'Mostafa Khaled',
      ts: '2026-09-07T09:10:00.000Z',
      summary: {
        email: 'omar@gizalearning.edu', phone: '+20 106 567 8901',
        entity: 'Professional Business', industry: 'Education',
        services: ['Online Card', 'Online Bank Installments'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'Bank Misr', module: 'PSP' }] },
          { service: 'Online Bank Installments', configs: [{ bank: 'Bank Misr', module: 'PSP' }] },
        ],
        posTerminals: '', docsDone: '5', docsTotal: '5',
      },
      documents: [
        { name: 'Commercial Register', file: 'giza-learning-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'omar-khalil-id.pdf' },
        { name: 'Bank Account Letter', file: 'cib-account-letter.pdf' },
        { name: 'Signed Merchant Agreement', file: 'agreement-signed.pdf' },
      ],
      requests: [
        { id: 'Online Card::Bank Misr::national-onus', service: 'Online Card', bank: 'Bank Misr',
          rate: 'National — On-us rate (Mastercard/Visa)', tier: 'manager', from: 1, to: 1.5, requested: 1.25, standard: 1.5, requestedFee: 1.5, standardFee: 2,
          note: 'Tuition payments peak at the start of each term — a partner referral with steady volume.' },
        { id: 'Online Card::Bank Misr::national-offus', service: 'Online Card', bank: 'Bank Misr',
          rate: 'National — Off-us rate (Mastercard/Visa)', tier: 'manager', from: 1, to: 1.5, requested: 1.1, standard: 1.5, requestedFee: 1, standardFee: 2,
          note: 'Most parents pay with cards from other banks.' },
        { id: 'Online Bank Installments::Bank Misr::12-month', service: 'Online Bank Installments', bank: 'Bank Misr',
          rate: '12-month plan', tier: 'head', from: 3, to: 4, requested: 2.5, standard: 4.5, requestedFee: 2, standardFee: 2,
          note: 'Parents split yearly tuition into 12 installments — the partner asked for this rate.' },
      ],
      seedDecisions: {
        'Online Card::Bank Misr::national-onus': { decision: 'approved', reason: '', by: 'Nadia Salah', roleLabel: 'Sales Manager', ts: '2026-09-07T13:00:00.000Z' },
        'Online Card::Bank Misr::national-offus': { decision: 'rejected', reason: 'Off-us at 1.1% is below cost for this volume — 1.35% is the lowest we can offer.', by: 'Nadia Salah', roleLabel: 'Sales Manager', ts: '2026-09-07T13:05:00.000Z' },
        'Online Bank Installments::Bank Misr::12-month': { decision: 'rejected', reason: 'A 12-month plan under 3% is not viable — resubmit at 3% or above.', by: 'Tarek Fahmy', roleLabel: 'Head of Sales', ts: '2026-09-08T10:30:00.000Z' },
      },
    },
    {
      id: 'APP-00000011', leadId: 'L-028', website: 'https://portsaidmarine.com', biz: 'Port Said Marine Supplies', actor: 'Mostafa Khaled',
      ts: '2026-09-14T09:20:00.000Z',
      summary: {
        email: 'hany@portsaidmarine.com', phone: '+20 100 321 4455',
        entity: 'Registered Business', industry: 'Retail & E-commerce',
        services: ['Online Card'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
        ],
        posTerminals: '', docsDone: '3', docsTotal: '3',
      },
      documents: [
        { name: 'Commercial Register', file: 'port-said-marine-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'port-said-marine-id.pdf' },
      ],
      requests: [
        { id: 'Online Card::National Bank of Egypt::national-onus', service: 'Online Card', bank: 'National Bank of Egypt',
          rate: 'National — On-us rate (Mastercard/Visa)', tier: 'manager', from: 1, to: 1.5, requested: 1.2, standard: 1.5, requestedFee: 1.5, standardFee: 2,
          note: 'Long-standing supplier to shipping agents, steady monthly volume.' },
        { id: 'Online Card::National Bank of Egypt::national-offus', service: 'Online Card', bank: 'National Bank of Egypt',
          rate: 'National — Off-us rate (Mastercard/Visa)', tier: 'manager', from: 1, to: 1.5, requested: 1, standard: 1.5, requestedFee: 1, standardFee: 2,
          note: 'Matching the rate their current provider offers.' },
      ],
      seedDecisions: {
        'Online Card::National Bank of Egypt::national-onus': { decision: 'approved', reason: '', by: 'Nadia Salah', roleLabel: 'Sales Manager', ts: '2026-09-14T13:10:00.000Z' },
        'Online Card::National Bank of Egypt::national-offus': { decision: 'rejected', reason: 'Off-us at 1% is below cost — 1.3% is the lowest we can offer for this volume.', by: 'Nadia Salah', roleLabel: 'Sales Manager', ts: '2026-09-14T13:15:00.000Z' },
      },
    },
    {
      id: 'APP-00000012', leadId: 'L-029', website: 'https://luxorheritagetours.com', biz: 'Luxor Heritage Tours', actor: 'Mostafa Khaled',
      ts: '2026-09-15T10:05:00.000Z',
      summary: {
        email: 'sherine@luxorheritagetours.com', phone: '+20 109 765 4321',
        entity: 'Registered Business', industry: 'Travel & Tourism',
        services: ['Online Card', 'Online Bank Installments'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'Bank Misr', module: 'PSP' }] },
          { service: 'Online Bank Installments', configs: [{ bank: 'Bank Misr', module: 'PSP' }] },
        ],
        posTerminals: '', docsDone: '3', docsTotal: '3',
      },
      documents: [
        { name: 'Commercial Register', file: 'luxor-heritage-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'luxor-heritage-id.pdf' },
      ],
      requests: [
        { id: 'Online Card::Bank Misr::international', service: 'Online Card', bank: 'Bank Misr',
          rate: 'International rate — EGP', tier: 'manager', from: 2, to: 2.5, requested: 1.8, standard: 2.5, requestedFee: 1.5, standardFee: 3,
          note: 'Most bookings are paid by tourists with foreign cards.' },
        { id: 'Online Bank Installments::Bank Misr::6-month', service: 'Online Bank Installments', bank: 'Bank Misr',
          rate: '6-month plan', tier: 'head', from: 2, to: 3, requested: 1.5, standard: 3, requestedFee: 2, standardFee: 2,
          note: 'Multi-day tour packages paid in installments.' },
      ],
      seedDecisions: {
        'Online Card::Bank Misr::international': { decision: 'rejected', reason: 'International cards cost more to process — 2.2% is the lowest we can approve.', by: 'Nadia Salah', roleLabel: 'Sales Manager', ts: '2026-09-15T12:40:00.000Z' },
        'Online Bank Installments::Bank Misr::6-month': { decision: 'rejected', reason: 'A 6-month plan under 2.5% is not viable — resubmit at 2.5% or above.', by: 'Tarek Fahmy', roleLabel: 'Head of Sales', ts: '2026-09-16T09:30:00.000Z' },
      },
    },
    {
      id: 'APP-00000013', leadId: 'L-030', website: 'https://maadifitness.com', biz: 'Maadi Fitness Club', actor: 'Mostafa Khaled',
      ts: '2026-09-10T11:30:00.000Z',
      seedAccount: { status: 'rejected', by: 'Rana Adel', ts: '2026-09-12T10:45:00.000Z', reason: 'The commercial register expired in June 2026. Upload a valid register and resubmit.',
        items: [{ type: 'Document', name: 'Commercial Register', reason: 'Expired in June 2026 \u2014 upload a valid copy.' }] },
      summary: {
        email: 'ramy@maadifitness.com', phone: '+20 106 222 3344',
        entity: 'Registered Business', industry: 'Entertainment & Media',
        services: ['Online Card'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
        ],
        posTerminals: '', docsDone: '3', docsTotal: '3',
      },
      documents: [
        { name: 'Commercial Register', file: 'maadi-fitness-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'maadi-fitness-id.pdf' },
      ],
      requests: [],
    },
    {
      id: 'APP-00000014', leadId: 'L-031', website: 'https://fayoumorganic.com', biz: 'Fayoum Organic Farms', actor: 'Mostafa Khaled',
      ts: '2026-09-11T14:10:00.000Z',
      seedAccount: { status: 'rejected', by: 'Rana Adel', ts: '2026-09-13T15:20:00.000Z', reason: 'The activity on the tax card is wholesale trading, which does not match the Retail & E-commerce industry selected. Correct the industry or the documents.',
        items: [{ type: 'Document', name: 'Tax Card', reason: 'Shows wholesale trading, not retail.' }, { type: 'Section', name: 'Industry', reason: 'Pick the industry that matches the tax card.' }] },
      summary: {
        email: 'mona@fayoumorganic.com', phone: '+20 111 556 6778',
        entity: 'Registered Business', industry: 'Retail & E-commerce',
        services: ['Online Card'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'Bank Misr', module: 'PSP' }] },
        ],
        posTerminals: '', docsDone: '3', docsTotal: '3',
      },
      documents: [
        { name: 'Commercial Register', file: 'fayoum-organic-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'fayoum-organic-id.pdf' },
      ],
      requests: [],
    },
    // Applications already past rate approval, one at each onboarding stage.
    {
      id: 'APP-00000006', leadId: 'L-006', website: 'https://zamalekhotel.com', biz: 'Zamalek Boutique Hotel', actor: 'Mostafa Khaled',
      ts: '2026-09-04T10:15:00.000Z', seedAccount: { status: 'submitted' },
      summary: {
        email: 'dina@zamalekhotel.com', phone: '+20 128 678 9012',
        entity: 'Registered Business', industry: 'Travel & Tourism',
        services: ['Online Card', 'POS Card'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
          { service: 'POS Card', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
        ],
        posTerminals: '2', docsDone: '6', docsTotal: '6',
      },
      documents: [
        { name: 'Commercial Register', file: 'zamalek-hotel-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Tourism Licence', file: 'ministry-tourism-licence.pdf' },
        { name: 'Owner National ID', file: 'dina-fathy-id.pdf' },
        { name: 'Bank Account Letter', file: 'nbe-account-letter.pdf' },
        { name: 'Signed Merchant Agreement', file: 'agreement-signed.pdf' },
      ],
      requests: [],
    },
    {
      id: 'APP-00000010', leadId: 'L-010', website: 'https://aswanrealty.com', biz: 'Aswan Realty Partners', actor: 'Mostafa Khaled',
      ts: '2026-09-02T13:40:00.000Z',
      seedAccount: { status: 'pending-configurations', by: 'Rana Adel', ts: '2026-09-07T09:30:00.000Z', approvedTs: '2026-09-07T09:30:00.000Z' },
      summary: {
        email: 'farida@aswanrealty.com', phone: '+20 111 012 3456',
        entity: 'Registered Business', industry: 'Real Estate',
        services: ['Online Card', 'Online Bank Installments'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'Bank Misr', module: 'PF' }] },
          { service: 'Online Bank Installments', configs: [{ bank: 'Bank Misr', module: 'PF' }, { bank: 'National Bank of Egypt', module: 'PF' }] },
        ],
        posTerminals: '', docsDone: '5', docsTotal: '5',
      },
      documents: [
        { name: 'Commercial Register', file: 'aswan-realty-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'farida-gamal-id.pdf' },
        { name: 'Bank Account Letter', file: 'banque-misr-letter.pdf' },
        { name: 'Signed Merchant Agreement', file: 'agreement-signed.pdf' },
      ],
      requests: [],
    },
    {
      id: 'APP-00000004', leadId: 'L-004', website: 'https://alexautoparts.com', biz: 'Alexandria Auto Parts', actor: 'Mostafa Khaled',
      ts: '2026-08-18T08:50:00.000Z',
      seedAccount: { status: 'live', by: 'Rana Adel', ts: '2026-08-30T15:05:00.000Z', approvedTs: '2026-08-22T11:20:00.000Z' },
      summary: {
        email: 'salma@alexautoparts.com', phone: '+20 155 456 7890',
        entity: 'Registered Business', industry: 'Automotive',
        services: ['Online Card', 'POS Card'],
        serviceConfigs: [
          { service: 'Online Card', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
          { service: 'POS Card', configs: [{ bank: 'National Bank of Egypt', module: 'PSP' }] },
        ],
        posTerminals: '3', docsDone: '5', docsTotal: '5',
      },
      documents: [
        { name: 'Commercial Register', file: 'alex-auto-cr.pdf' },
        { name: 'Tax Card', file: 'tax-card.pdf' },
        { name: 'Owner National ID', file: 'salma-reda-id.pdf' },
        { name: 'Bank Account Letter', file: 'qnb-letter.pdf' },
        { name: 'Signed Merchant Agreement', file: 'agreement-signed.pdf' },
      ],
      requests: [],
    },
  ];
  // Applications added for testing the Cases module: ten in Underwriting Review, three in Bank Submission.
  SEEDED.push.apply(SEEDED, [
  {
    "id": "APP-00000038",
    "leadId": "L-038",
    "website": "https://smartkids.eg",
    "biz": "Smart Kids Toys",
    "actor": "Mostafa Khaled",
    "ts": "2026-10-02T10:14:00.000Z",
    "summary": {
      "email": "hend@smartkids.eg",
      "phone": "+20 100 700 1138",
      "entity": "Registered Business",
      "industry": "Retail & E-commerce",
      "services": [
        "Online Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PSP"
            }
          ]
        }
      ],
      "posTerminals": "",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "smart-kids-toys-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "smart-kids-toys-id-front.jpg, smart-kids-toys-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "smart-kids-toys-bank-letter.pdf"
      }
    ],
    "requests": [
      {
        "id": "Online Card::Bank Misr::national-onus",
        "service": "Online Card",
        "bank": "Bank Misr",
        "rate": "National — On-us rate (Mastercard/Visa)",
        "tier": "manager",
        "from": 1,
        "to": 1.5,
        "requested": 1.3,
        "standard": 1.5,
        "requestedFee": 1.5,
        "standardFee": 2,
        "note": "Expected monthly volume justifies a lower rate."
      },
      {
        "id": "Online Card::Bank Misr::international",
        "service": "Online Card",
        "bank": "Bank Misr",
        "rate": "International rate — EGP",
        "tier": "manager",
        "from": 2,
        "to": 2.5,
        "requested": 2.2,
        "standard": 2.5,
        "requestedFee": 2.5,
        "standardFee": 3,
        "note": "Competitor quoted 2.2%."
      }
    ],
    "comment": "Fast-growing online toy store, ready to go live this month.",
    "seedAccount": {
      "status": "submitted"
    },
    "seedDecisions": {
      "Online Card::Bank Misr::national-onus": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-02T13:14:00.000Z"
      },
      "Online Card::Bank Misr::international": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-02T13:14:00.000Z"
      }
    }
  },
  {
    "id": "APP-00000039",
    "leadId": "L-039",
    "website": "https://instagram.com/dahabdiving",
    "biz": "Dahab Diving Academy",
    "actor": "Aya Muhammed",
    "ts": "2026-10-03T10:21:00.000Z",
    "summary": {
      "email": "tarek@dahabdiving.com",
      "phone": "+20 122 700 1139",
      "entity": "Registered Business",
      "industry": "Travel & Tourism",
      "services": [
        "Online Card",
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        },
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        }
      ],
      "posTerminals": "2",
      "docsDone": "5",
      "docsTotal": "5"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "dahab-diving-academy-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "dahab-diving-academy-id-front.jpg, dahab-diving-academy-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "dahab-diving-academy-bank-letter.pdf"
      },
      {
        "name": "Store Image",
        "file": "dahab-diving-academy-storefront.jpg"
      }
    ],
    "requests": [],
    "comment": "Two POS terminals for the dive shop and the reception desk.",
    "seedAccount": {
      "status": "submitted"
    }
  },
  {
    "id": "APP-00000040",
    "leadId": "L-040",
    "website": "",
    "biz": "Alex Seafood House",
    "actor": "Nour Hamdy",
    "ts": "2026-10-04T10:28:00.000Z",
    "summary": {
      "email": "mina@alexseafood.com",
      "phone": "+20 111 700 1140",
      "entity": "Registered Business",
      "industry": "Food & Beverage",
      "services": [
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "3",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "alex-seafood-house-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "alex-seafood-house-id-front.jpg, alex-seafood-house-id-back.jpg"
      },
      {
        "name": "Store Image",
        "file": "alex-seafood-house-storefront.jpg"
      }
    ],
    "requests": [
      {
        "id": "POS Card::Bank Misr::national-onus",
        "service": "POS Card",
        "bank": "Bank Misr",
        "rate": "National — On-us rate (Mastercard/Visa)",
        "tier": "manager",
        "from": 1,
        "to": 1.5,
        "requested": 1.3,
        "standard": 1.5,
        "requestedFee": 1.5,
        "standardFee": 2,
        "note": "Expected monthly volume justifies a lower rate."
      },
      {
        "id": "POS Card::Bank Misr::international",
        "service": "POS Card",
        "bank": "Bank Misr",
        "rate": "International rate — EGP",
        "tier": "manager",
        "from": 2,
        "to": 2.5,
        "requested": 2.2,
        "standard": 2.5,
        "requestedFee": 2.5,
        "standardFee": 3,
        "note": "Competitor quoted 2.2%."
      }
    ],
    "comment": "Three branches, one terminal each.",
    "seedAccount": {
      "status": "submitted"
    },
    "seedDecisions": {
      "POS Card::Bank Misr::national-onus": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-04T13:28:00.000Z"
      },
      "POS Card::Bank Misr::international": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-04T13:28:00.000Z"
      }
    }
  },
  {
    "id": "APP-00000041",
    "leadId": "L-041",
    "website": "https://brightdental.eg",
    "biz": "Cairo Bright Dental",
    "actor": "Karim Zaki",
    "ts": "2026-10-05T10:35:00.000Z",
    "summary": {
      "email": "rana@brightdental.eg",
      "phone": "+20 106 700 1141",
      "entity": "Professional Business",
      "industry": "Healthcare / Pharmacy",
      "services": [
        "Online Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "cairo-bright-dental-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "cairo-bright-dental-id-front.jpg, cairo-bright-dental-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "cairo-bright-dental-bank-letter.pdf"
      }
    ],
    "requests": [],
    "seedAccount": {
      "status": "submitted"
    }
  },
  {
    "id": "APP-00000042",
    "leadId": "L-042",
    "website": "https://sohagelectronics.com",
    "biz": "Sohag Electronics",
    "actor": "Mostafa Khaled",
    "ts": "2026-10-06T10:42:00.000Z",
    "summary": {
      "email": "yasser@sohagelectronics.com",
      "phone": "+20 128 700 1142",
      "entity": "Registered Business",
      "industry": "Retail & E-commerce",
      "services": [
        "Online Card",
        "Online Bank Installments"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        },
        {
          "service": "Online Bank Installments",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        }
      ],
      "posTerminals": "",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "sohag-electronics-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "sohag-electronics-id-front.jpg, sohag-electronics-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "sohag-electronics-bank-letter.pdf"
      }
    ],
    "requests": [
      {
        "id": "Online Card::National Bank of Egypt::national-onus",
        "service": "Online Card",
        "bank": "National Bank of Egypt",
        "rate": "National — On-us rate (Mastercard/Visa)",
        "tier": "manager",
        "from": 1,
        "to": 1.5,
        "requested": 1.3,
        "standard": 1.5,
        "requestedFee": 1.5,
        "standardFee": 2,
        "note": "Expected monthly volume justifies a lower rate."
      },
      {
        "id": "Online Card::National Bank of Egypt::international",
        "service": "Online Card",
        "bank": "National Bank of Egypt",
        "rate": "International rate — EGP",
        "tier": "manager",
        "from": 2,
        "to": 2.5,
        "requested": 2.2,
        "standard": 2.5,
        "requestedFee": 2.5,
        "standardFee": 3,
        "note": "Competitor quoted 2.2%."
      }
    ],
    "comment": "Installments are the main reason they want to switch to us.",
    "seedAccount": {
      "status": "submitted"
    },
    "seedDecisions": {
      "Online Card::National Bank of Egypt::national-onus": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-06T13:42:00.000Z"
      },
      "Online Card::National Bank of Egypt::international": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-06T13:42:00.000Z"
      }
    }
  },
  {
    "id": "APP-00000043",
    "leadId": "L-043",
    "website": "https://facebook.com/zagazigbooks",
    "biz": "Zagazig Book Corner",
    "actor": "Aya Muhammed",
    "ts": "2026-10-07T10:49:00.000Z",
    "summary": {
      "email": "heba@zagazigbooks.eg",
      "phone": "+20 114 700 1143",
      "entity": "Individual Seller",
      "industry": "Education",
      "services": [
        "Online Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "zagazig-book-corner-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "zagazig-book-corner-id-front.jpg, zagazig-book-corner-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "zagazig-book-corner-bank-letter.pdf"
      }
    ],
    "requests": [],
    "comment": "Sells school books online through social media.",
    "seedAccount": {
      "status": "submitted"
    }
  },
  {
    "id": "APP-00000044",
    "leadId": "L-044",
    "website": "https://marsaresorts.com",
    "biz": "Marsa Alam Resorts",
    "actor": "Nour Hamdy",
    "ts": "2026-10-09T10:03:00.000Z",
    "summary": {
      "email": "karim@marsaresorts.com",
      "phone": "+20 100 700 1144",
      "entity": "Registered Business",
      "industry": "Travel & Tourism",
      "services": [
        "Online Card",
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        },
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "4",
      "docsDone": "5",
      "docsTotal": "5"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "marsa-alam-resorts-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "marsa-alam-resorts-id-front.jpg, marsa-alam-resorts-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "marsa-alam-resorts-bank-letter.pdf"
      },
      {
        "name": "Store Image",
        "file": "marsa-alam-resorts-storefront.jpg"
      }
    ],
    "requests": [
      {
        "id": "Online Card::Bank Misr::national-onus",
        "service": "Online Card",
        "bank": "Bank Misr",
        "rate": "National — On-us rate (Mastercard/Visa)",
        "tier": "manager",
        "from": 1,
        "to": 1.5,
        "requested": 1.3,
        "standard": 1.5,
        "requestedFee": 1.5,
        "standardFee": 2,
        "note": "Expected monthly volume justifies a lower rate."
      },
      {
        "id": "Online Card::Bank Misr::international",
        "service": "Online Card",
        "bank": "Bank Misr",
        "rate": "International rate — EGP",
        "tier": "manager",
        "from": 2,
        "to": 2.5,
        "requested": 2.2,
        "standard": 2.5,
        "requestedFee": 2.5,
        "standardFee": 3,
        "note": "Competitor quoted 2.2%."
      }
    ],
    "comment": "Resort with four POS points: reception, spa, restaurant and beach bar.",
    "seedAccount": {
      "status": "submitted"
    },
    "seedDecisions": {
      "Online Card::Bank Misr::national-onus": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-09T13:03:00.000Z"
      },
      "Online Card::Bank Misr::international": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-09T13:03:00.000Z"
      }
    }
  },
  {
    "id": "APP-00000045",
    "leadId": "L-045",
    "website": "",
    "biz": "Tanta Pharmacy Group",
    "actor": "Karim Zaki",
    "ts": "2026-10-10T10:10:00.000Z",
    "summary": {
      "email": "eman@tantapharmacy.eg",
      "phone": "+20 155 700 1145",
      "entity": "Registered Business",
      "industry": "Healthcare / Pharmacy",
      "services": [
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        }
      ],
      "posTerminals": "2",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "tanta-pharmacy-group-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "tanta-pharmacy-group-id-front.jpg, tanta-pharmacy-group-id-back.jpg"
      },
      {
        "name": "Store Image",
        "file": "tanta-pharmacy-group-storefront.jpg"
      }
    ],
    "requests": [],
    "seedAccount": {
      "status": "submitted"
    }
  },
  {
    "id": "APP-00000046",
    "leadId": "L-046",
    "website": "https://mokattamcoffee.com",
    "biz": "Mokattam Coffee Roasters",
    "actor": "Mostafa Khaled",
    "ts": "2026-10-12T10:24:00.000Z",
    "summary": {
      "email": "adel@mokattamcoffee.com",
      "phone": "+20 109 700 1146",
      "entity": "Registered Business",
      "industry": "Food & Beverage",
      "services": [
        "Online Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "mokattam-coffee-roasters-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "mokattam-coffee-roasters-id-front.jpg, mokattam-coffee-roasters-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "mokattam-coffee-roasters-bank-letter.pdf"
      }
    ],
    "requests": [
      {
        "id": "Online Card::Bank Misr::national-onus",
        "service": "Online Card",
        "bank": "Bank Misr",
        "rate": "National — On-us rate (Mastercard/Visa)",
        "tier": "manager",
        "from": 1,
        "to": 1.5,
        "requested": 1.3,
        "standard": 1.5,
        "requestedFee": 1.5,
        "standardFee": 2,
        "note": "Expected monthly volume justifies a lower rate."
      },
      {
        "id": "Online Card::Bank Misr::international",
        "service": "Online Card",
        "bank": "Bank Misr",
        "rate": "International rate — EGP",
        "tier": "manager",
        "from": 2,
        "to": 2.5,
        "requested": 2.2,
        "standard": 2.5,
        "requestedFee": 2.5,
        "standardFee": 3,
        "note": "Competitor quoted 2.2%."
      }
    ],
    "comment": "Subscription coffee boxes; wants recurring billing later.",
    "seedAccount": {
      "status": "submitted"
    },
    "seedDecisions": {
      "Online Card::Bank Misr::national-onus": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-12T13:24:00.000Z"
      },
      "Online Card::Bank Misr::international": {
        "decision": "approved",
        "reason": "",
        "by": "Nadia Salah",
        "roleLabel": "Sales Manager",
        "ts": "2026-10-12T13:24:00.000Z"
      }
    }
  },
  {
    "id": "APP-00000047",
    "leadId": "L-047",
    "website": "https://ismailiaspares.com",
    "biz": "Ismailia Auto Spares",
    "actor": "Aya Muhammed",
    "ts": "2026-10-14T10:38:00.000Z",
    "summary": {
      "email": "wael@ismailiaspares.com",
      "phone": "+20 120 700 1147",
      "entity": "Registered Business",
      "industry": "Automotive",
      "services": [
        "Online Card",
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        },
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        }
      ],
      "posTerminals": "1",
      "docsDone": "5",
      "docsTotal": "5"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "ismailia-auto-spares-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "ismailia-auto-spares-id-front.jpg, ismailia-auto-spares-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "ismailia-auto-spares-bank-letter.pdf"
      },
      {
        "name": "Store Image",
        "file": "ismailia-auto-spares-storefront.jpg"
      }
    ],
    "requests": [],
    "comment": "One POS terminal for the counter.",
    "seedAccount": {
      "status": "submitted"
    }
  },
  {
    "id": "APP-00000048",
    "leadId": "L-048",
    "website": "https://instagram.com/fayoumcamps",
    "biz": "Fayoum Lake Camps",
    "actor": "Nour Hamdy",
    "ts": "2026-10-01T10:07:00.000Z",
    "summary": {
      "email": "nada@fayoumcamps.com",
      "phone": "+20 111 700 1148",
      "entity": "Registered Business",
      "industry": "Travel & Tourism",
      "services": [
        "Online Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "fayoum-lake-camps-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "fayoum-lake-camps-id-front.jpg, fayoum-lake-camps-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "fayoum-lake-camps-bank-letter.pdf"
      }
    ],
    "requests": [],
    "seedAccount": {
      "status": "pending-configurations",
      "by": "Rana Adel",
      "ts": "2026-10-05T12:35:00.000Z",
      "approvedTs": "2026-10-05T12:35:00.000Z"
    }
  },
  {
    "id": "APP-00000049",
    "leadId": "L-049",
    "website": "",
    "biz": "Qena Fashion Outlet",
    "actor": "Karim Zaki",
    "ts": "2026-10-02T10:14:00.000Z",
    "summary": {
      "email": "salwa@qenafashion.com",
      "phone": "+20 100 700 1149",
      "entity": "Registered Business",
      "industry": "Fashion & Beauty",
      "services": [
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "Bank Misr",
              "module": "PF"
            }
          ]
        }
      ],
      "posTerminals": "2",
      "docsDone": "4",
      "docsTotal": "4"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "qena-fashion-outlet-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "qena-fashion-outlet-id-front.jpg, qena-fashion-outlet-id-back.jpg"
      },
      {
        "name": "Store Image",
        "file": "qena-fashion-outlet-storefront.jpg"
      }
    ],
    "requests": [],
    "comment": "Two outlets in Qena city centre.",
    "seedAccount": {
      "status": "pending-configurations",
      "by": "Rana Adel",
      "ts": "2026-10-06T12:42:00.000Z",
      "approvedTs": "2026-10-06T12:42:00.000Z"
    }
  },
  {
    "id": "APP-00000050",
    "leadId": "L-050",
    "website": "https://benisuefgrocers.com",
    "biz": "Beni Suef Grocers",
    "actor": "Mostafa Khaled",
    "ts": "2026-10-03T10:21:00.000Z",
    "summary": {
      "email": "magdy@benisuefgrocers.com",
      "phone": "+20 122 700 1150",
      "entity": "Registered Business",
      "industry": "Retail & E-commerce",
      "services": [
        "Online Card",
        "POS Card"
      ],
      "serviceConfigs": [
        {
          "service": "Online Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        },
        {
          "service": "POS Card",
          "configs": [
            {
              "bank": "National Bank of Egypt",
              "module": "PSP"
            }
          ]
        }
      ],
      "posTerminals": "1",
      "docsDone": "5",
      "docsTotal": "5"
    },
    "documents": [
      {
        "name": "Commercial Register",
        "file": "beni-suef-grocers-cr.pdf"
      },
      {
        "name": "Tax Card",
        "file": "tax-card.pdf"
      },
      {
        "name": "Owner National ID",
        "file": "beni-suef-grocers-id-front.jpg, beni-suef-grocers-id-back.jpg"
      },
      {
        "name": "Bank Account Letter",
        "file": "beni-suef-grocers-bank-letter.pdf"
      },
      {
        "name": "Store Image",
        "file": "beni-suef-grocers-storefront.jpg"
      }
    ],
    "requests": [],
    "seedAccount": {
      "status": "pending-configurations",
      "by": "Rana Adel",
      "ts": "2026-10-07T12:49:00.000Z",
      "approvedTs": "2026-10-07T12:49:00.000Z"
    }
  }
]);

  /* The same document goes by a slightly different name on the seeded records and on the application form. */
  const DOC_ALIASES = { 'tax card': 'tax', 'tax identification card': 'tax', 'tax id': 'tax', 'commercial register': 'cr', 'commercial registration (cr)': 'cr',
    'owner national id': 'id', 'national id': 'id', 'bank account letter': 'bank', 'bank account letter / iban proof': 'bank' };

  /* ── Required documents ─────────────────────────────────────────────────────────────
     The same Document Rules the application form applies: a rule asks for its documents when the merchant type, bank, model
     and service all match. A document needed by several services is listed once, with every reason. The application does not
     record the owner's nationality, so the foreign-owner rule is not applied here. */
  const DOC_RULES = [
    { name: 'Identity (universal)',    docs: ['National ID'] },
    { name: 'Bank proof (universal)',  docs: ['Bank Account Letter / IBAN proof'] },
    { name: 'Tax registration',        docs: ['Tax Identification Card'],  entities: ['Registered Business', 'Professional Business'] },
    { name: 'Commercial Registration', docs: ['Commercial Registration (CR)'], entities: ['Registered Business'] },
    { name: 'Bank Misr PSP annex',     docs: ['BM PSP Agreement Annex'],   banks: ['Bank Misr'], modules: ['PSP'] },
    { name: 'Online services',         docs: ['Brand Authorization Letter'], online: true },
    { name: 'POS services',            docs: ['Store Lease / Location Proof'], pos: true },
  ];
  const DOC_FILE = { 'National ID': 'national-id.pdf', 'Bank Account Letter / IBAN proof': 'bank-letter.pdf', 'Tax Identification Card': 'tax-card.pdf', 'Commercial Registration (CR)': 'commercial-register.pdf',
    'BM PSP Agreement Annex': 'bm-psp-annex.pdf', 'Brand Authorization Letter': 'brand-authorization.pdf', 'Store Lease / Location Proof': 'store-lease.pdf', 'Store Image': 'storefront.jpg' };
  /* Every document the application requires: [{ name, why: [reasons] }], in the order the rules list them. */
  function requiredDocuments(app) {
    const s = app.summary || {}, out = new Map(), add = (name, why) => { if (!out.has(name)) out.set(name, []); if (out.get(name).indexOf(why) === -1) out.get(name).push(why); };
    (s.serviceConfigs || []).forEach(sc => (sc.configs && sc.configs.length ? sc.configs : [{}]).forEach(cfg => DOC_RULES.forEach(r => {
      if (r.entities && r.entities.indexOf(s.entity) === -1) return;
      if (r.banks && r.banks.indexOf(cfg.bank) === -1) return;
      if (r.modules && r.modules.indexOf(cfg.module) === -1) return;
      if (r.online && !sc.service.startsWith('Online ')) return;
      if (r.pos && !sc.service.startsWith('POS ')) return;
      r.docs.forEach(d => add(d, r.name));
    })));
    if (s.posTerminals) add('Store Image', 'POS terminals requested');
    if (app.taxInvoice) add('Tax Identification Card', 'Tax invoice');
    return [...out.entries()].map(([name, why]) => ({ name: name, why: why }));
  }
  /* Required documents that were not uploaded. */
  function missingDocuments(app) {
    const have = {};
    (app.documents || []).forEach(d => { if (String(d.file || '').trim()) have[docKey(d.name)] = true; });
    return requiredDocuments(app).filter(d => !have[docKey(d.name)]);
  }
  // Four of the sample applications settle their NBE Card services on PF, so the NBE sheets apply to them; the rest are on PSP and do not get them.
  ['APP-00000039', 'APP-00000045', 'APP-00000047', 'APP-00000050'].forEach(id => {
    const a = SEEDED.find(x => x.id === id);
    if (a) a.summary.serviceConfigs.forEach(sc => sc.configs.forEach(cfg => { if (cfg.bank === 'National Bank of Egypt') cfg.module = 'PF'; }));
  });
  // Sample applications arrive complete, except three left short on purpose so the missing-documents check has something to show.
  (function completeSeededDocuments() {
    const SHORT = ['APP-00000006', 'APP-00000041', 'APP-00000047'];
    SEEDED.forEach(app => {
      if (SHORT.indexOf(app.id) === -1) missingDocuments(app).forEach(d => app.documents.push({ name: d.name, file: DOC_FILE[d.name] || 'document.pdf' }));
      app.summary.docsTotal = String(requiredDocuments(app).length);
      app.summary.docsDone = String(requiredDocuments(app).length - missingDocuments(app).length);
    });
  })();


  /* A seeded application that arrives already reviewed writes its decisions once, the same
     way a real decision would, so the lead shows up as returned. Nothing is written again
     once the application has decisions of its own (or was resubmitted). */
  /* QNB and CIB were removed as institutions: decisions already saved against their rate lines
     follow those lines to the banks the seeded applications now use. */
  (function migrateRemovedBanks() {
    const all = readStore('kashierRateDecisions');
    const to = { QNB: 'National Bank of Egypt', CIB: 'Bank Misr' };
    let changed = false;
    Object.keys(all).forEach(appId => Object.keys(all[appId]).forEach(id => {
      const m = id.match(/^(.*?)::(QNB|CIB)::(.*)$/);
      if (!m) return;
      all[appId][m[1] + '::' + to[m[2]] + '::' + m[3]] = all[appId][id];
      delete all[appId][id];
      changed = true;
    }));
    if (changed) writeStore('kashierRateDecisions', all);
  })();

  (function seedReviewedApplications() {
    const all = readStore('kashierRateDecisions');
    SEEDED.forEach(app => {
      if (!app.seedDecisions || all[app.id]) return;
      all[app.id] = app.seedDecisions;
      const status = statusFor(app.requests, app.seedDecisions);
      const statuses = readStore('kashierAppStatus');
      statuses[app.id] = status;
      writeStore('kashierAppStatus', statuses);
      const leadStatuses = readStore('kashierLeadStatusOverrides');
      leadStatuses[app.leadId] = LEAD_STATUS[status];
      writeStore('kashierLeadStatusOverrides', leadStatuses);
      if (status === 'returned-to-sales') {
        const notes = readStore('kashierLeadReturnNote');
        const rejected = app.requests.filter(r => app.seedDecisions[r.id] && app.seedDecisions[r.id].decision === 'rejected');
        notes[app.leadId] = {
          ts: rejected.map(r => app.seedDecisions[r.id].ts).sort().pop(),
          text: rejected.map(r => {
            const d = app.seedDecisions[r.id];
            return [r.service, r.bank].filter(Boolean).join(' · ') + ' — ' + r.rate + ' rejected by ' + d.by + ': ' + d.reason;
          }).join(' | '),
        };
        writeStore('kashierLeadReturnNote', notes);
      }
    });
    writeStore('kashierRateDecisions', all);
  })();

  /* A seeded application the Onboarding team already rejected goes back to its salesperson the way a real
     rejection does: the lead is Rejected and carries the reason. Written once per application. */
  (function seedRejectedAccounts() {
    SEEDED.forEach(app => {
      if (!app.seedAccount || app.seedAccount.status !== 'rejected') return;
      const statuses = readStore('kashierAppStatus');
      if (statuses[app.id]) return;
      statuses[app.id] = 'rejected-by-onboarding';
      writeStore('kashierAppStatus', statuses);
      const leads = readStore('kashierLeadStatusOverrides');
      leads[app.leadId] = 'application';
      writeStore('kashierLeadStatusOverrides', leads);
      const notes = readStore('kashierLeadReturnNote');
      notes[app.leadId] = { ts: app.seedAccount.ts, kind: 'onboarding',
        text: 'Application rejected by the Onboarding team (' + app.seedAccount.by + '): ' + app.seedAccount.reason };
      writeStore('kashierLeadReturnNote', notes);
    });
  })();

  /* Kashier MIDs are issued with the lead in CRM; applications carry the lead's MID. */
  const LEAD_MIDS = {
    'L-001': 'MID-10237-114', 'L-002': 'MID-10589-227', 'L-003': 'MID-11042-350', 'L-004': 'MID-20458-771',
    'L-005': 'MID-11298-463', 'L-006': 'MID-10874-556', 'L-007': 'MID-10651-689', 'L-008': 'MID-10412-792',
    'L-009': 'MID-33127-905', 'L-010': 'MID-11605-018',
    'L-011': 'MID-11734-128', 'L-012': 'MID-11756-243', 'L-013': 'MID-11789-357', 'L-014': 'MID-11802-461',
    'L-015': 'MID-11825-574', 'L-016': 'MID-11848-689', 'L-017': 'MID-11861-792',
    'L-018': 'MID-11902-118', 'L-019': 'MID-11915-229', 'L-020': 'MID-11928-330', 'L-021': 'MID-11941-441',
    'L-022': 'MID-11954-552', 'L-023': 'MID-11967-663', 'L-024': 'MID-11980-774', 'L-025': 'MID-11993-885',
    'L-026': 'MID-12006-996', 'L-027': 'MID-12019-007',
    'L-028': 'MID-12031-118', 'L-029': 'MID-12044-229', 'L-030': 'MID-12057-330', 'L-031': 'MID-12070-441',
    'L-032': 'MID-12083-552', 'L-033': 'MID-12096-663', 'L-034': 'MID-12109-774', 'L-035': 'MID-12122-885', 'L-036': 'MID-12135-996', 'L-037': 'MID-12148-007',
    'L-038': 'MID-12594-366', 'L-039': 'MID-12607-373', 'L-040': 'MID-12620-380', 'L-041': 'MID-12633-387', 'L-042': 'MID-12646-394', 'L-043': 'MID-12659-401', 'L-044': 'MID-12672-408', 'L-045': 'MID-12685-415', 'L-046': 'MID-12698-422', 'L-047': 'MID-12711-429', 'L-048': 'MID-12724-436', 'L-049': 'MID-12737-443', 'L-050': 'MID-12750-450',
  };

  /* The seeded applications have no stored tracking link, so rebuild the one the lead page
     would hand out. */
  function seededURL(a) {
    const s = a.summary;
    const qs = new URLSearchParams({
      id: a.id, leadId: a.leadId, biz: a.biz, actor: a.actor, ts: a.ts,
      website: a.website || '',
      email: s.email, phone: s.phone, entity: s.entity, industry: s.industry,
      services: s.services.join(','),
      serviceConfigs: JSON.stringify(s.serviceConfigs),
      pricingRequests: JSON.stringify(a.requests),
      documents: JSON.stringify(a.documents || []),
      total: s.docsTotal, done: s.docsDone,
      needsApproval: a.requests.length,
      status: a.requests.length ? 'pending-rate-approval' : 'pending-onboarding-review',
    });
    if (s.posTerminals) qs.set('posTerminals', s.posTerminals);
    return 'merchant-onboarding.html?' + qs.toString();
  }

  /* The seeded applications were submitted with a bank account as their primary payout method. */
  function seededPayout(a) {
    const n = String(a.id).replace(/\D/g, '').padStart(8, '0');
    return { method: 'bank', bankName: 'National Bank of Egypt', branch: 'Main Branch', holder: String(a.biz).replace(/[^\p{L}\p{M}\p{N} ]/gu, '').replace(/ +/g, ' ').trim(), account: '1002' + n };
  }
  /* Every payout method submitted with the application, the primary first. Older applications carry only the primary. */
  function payoutList(app) {
    const list = (app.payouts || []).filter(p => p && p.method);
    if (list.length) return list.slice().sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    return app.payout && app.payout.method ? [Object.assign({ primary: true }, app.payout)] : [];
  }
  /* One line for a payout method, with the account or wallet number masked to its last four digits. */
  function payoutLabel(p) {
    if (!p || !p.method) return '';
    const tail = v => '\u2022\u2022\u2022\u2022 ' + String(v || '').slice(-4);
    return p.method === 'wallet' ? 'E-wallet \u2014 ' + p.provider + ' \u00b7 ' + tail(p.number)
      : 'Bank account \u2014 ' + p.bankName + ' \u00b7 ' + tail(p.account);
  }

  /* Rebuild an application from its tracking link. */
  function parseApplication(leadId, url) {
    const qs = new URLSearchParams(String(url).split('?')[1] || '');
    let requests = [];
    try { requests = JSON.parse(qs.get('pricingRequests') || '[]'); } catch (e) { requests = []; }
    requests = requests.map(r => { const t = escalatedTier(qs.get('actor') || '', r.tier); return t === r.tier ? r : Object.assign({}, r, { tier: t, escalated: true, origTier: r.tier }); });
    let serviceConfigs = [];
    try { serviceConfigs = JSON.parse(qs.get('serviceConfigs') || '[]'); } catch (e) { serviceConfigs = []; }
    let documents = [];
    try { documents = JSON.parse(qs.get('documents') || '[]'); } catch (e) { documents = []; }
    let contracts = [];
    try { contracts = JSON.parse(qs.get('contracts') || '[]'); } catch (e) { contracts = []; }
    let payout = null, payouts = [];
    try { payout = JSON.parse(qs.get('payout') || 'null'); } catch (e) { payout = null; }
    try { payouts = JSON.parse(qs.get('payouts') || '[]'); } catch (e) { payouts = []; }
    if (!payout) payout = payouts.filter(p => p.primary)[0] || null;
    return {
      id: qs.get('id') || '—', leadId: leadId || qs.get('leadId') || '', url: url,
      documents: documents,
      contracts: contracts,
      payout: payout,
      payouts: payouts,
      mid: qs.get('mid') || '',
      website: qs.get('website') || '',
      comment: qs.get('comment') || '',
      taxInvoice: qs.get('taxInvoice') === '1',
      websites: (() => { try { const l = JSON.parse(qs.get('websites') || '[]'); return Array.isArray(l) && l.length ? l : (qs.get('website') ? [qs.get('website')] : []); } catch (e) { return qs.get('website') ? [qs.get('website')] : []; } })(),
      altIndustries: (() => { try { return JSON.parse(qs.get('altIndustries') || '[]'); } catch (e) { return []; } })(),
      transfers: (() => { try { return JSON.parse(qs.get('transfers') || 'null'); } catch (e) { return null; } })(),
      biz: qs.get('biz') || 'Untitled Application',
      actor: qs.get('actor') || 'Unknown',
      ts: qs.get('ts') || new Date().toISOString(),
      revisionOf: qs.get('revisionOf') || '',
      requests: requests,
      summary: {
        email: qs.get('email') || '', phone: qs.get('phone') || '',
        entity: qs.get('entity') || '', industry: qs.get('industry') || '',
        services: (qs.get('services') || '').split(',').filter(Boolean),
        serviceConfigs: serviceConfigs,
        posTerminals: qs.get('posTerminals') || '',
        docsDone: qs.get('done') || '0', docsTotal: qs.get('total') || '0',
      },
    };
  }

  /* Current applications, plus — flagged superseded — the earlier versions that were
     rejected and replaced by a resubmission, kept so their decisions stay on record. */
  function loadApplications() {
    const apps = [];
    const stored = readStore('kashierLeadApplications');
    const seenLeads = new Set();
    Object.entries(stored).forEach(([leadId, url]) => {
      // A stored application replaces any seeded one for the lead, even when it carries no
      // rate requests (a resubmission priced entirely at published rates, say).
      seenLeads.add(leadId);
      // Kept even with no rate requests: it is still a merchant account for the Onboarding team.
      apps.push(parseApplication(leadId, url));
    });
    SEEDED.forEach(a => {
      if (seenLeads.has(a.leadId)) return;
      apps.push(Object.assign({}, a, { url: seededURL(a), payout: a.payout || seededPayout(a) }));
    });
    const superseded = readStore('kashierSupersededApplications');
    Object.keys(superseded).forEach(appId => {
      const entry = superseded[appId];
      const app = parseApplication(entry.leadId, entry.url);
      app.superseded = true;
      app.supersededBy = entry.by;
      apps.push(app);
    });
    return apps;
  }

  /* One approval request per application per level, with its lines and where it stands. */
  function buildRequest(app, tier, allDecisions) {
    const decisions = allDecisions[app.id] || {};
    const lines = app.requests.filter(r => r.tier === tier);
    if (!lines.length) return null;
    const decided = lines.filter(r => decisions[r.id]);
    // Rates are reviewed one at a time: the request stays pending until every rate in it has
    // been reviewed, then it is rejected if any of its rates were, otherwise approved.
    const rejectedHere = lines.filter(r => decisions[r.id] && decisions[r.id].decision === 'rejected');
    let state = 'pending';
    if (decided.length === lines.length) {
      state = rejectedHere.length ? 'rejected' : 'approved';
    }
    const services = [];
    lines.forEach(r => { if (services.indexOf(r.service) === -1) services.push(r.service); });
    return {
      key: app.id + '::' + tier,
      app: app, tier: tier, lines: lines, services: services, state: state,
      pendingLines: lines.filter(r => !decisions[r.id]),
      decision: state === 'rejected' ? decisions[rejectedHere[0].id]
        : state === 'approved'
          ? decided.map(r => decisions[r.id]).sort((a, b) => new Date(b.ts) - new Date(a.ts))[0]
          : null,
    };
  }
  function approvalRequests() {
    const all = readStore('kashierRateDecisions');
    const out = [];
    loadApplications().forEach(app => ['head', 'manager'].forEach(tier => {
      const r = buildRequest(app, tier, all);
      // Closed requests leave the queue entirely — pending and decided views alike. A
      // superseded application only contributes what was actually decided on it.
      if (!r) return;
      if (app.superseded && r.state === 'pending') return;
      out.push(r);
    }));
    return out.sort((a, b) => new Date(a.app.ts) - new Date(b.app.ts));
  }
  function findApprovalRequest(appId, tier) {
    const app = loadApplications().filter(a => a.id === appId)[0];
    return app ? buildRequest(app, tier, readStore('kashierRateDecisions')) : null;
  }
  /* ── Resubmission ──────────────────────────────────────────────────────────────
     After a rejection the salesperson revises the rates that came back and resubmits.
     Rates an approver already approved keep that approval and are not sent again. */

  /* The Manager rate for a line: stored by the onboarding page, or read off the band the
     line was requested in (a Manager-band line starts at it, a Head-band line ends at it). */
  function managerRateFor(line) {
    if (line.managerRate != null) return Number(line.managerRate);
    return Number(line.tier === 'manager' ? line.from : line.to);
  }
  /* Which approval a rate + fixed fee needs — the same rule the onboarding page applies:
     under the Manager rate is the Head's call, anything else under published is a Manager's. */
  function tierForPricing(line, rate, fee) {
    const r = Number(rate), f = Number(fee);
    if (rate === '' || fee === '' || !isFinite(r) || !isFinite(f) || r <= 0 || f < 0) return '';
    if (r < managerRateFor(line)) return 'head';
    const feeStandard = line.standardFee != null ? Number(line.standardFee) : 0;
    if (r < Number(line.standard) || f < feeStandard) return 'manager';
    return 'auto';
  }

  function rejectionOf(app) {
    return statusFor(app.requests, decisionsFor(app.id)) === 'returned-to-sales';
  }
  /* The application a lead's revision starts from, if it came back rejected. */
  function rejectedApplicationFor(leadId) {
    return loadApplications().filter(a => a.leadId === leadId && !a.superseded && rejectionOf(a))[0] || null;
  }
  /* Split a returned application's lines into the rejected rates the salesperson must modify
     and the approved rates that keep their approval. */
  function revisionPlan(app) {
    const decisions = decisionsFor(app.id);
    const revise = [], approved = [];
    app.requests.forEach(line => {
      const d = decisions[line.id];
      if (d && d.decision === 'approved') approved.push({ line: line, decision: d });
      else revise.push({ line: line, decision: d || null });
    });
    return { revise: revise, approved: approved };
  }

  /* Create the resubmitted application: a new id carrying the revised rates that still need
     approval, linked back to the one it replaces. The lead moves to Pending Rate Approval, or
     straight to Underwriting Review when every revised rate is at published pricing. */
  function resubmitApplication(opts) {
    const app = opts.app;
    // Check the stored record, not the caller's copy — it may predate a resubmission made
    // in another tab or a moment ago.
    if (readStore('kashierSupersededApplications')[app.id] || !rejectionOf(app)) return null;
    const revised = opts.revised; // [{ line, rate, fee, note }]
    const qs = new URLSearchParams(String(app.url).split('?')[1] || '');
    const newId = 'APP-' + String(Date.now()).slice(-8);
    const ts = new Date().toISOString();

    const pending = [];
    revised.forEach(item => {
      const tier = tierForPricing(item.line, item.rate, item.fee);
      if (!tier || tier === 'auto') return;
      const managerRate = managerRateFor(item.line);
      pending.push(Object.assign({}, item.line, {
        tier: tier,
        requested: Number(item.rate),
        requestedFee: Number(item.fee),
        note: String(item.note || '').trim(),
        managerRate: managerRate,
        from: tier === 'manager' ? managerRate : (item.line.tier === 'head' ? item.line.from : 0),
        to: tier === 'manager' ? item.line.standard : managerRate,
      }));
    });

    const status = pending.length ? 'pending-rate-approval' : 'pending-onboarding-review';
    qs.set('id', newId);
    qs.set('ts', ts);
    qs.set('pricingRequests', JSON.stringify(pending));
    qs.set('needsApproval', String(pending.length));
    qs.set('status', status);
    qs.set('revisionOf', app.id);
    qs.set('revision', String(Number(qs.get('revision') || 1) + 1));
    if (app.leadId) qs.set('leadId', app.leadId);
    const url = 'merchant-onboarding.html?' + qs.toString();

    const statuses = readStore('kashierAppStatus');
    statuses[newId] = status;
    writeStore('kashierAppStatus', statuses);

    // Keep the rejected version on record so its decisions stay visible to approvers.
    const superseded = readStore('kashierSupersededApplications');
    superseded[app.id] = { leadId: app.leadId, url: app.url, by: newId, ts: ts };
    writeStore('kashierSupersededApplications', superseded);

    if (app.leadId) {
      const apps = readStore('kashierLeadApplications');
      apps[app.leadId] = url;
      writeStore('kashierLeadApplications', apps);

      const leadStatuses = readStore('kashierLeadStatusOverrides');
      leadStatuses[app.leadId] = LEAD_STATUS[status];
      writeStore('kashierLeadStatusOverrides', leadStatuses);

      const ra = readStore('kashierLeadRateApproval');
      ra[app.leadId] = pending.length > 0;
      writeStore('kashierLeadRateApproval', ra);

      // The rejection has been answered, so its note gives way to a resubmission entry.
      const notes = readStore('kashierLeadReturnNote');
      delete notes[app.leadId];
      writeStore('kashierLeadReturnNote', notes);

      const resub = readStore('kashierLeadResubmitted');
      resub[app.leadId] = {
        ts: ts, appId: newId, previousId: app.id, pending: pending.length,
        head: pending.filter(p => p.tier === 'head').length,
        manager: pending.filter(p => p.tier === 'manager').length,
        by: ROLES.sales.name,
      };
      writeStore('kashierLeadResubmitted', resub);
    }
    return { id: newId, url: url, status: status, pending: pending };
  }

  /* ── Merchant accounts (Onboarding team) ─────────────────────────────────────────
     A submitted application is a merchant account in the Merchant module. Once any rate
     approvals are through, the Onboarding team works it in two stages:
       Application submitted  →  ✓ approve internally, send to the bank (or ✗ reject)
       Pending Configurations →  Go Live, once the bank/vendor approval and credentials arrive
     Each step moves the lead and the salesperson's tracking page along with it. */
  const ACCOUNT_STATUS = {
    'rate-approval':          { label: 'Pending rate approval',   tone: 'warn' },
    'returned':               { label: 'Returned to sales',       tone: 'danger' },
    'submitted':              { label: 'Application submitted',   tone: 'warn' },
    'pending-configurations': { label: 'Pending Configurations',  tone: 'warn' },
    'rejected':               { label: 'Application rejected',    tone: 'danger' },
    'live':                   { label: 'Live',                    tone: 'success' },
  };

  function midFor(app) { return app.mid || LEAD_MIDS[app.leadId] || ''; }

  /* The stored onboarding step, or where rate approval leaves the account before one exists. */
  function accountRecord(app) {
    const stored = readStore('kashierAccountStatus')[app.id];
    if (stored) return stored;
    if (app.seedAccount) return app.seedAccount;
    const decisions = decisionsFor(app.id);
    if (app.requests.some(r => !decisions[r.id])) return { status: 'rate-approval' };
    if (app.requests.some(r => decisions[r.id] && decisions[r.id].decision === 'rejected')) return { status: 'returned' };
    return { status: 'submitted' };
  }
  function accountStatusFor(app) { return accountRecord(app).status; }

  function merchantAccounts() {
    return loadApplications()
      .filter(a => !a.superseded)
      .map(a => {
        const rec = accountRecord(a);
        return { app: a, mid: midFor(a), status: rec.status, meta: ACCOUNT_STATUS[rec.status], record: rec };
      })
      .sort((x, y) => new Date(y.app.ts) - new Date(x.app.ts));
  }
  function findAccount(appId) {
    return merchantAccounts().filter(a => a.app.id === appId)[0] || null;
  }

  function setAccount(app, record, appStatus, leadStatus) {
    const all = readStore('kashierAccountStatus');
    all[app.id] = record;
    writeStore('kashierAccountStatus', all);
    const statuses = readStore('kashierAppStatus');
    statuses[app.id] = appStatus;
    writeStore('kashierAppStatus', statuses);
    if (app.leadId) {
      const leads = readStore('kashierLeadStatusOverrides');
      leads[app.leadId] = leadStatus;
      writeStore('kashierLeadStatusOverrides', leads);
    }
  }

  /* Stage 1 ✓ — approved internally, on its way to the bank. */
  function approveAccount(opts) {
    const app = opts.app, prev = accountRecord(app);
    if (opts.role !== 'onboarding' || prev.status !== 'submitted') return null;
    const ts = new Date().toISOString();
    setAccount(app, { status: 'pending-configurations', by: ROLES.onboarding.name, ts: ts, approvedTs: ts },
      'pending-bank-submission', 'bank-submission');
    // The salesperson and their manager are told it went to the bank.
    const owner = roleOfName(app.actor) || 'sales';
    sendMail({ to: audience(app.leadId, chainFor(owner).concat(readStore('kashierContributors')[app.leadId] || [])), kind: 'update', leadId: app.leadId, biz: app.biz, by: ROLES.onboarding.name,
      subject: app.biz + ' is now in Bank Submission',
      lines: [ROLES.onboarding.name + ' approved ' + app.biz + ' internally and sent it to the bank.', 'Application: ' + app.id, 'Next: the bank or vendor approval, then the account goes live.'] });
    return 'pending-configurations';
  }
  /* Stage 1 ✗ — the application goes back to the salesperson with the reason. */
  function rejectAccount(opts) {
    const app = opts.app, prev = accountRecord(app);
    // The bank does not use the application, so Underwriting relays its answer: a rejection by the bank comes in as opts.fromBank
    // while the application sits at the bank, and goes back to the salesperson exactly like an Underwriting rejection.
    const fromBank = !!opts.fromBank;
    if (opts.role !== 'onboarding' || prev.status !== (fromBank ? 'pending-configurations' : 'submitted') || !String(opts.reason || '').trim()) return null;
    const ts = new Date().toISOString();
    const items = (opts.items || []).filter(i => i && i.name && String(i.reason || '').trim()).map(i => ({ type: i.type, name: i.name, reason: String(i.reason).trim() }));
    setAccount(app, { status: 'rejected', by: ROLES.onboarding.name, ts: ts, reason: opts.reason.trim(), items: items, fromBank: fromBank },
      'rejected-by-onboarding', 'application');
    if (app.leadId) {
      const notes = readStore('kashierLeadReturnNote');
      notes[app.leadId] = { ts: ts, kind: 'onboarding',
        text: (fromBank ? 'Application rejected by the bank, returned by the Onboarding team (' : 'Application rejected by the Onboarding team (') + ROLES.onboarding.name + '): ' + opts.reason.trim() };
      writeStore('kashierLeadReturnNote', notes);
    }
    sendMail({ to: audience(app.leadId, chainFor(roleOfName(app.actor) || 'sales').concat(readStore('kashierContributors')[app.leadId] || [])), kind: 'update', leadId: app.leadId, biz: app.biz, by: ROLES.onboarding.name,
      subject: app.biz + (fromBank ? ' was rejected by the bank' : ' was rejected by Underwriting'),
      lines: [ROLES.onboarding.name + (fromBank ? ' returned the application: the bank rejected it.' : ' rejected the application.'), (fromBank ? 'Bank feedback: ' : 'Reason: ') + opts.reason.trim()].concat((items || []).map(i => i.type + ' \u2014 ' + i.name + ': ' + i.reason)).concat(['It is back with ' + app.actor + ' to update and resubmit.']) });
    return 'rejected';
  }
  /* Stage 2 — bank/vendor approval and credentials are in; the account goes live. */
  function goLiveAccount(opts) {
    const app = opts.app, prev = accountRecord(app);
    if (opts.role !== 'onboarding' || prev.status !== 'pending-configurations') return null;
    setAccount(app, { status: 'live', by: ROLES.onboarding.name, ts: new Date().toISOString(), approvedTs: prev.approvedTs || prev.ts },
      'live', 'activated');
    sendMail({ to: audience(app.leadId, chainFor(roleOfName(app.actor) || 'sales').concat(readStore('kashierContributors')[app.leadId] || [])), kind: 'update', leadId: app.leadId, biz: app.biz, by: ROLES.onboarding.name,
      subject: app.biz + ' is live', lines: ['The bank or vendor approved ' + app.biz + ' and the account is live. It is worked from the Merchant module from here.'] });
    return 'live';
  }

  /* ── Payout method changes ───────────────────────────────────────────────────────
     A change request moves the account from one payout method to another and is decided by the
     Onboarding team. The activity keeps every request — who raised it, what changed, who decided it,
     when, and the reason when it was rejected. The payout in force is the submitted one with every
     approved request applied in order. The demo accounts carry a short seeded history. */
  const PAYOUT_FIELDS = {
    bank:   [['bankName', 'Bank Name'], ['branch', 'Bank Branch Name'], ['holder', 'Account Holder Name'], ['account', 'Account Number']],
    wallet: [['provider', 'Wallet Provider'], ['number', 'Wallet Mobile Number'], ['holder', 'Wallet Holder Name']],
  };
  const PAYOUT_METHOD_LABEL = { bank: 'Bank Account', wallet: 'E-Wallet' };

  /* A merchant's payout accounts: the primary one, then any added later, each with a name and an ACC ID. */
  const POS_SEED = { method: 'wallet', provider: 'Vodafone Cash', number: '01012345678', holder: 'Hassan Ibrahim' };
  function accountIds(app) {
    const code = String(midFor(app) || '').replace(/^MID-/, '') || String(app.id).replace(/\D/g, '').padStart(8, '0');
    const id = k => 'ACC-' + code + '-0' + k;
    return { primary: id(1), pos: id(2), korba: id(3), at: id };
  }
  function korbaSeed(app) {
    return { method: 'bank', bankName: 'Banque Misr', branch: 'Giza', holder: 'Hassan Ibrahim', account: '5006' + String(app.id).replace(/\D/g, '').padStart(8, '0') };
  }

  function seededPayoutChanges(app) {
    const status = accountStatusFor(app);
    if (status !== 'pending-configurations' && status !== 'live') return [];
    const base = app.payout;
    if (!base || base.method !== 'bank') return [];
    const t0 = new Date(app.ts).getTime(), now = Date.now(), DAY = 86400000;
    const at = days => new Date(Math.min(t0 + days * DAY + 36e5 * 3, now)).toISOString();
    const n = String(app.id).replace(/\D/g, '').padStart(8, '0');
    const afterBranch = Object.assign({}, base, { branch: 'Maadi' });
    const pos = POS_SEED, korba = korbaSeed(app), ids = accountIds(app);
    const P = { account: 'Primary Account', accId: ids.primary };
    const POS = { account: 'POS', accId: ids.pos }, KORBA = { account: 'POS-Branch Korba', accId: ids.korba };
    const by = ROLES.onboarding.name;
    // A request lists the accounts it changes; each account is decided on its own.
    const reqs = [
      { id: app.id + '::pc1', ref: 'PCR-' + n + '-01', ts: at(3), by: app.biz, items: [
        { ...P, from: base, to: afterBranch, decision: 'approved', decidedBy: by, decidedTs: at(4) }] },
      { id: app.id + '::pc2', ref: 'PCR-' + n + '-02', ts: at(8), by: app.biz, items: [
        { ...P, from: afterBranch,
          to: { method: 'wallet', provider: 'Vodafone Cash', number: '01012345678', holder: 'Hassan Ibrahim' },
          decision: 'rejected', decidedBy: by, decidedTs: at(9),
          reason: 'The wallet holder name does not match the registered business owner. Resubmit with the owner’s name or keep the bank account.' }] },
    ];
    // Newer requests from the merchant, still waiting on the Onboarding team.
    reqs.push({ id: app.id + '::pc4', ref: 'PCR-' + n + '-04', ts: at(16), by: app.biz, items: [
      { ...P, from: afterBranch, to: Object.assign({}, afterBranch, { holder: afterBranch.holder + ' Trading', account: '3004' + n }) }] });
    if (status === 'live') {
      reqs.push({ id: app.id + '::pc5', ref: 'PCR-' + n + '-05', ts: at(18), by: app.biz, items: [
        { ...POS, from: pos,
          to: { method: 'bank', bankName: 'Commercial International Bank (CIB)', branch: 'Nasr City', holder: pos.holder, account: '4005' + n } }] });
      reqs.push({ id: app.id + '::pc6', ref: 'PCR-' + n + '-06', ts: at(19), by: app.biz, items: [
        { ...KORBA, from: korba, to: Object.assign({}, korba, { branch: 'Dokki', account: '6007' + n }) }] });
      // More requests from the merchant, each on one account.
      const more = [
        [8, 20, P, afterBranch, Object.assign({}, afterBranch, { holder: afterBranch.holder + ' LLC' })],
        [9, 21, POS, pos, Object.assign({}, pos, { number: '01098765432' })],
        [10, 22, KORBA, korba, Object.assign({}, korba, { holder: 'Hassan Ibrahim Mostafa' })],
        [11, 23, P, afterBranch, Object.assign({}, afterBranch, { bankName: 'Commercial International Bank (CIB)', branch: 'Zamalek', account: '7008' + n })],
        [12, 24, KORBA, korba, { method: 'wallet', provider: 'WE Pay', number: '01512345678', holder: 'Hassan Ibrahim' }],
      ];
      more.forEach(m => reqs.push({ id: app.id + '::pc' + m[0], ref: 'PCR-' + n + '-' + String(m[0]).padStart(2, '0'), ts: at(m[1]), by: app.biz,
        items: [{ account: m[2].account, accId: m[2].accId, from: m[3], to: m[4] }] }));
      // Each account is its own request, with its own ID and decision.
      reqs.push({ id: app.id + '::pc3', ref: 'PCR-' + n + '-03', ts: at(14), by: app.biz, items: [
        { ...P, from: afterBranch, to: Object.assign({}, afterBranch, { bankName: 'Banque Misr', branch: 'Heliopolis', account: '2003' + n }) }] });
      reqs.push({ id: app.id + '::pc7', ref: 'PCR-' + n + '-07', ts: at(15), by: app.biz, items: [
        { ...POS, from: pos, to: Object.assign({}, pos, { provider: 'Orange Cash', number: '01211122233' }) }] });
    }
    return reqs;
  }

  /* Every payout change request on the account, newest first, with each account's decision applied.
     A request is pending while any of its accounts awaits a decision; once all are decided it is
     approved, rejected, or partial when the accounts went different ways. */
  function payoutChanges(app) {
    const decided = readStore('kashierPayoutDecisions')[app.id] || {};
    return seededPayoutChanges(app).map(r => {
      const items = r.items.map((it, i) => {
        const out = Object.assign({}, it, { id: r.id + '::' + i, primary: it.accId === accountIds(app).primary });
        const d = decided[out.id];
        if (d) { out.decision = d.decision; out.decidedBy = d.by; out.decidedTs = d.ts; out.reason = d.reason || ''; }
        out.state = out.decision || 'pending';
        return out;
      });
      const nOk = items.filter(i => i.state === 'approved').length, nNo = items.filter(i => i.state === 'rejected').length;
      const state = nOk + nNo < items.length ? 'pending' : !nNo ? 'approved' : !nOk ? 'rejected' : 'partial';
      const stamps = items.map(i => i.decidedTs).filter(Boolean).sort();
      return Object.assign({}, r, { items: items, state: state, decidedTs: stamps[stamps.length - 1] || '',
        decidedBy: (items.filter(i => i.decidedTs).sort((a, b) => new Date(b.decidedTs) - new Date(a.decidedTs))[0] || {}).decidedBy });
    }).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }

  /* The primary payout in force: the submitted one with each approved change applied, oldest first. */
  function currentPayout(app) {
    const approved = [];
    payoutChanges(app).forEach(r => r.items.forEach(i => { if (i.state === 'approved' && i.primary) approved.push(i); }));
    approved.sort((a, b) => new Date(a.decidedTs) - new Date(b.decidedTs));
    return approved.length ? approved[approved.length - 1].to : app.payout;
  }

  /* The payout accounts in force now, each with when and by which request it last changed. */
  function payoutAccounts(app) {
    const changes = payoutChanges(app).slice().reverse();   // oldest first
    const latest = accId => {
      let hit = null;
      changes.forEach(r => r.items.forEach(i => {
        if (i.accId === accId && i.state === 'approved' && (!hit || new Date(i.decidedTs) >= new Date(hit.item.decidedTs))) hit = { item: i, ref: r.ref };
      }));
      return hit;
    };
    const ids = accountIds(app), defs = [];
    if (app.payout && app.payout.method) defs.push({ account: 'Primary Account', accId: ids.primary, primary: true, details: app.payout });
    // Other methods the salesperson added with the application; the POS demo accounts stand in only when there are none.
    const extras = payoutList(app).filter(p => !p.primary);
    extras.forEach((p, i) => defs.push({ account: (p.name || '').trim() || 'Payout Account ' + (i + 2), accId: ids.at(i + 2), primary: false, details: p }));
    if (accountStatusFor(app) === 'live' && !extras.length) {
      defs.push({ account: 'POS', accId: ids.pos, primary: false, details: POS_SEED });
      defs.push({ account: 'POS-Branch Korba', accId: ids.korba, primary: false, details: korbaSeed(app) });
    }
    return defs.map(d => {
      const hit = latest(d.accId);
      return Object.assign({}, d, { details: hit ? hit.item.to : d.details, updatedTs: hit ? hit.item.decidedTs : '', ref: hit ? hit.ref : '' });
    });
  }

  /* ── Payout method verification ─────────────────────────────────────────────────
     Every payout method submitted with the application is checked twice: the Onboarding team approves it,
     then the merchant confirms it from the email sent to the contact address, with a one-time code (OTP).
     States: pending-ops → awaiting-merchant → verified, or rejected (by Ops, with a reason). */
  const OTP_MINUTES = 10, OTP_TRIES = 3;
  const seedOtp = key => { let h = 7; String(key).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 900000; }); return String(100000 + h); };
  const newOtp = () => String(100000 + Math.floor(Math.random() * 900000));
  function payoutVerification(app, accId) {
    const rec = (readStore('kashierPayoutVerification')[app.id] || {})[accId];
    const email = (app.summary && app.summary.email) || '';
    if (rec) return Object.assign({ email: email }, rec);
    const st = accountStatusFor(app);
    if (st === 'live') return { state: 'verified', email: email, verifiedTs: (accountRecord(app).ts || app.ts), opsBy: ROLES.onboarding.name, opsTs: app.ts };
    if (st === 'pending-configurations') {
      const t = accountRecord(app).approvedTs || accountRecord(app).ts || app.ts;
      return { state: 'awaiting-merchant', email: email, opsBy: ROLES.onboarding.name, opsTs: t, sentTs: t, otp: seedOtp(app.id + accId), tries: 0, seeded: true };
    }
    return { state: 'pending-ops', email: email };
  }
  function savePayoutVerification(app, accId, rec) {
    const all = readStore('kashierPayoutVerification');
    (all[app.id] = all[app.id] || {})[accId] = rec;
    writeStore('kashierPayoutVerification', all);
  }
  const payoutWho = (app, accId) => { const a = payoutAccounts(app).filter(x => x.accId === accId)[0]; return a ? a.account + ' (' + payoutLabel(a.details) + ')' : 'Payout method'; };
  /* The Onboarding team approves or rejects a submitted payout method. Approving sends the merchant the verification email. */
  function reviewPayoutMethod(opts) {
    const app = opts.app, v = payoutVerification(app, opts.accId), reason = String(opts.reason || '').trim();
    if (opts.role !== 'onboarding' || v.state !== 'pending-ops') return null;
    if (opts.decision === 'rejected' && !reason) return null;
    const now = new Date().toISOString(), who = ROLES.onboarding.name, label = payoutWho(app, opts.accId);
    if (opts.decision === 'approved') {
      savePayoutVerification(app, opts.accId, { state: 'awaiting-merchant', opsBy: who, opsTs: now, sentTs: now, otp: newOtp(), tries: 0 });
      logEvent(app.leadId, who, 'Payout method approved \u2014 ' + label, now, { action: 'Approved', category: 'Payout', role: 'Onboarding Team',
        details: [{ label: 'Next step', value: 'The merchant verifies it with the OTP emailed to ' + (app.summary.email || 'the contact email') }] });
      logEvent(app.leadId, 'System', 'Verification email sent to ' + (app.summary.email || 'the merchant') + ' \u2014 ' + label, now, { action: 'Sent', category: 'Payout', role: '', system: true,
        details: [{ label: 'Code valid for', value: OTP_MINUTES + ' minutes' }] });
    } else {
      savePayoutVerification(app, opts.accId, { state: 'rejected', opsBy: who, opsTs: now, reason: reason });
      logEvent(app.leadId, who, 'Payout method rejected \u2014 ' + label, now, { action: 'Rejected', category: 'Payout', role: 'Onboarding Team', details: [{ label: 'Reason', value: reason }] });
    }
    return opts.decision;
  }
  /* A new code, after one expired or the tries ran out. */
  function resendPayoutOtp(app, accId) {
    const v = payoutVerification(app, accId);
    if (v.state !== 'awaiting-merchant') return null;
    const now = new Date().toISOString();
    savePayoutVerification(app, accId, Object.assign({}, v, { sentTs: now, otp: newOtp(), tries: 0, seeded: false }));
    logEvent(app.leadId, 'System', 'Verification email sent again to ' + (app.summary.email || 'the merchant') + ' \u2014 ' + payoutWho(app, accId), now,
      { action: 'Sent', category: 'Payout', role: '', system: true, details: [{ label: 'Code valid for', value: OTP_MINUTES + ' minutes' }] });
    return true;
  }
  /* The merchant enters the code from the email. Returns { ok } or { error }. */
  function verifyPayoutOtp(app, accId, code) {
    const v = payoutVerification(app, accId);
    if (v.state !== 'awaiting-merchant') return { error: 'This payout method is not waiting for verification.' };
    if (v.tries >= OTP_TRIES) return { error: 'Too many wrong codes. Ask for a new code.', locked: true };
    if (Date.now() - new Date(v.sentTs).getTime() > OTP_MINUTES * 60000 && !v.seeded) return { error: 'This code has expired. Ask for a new code.', expired: true };
    if (String(code).trim() !== v.otp) {
      const left = OTP_TRIES - (v.tries + 1);
      savePayoutVerification(app, accId, Object.assign({}, v, { tries: v.tries + 1 }));
      return { error: left > 0 ? 'That code is not right. ' + left + ' ' + (left === 1 ? 'try' : 'tries') + ' left.' : 'Too many wrong codes. Ask for a new code.', locked: left <= 0 };
    }
    const now = new Date().toISOString();
    savePayoutVerification(app, accId, { state: 'verified', opsBy: v.opsBy, opsTs: v.opsTs, sentTs: v.sentTs, verifiedTs: now });
    logEvent(app.leadId, app.biz, 'Payout method verified by the merchant \u2014 ' + payoutWho(app, accId), now, { action: 'Verified', category: 'Payout', role: 'Merchant',
      details: [{ label: 'Verified with', value: 'Email and OTP sent to ' + (app.summary.email || 'the contact email') }] });
    return { ok: true };
  }
  /* The submission's own payout methods with where each stands — what the salesperson and the account page show. */
  function payoutMethodStates(app) {
    return payoutAccounts(app).map(a => Object.assign({}, a, { verification: payoutVerification(app, a.accId) }));
  }

  /* Field-by-field difference between two payout methods; only what changed. */
  function payoutDiff(from, to) {
    const rows = [];
    if (!from || from.method !== to.method) rows.push({ label: 'Method', from: from ? PAYOUT_METHOD_LABEL[from.method] : '', to: PAYOUT_METHOD_LABEL[to.method] });
    PAYOUT_FIELDS[to.method].forEach(([k, label]) => {
      const was = from && from.method === to.method ? from[k] : '';
      if (was !== to[k]) rows.push({ label: label, from: was || '', to: to[k] });
    });
    return rows;
  }

  /* Every field of an account, old beside new, with the ones that changed marked. */
  function payoutCompare(from, to) {
    const rows = [{ label: 'Method', from: from ? PAYOUT_METHOD_LABEL[from.method] : '', to: PAYOUT_METHOD_LABEL[to.method] }];
    PAYOUT_FIELDS[to.method].forEach(([k, label]) => {
      rows.push({ label: label, from: from && from.method === to.method ? from[k] : '', to: to[k] });
    });
    rows.forEach(r => { r.changed = r.from !== r.to; });
    return rows;
  }

  /* Decide one account of a request, by its item id. */
  function decidePayoutChange(opts) {
    let item = null;
    payoutChanges(opts.app).forEach(r => r.items.forEach(i => { if (i.id === opts.id) item = i; }));
    const reason = String(opts.reason || '').trim();
    if (opts.role !== 'onboarding' || !item || item.state !== 'pending') return null;
    if (opts.decision === 'rejected' && !reason) return null;
    const all = readStore('kashierPayoutDecisions');
    (all[opts.app.id] = all[opts.app.id] || {})[item.id] = {
      decision: opts.decision, by: ROLES.onboarding.name, ts: new Date().toISOString(), reason: opts.decision === 'rejected' ? reason : '' };
    writeStore('kashierPayoutDecisions', all);
    return opts.decision;
  }

  /* What happened to the account, oldest first — the Logs tab. */
  function accountLog(app) {
    const events = [{ ts: app.ts, who: app.actor, text: 'Application submitted by Sales' + (app.comment ? ' \u2014 "' + app.comment + '"' : '') }];
    const decisions = decisionsFor(app.id);
    const seen = {};
    app.requests.forEach(r => {
      const d = decisions[r.id];
      if (!d) return;
      const key = d.ts + d.by + d.decision;
      if (seen[key]) { seen[key].rates.push(r.rate); return; }
      seen[key] = { ts: d.ts, who: d.by, decision: d.decision, reason: d.reason, rates: [r.rate] };
      events.push(seen[key]);
    });
    Object.keys(seen).forEach(k => {
      const e = seen[k];
      e.text = (e.decision === 'approved' ? 'Approved ' : 'Rejected ') + e.rates.join(', ') + (e.reason ? ' — ' + e.reason : '');
    });
    const rec = accountRecord(app);
    if (rec.approvedTs) events.push({ ts: rec.approvedTs, who: rec.by, text: 'Approved internally and sent to the bank' });
    if (rec.status === 'rejected') events.push({ ts: rec.ts, who: rec.by, text: 'Application rejected — ' + rec.reason });
    if (rec.status === 'live') events.push({ ts: rec.ts, who: rec.by, text: 'Bank/vendor approval received — account is live' });
    (readStore('kashierApplicationLog')[app.leadId] || []).filter(e => e.category === 'Payout').forEach(e => events.push({ ts: e.ts, who: e.who, text: e.text }));
    return events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  }

  function accountURL(appId) {
    return 'merchant-account.html?app=' + encodeURIComponent(appId);
  }

  /* An application has one view, whatever its status: the onboarding form. */
  function applicationURL(leadId) {
    return leadId ? 'merchant-onboarding.html?leadId=' + encodeURIComponent(leadId) : 'sales-leads.html';
  }

  /* ── Activity log ───────────────────────────────────────────────────────────────
     Every action on an application, newest first. Most of it is read off what was already
     recorded (submission, each rate decision, the Onboarding team's steps, resubmissions);
     the rest — starting the application, marking it Lost — is written as it happens. */
  function logEvent(leadId, who, text, ts, extra) {
    if (!leadId) return;
    const all = readStore('kashierApplicationLog');
    (all[leadId] = all[leadId] || []).push(Object.assign({ ts: ts || new Date().toISOString(), who: who, text: text }, extra || {}));
    writeStore('kashierApplicationLog', all);
    const actorRole = roleOfName(who);
    if (actorRole && WORKERS.indexOf(actorRole) !== -1) {
      addContributor(leadId, actorRole);
      if (extra && ['Added', 'Changed', 'Removed', 'Uploaded', 'Canceled'].indexOf(extra.action) !== -1) {
        const biz = bizOf(leadId, extra.biz);
        notifyContributors(leadId, actorRole, who + ' made changes to ' + biz, [text].concat(detailLines(extra.details)), { merge: extra.action !== 'Canceled', biz: biz, by: who });
      }
    }
  }
  const money = (pct, fee, cur) => [pct != null ? pct + '%' : '', fee != null ? fee + ' ' + (cur || 'EGP') : ''].filter(Boolean).join(' + ') || '\u2014';
  /* Structured events, newest first: { ts, who, role, system, action, category, text, details:[{label, value | from, to}] }. */
  function applicationLog(leadId) {
    const apps = loadApplications().filter(a => a.leadId === leadId);
    const superseded = readStore('kashierSupersededApplications');
    const replaces = {};   // new application id -> the rejected one it replaced
    Object.keys(superseded).forEach(prev => { replaces[superseded[prev].by] = prev; });
    const events = [];
    apps.forEach(app => {
      const sm = app.summary || {};
      const need = app.requests || [];
      const nMgr = need.filter(r => r.tier === 'manager').length, nHead = need.filter(r => r.tier === 'head').length;
      const alt = (app.altIndustries || []).map(x => x.activity || x.industry).join(', ');
      const details = [{ label: 'Application', value: app.id }];
      if (replaces[app.id]) details.push({ label: 'Replaces', value: replaces[app.id] });
      if (app.comment) details.push({ label: 'Comment', value: app.comment });
      details.push({ label: 'Services', value: (sm.services || []).join(', ') || '\u2014' });
      if (sm.industry) details.push({ label: 'Industry', value: sm.industry + (alt ? ' \u2014 activities: ' + alt : '') });
      details.push({ label: 'Rates needing approval', value: need.length
        ? need.length + ' \u2014 ' + [nMgr ? nMgr + ' Sales Manager' : '', nHead ? nHead + ' Head of Sales' : ''].filter(Boolean).join(' \u00b7 ')
        : 'None \u2014 every rate at published pricing' });
      const docs = (app.documents || []).length || Number(sm.docsDone || 0);
      if (docs) details.push({ label: 'Documents', value: docs + ' uploaded' });
      payoutList(app).forEach((p, i) => details.push({ label: payoutList(app).length > 1 ? 'Payout method ' + (i + 1) : 'Payout method',
        value: (p.name ? p.name + ' — ' : '') + payoutLabel(p) + (p.primary && payoutList(app).length > 1 ? ' (primary)' : '') }));
      events.push({ ts: app.ts, who: app.actor, role: 'Salesperson', action: replaces[app.id] ? 'Resubmitted' : 'Submitted', category: 'Application',
        text: replaces[app.id] ? 'Resubmitted with revised rates' : 'Application submitted', details: details,
        status: { from: replaces[app.id] ? 'Rejected' : 'New', to: need.length ? 'Pending Rate Approval' : 'Underwriting Review' } });

      const d = decisionsFor(app.id);
      // Approvals carried over from the version this one replaces are already in the log once.
      const prevD = replaces[app.id] ? decisionsFor(replaces[app.id]) : {};
      need.forEach(r => {
        const dec = d[r.id];
        if (!dec) return;
        if (prevD[r.id] && prevD[r.id].ts === dec.ts) return;
        const det = [
          { label: 'Service', value: [r.service, r.bank].filter(Boolean).join(' \u00b7 ') },
          { label: 'Requested', value: money(r.requested, r.requestedFee, r.feeCurrency) },
          { label: 'Published', value: money(r.standard, r.standardFee, r.feeCurrency) },
        ];
        if (r.note) det.push({ label: 'Salesperson justification', value: r.note });
        if (dec.reason) det.push({ label: 'Decision comment', value: dec.reason });
        events.push({ ts: dec.ts, who: dec.by, role: dec.roleLabel, action: dec.decision === 'approved' ? 'Approved' : 'Rejected',
          category: 'Rates', text: r.rate, details: det,
          status: { label: 'Rate decision', from: 'Pending', to: dec.decision === 'approved' ? 'Approved' : 'Rejected' } });
      });
      if (need.length && need.every(r => d[r.id])) {
        const last = need.map(r => d[r.id].ts).sort().pop();
        const rejected = need.filter(r => d[r.id].decision === 'rejected').length;
        events.push({ ts: last, who: 'System', role: '', system: true, action: rejected ? 'Returned' : 'Advanced', category: 'Application',
          text: rejected ? 'Returned to the salesperson' : 'Every rate approved \u2014 sent to Underwriting Review',
          details: rejected ? [{ label: 'Rejected rates', value: rejected + ' of ' + need.length }, { label: 'Next step', value: app.actor + ' modifies the rejected rates and resubmits' }]
            : [{ label: 'Approved rates', value: String(need.length) }, { label: 'Next step', value: 'Underwriting Review by the Onboarding team' }],
          status: { from: 'Pending Rate Approval', to: rejected ? 'Rejected' : 'Underwriting Review' } });
      }
      const rec = accountRecord(app);
      if (rec.approvedTs) events.push({ ts: rec.approvedTs, who: rec.by, role: 'Onboarding Team', action: 'Approved', category: 'Underwriting',
        text: 'Approved internally and sent to the bank', details: [{ label: 'Application', value: app.id }],
        status: { from: 'Underwriting Review', to: 'Bank Submission' } });
      if (rec.status === 'rejected') events.push({ ts: rec.ts, who: rec.by, role: 'Onboarding Team', action: rec.fromBank ? 'Returned' : 'Rejected', category: 'Underwriting',
        text: rec.fromBank ? 'Returned to the salesperson \u2014 rejected by the bank' : 'Application rejected by the Onboarding team', details: [{ label: 'Application', value: app.id }, { label: rec.fromBank ? 'Bank feedback' : 'Reason', value: rec.reason || '\u2014' }].concat((rec.items || []).map(i => ({ label: i.name, value: i.reason, item: i.type }))),
        status: { from: rec.fromBank ? 'Bank Submission' : 'Underwriting Review', to: 'Rejected' } });
      if (rec.status === 'live') events.push({ ts: rec.ts, who: rec.by, role: 'Onboarding Team', action: 'Live', category: 'Underwriting',
        text: 'Bank/vendor approval received \u2014 account is live', details: [{ label: 'Application', value: app.id }],
        status: { from: 'Bank Submission', to: 'Live' } });
    });
    // Opening an application is not an action, so older "Started" entries are not shown.
    (readStore('kashierApplicationLog')[leadId] || []).filter(e => e.action !== 'Started' && e.action !== 'Assigned' && !(e.category === 'Payout' && (e.action === 'Sent' || e.action === 'Verified'))).forEach(e => events.push(Object.assign({ action: 'Note', category: 'Application', role: '' }, e)));
    return events.sort((x, y) => new Date(y.ts) - new Date(x.ts));
  }

  function docKey(n) { const k = String(n || '').trim().toLowerCase(); return DOC_ALIASES[k] || k; }

  /* Why an application is back with the salesperson. It is either rejected by the Onboarding team after
     underwriting review (one reason), or one or more of its rates were rejected by the approvers (a reason each). */
  function rejectionInfo(leadId) {
    const app = loadApplications().filter(a => a.leadId === leadId && !a.superseded)[0];
    if (!app) return null;
    const rec = accountRecord(app);
    if (rec.status === 'rejected') {
      return { kind: 'underwriting', title: rec.fromBank ? 'Rejected by the bank' : 'Rejected by Underwriting', fromBank: !!rec.fromBank, by: rec.by, role: 'Onboarding Team', ts: rec.ts, reason: rec.reason || '', items: [], flagged: rec.items || [] };
    }
    const d = decisionsFor(app.id);
    const items = app.requests.filter(r => d[r.id] && d[r.id].decision === 'rejected').map(r => ({
      rate: r.rate, service: r.service, bank: r.bank, by: d[r.id].by, role: d[r.id].roleLabel, ts: d[r.id].ts, reason: d[r.id].reason || '' }));
    if (!items.length) return null;
    return { kind: 'rates', title: 'Rates rejected', by: items[0].by, role: items[0].role, ts: items.map(i => i.ts).sort().pop(), reason: '', items: items };
  }


  /* ── Email notifications (simulated) ─────────────────────────────────────────────
     Notifications are emails only — the portal has no notifications feature of its own. The emails the portal would send are
     kept here and can be read on emails.html. Who gets what:
       · a rate that needs approval → an "action required" email to that approver (Sales Manager or Head of Sales);
       · anyone who has worked on an application (salesperson, Sales Manager, Head of Sales) → an email with the changes
         others make to it, and with each decision on it;
       · Bank Submission → the salesperson and their manager.
     A Sales Manager is never maker and checker on the same application: rates on an application the Sales Manager
     submitted go to the Head of Sales instead. */
  const emailOf = role => ROLES[role].name.toLowerCase().replace(/\s+/g, '.') + '@kashier.io';
  function roleOfName(name) { return Object.keys(ROLES).filter(k => ROLES[k].name === name)[0] || null; }   // a function: it is used while the shared data loads
  const WORKERS = ['sales', 'manager', 'head'];
  /* The salesperson and the manager above them; a Sales Manager's own manager is the Head of Sales. */
  const chainFor = role => role === 'manager' ? ['manager', 'head'] : role === 'head' ? ['head'] : ['sales', 'manager'];
  const uniq = list => list.filter((x, i) => x && list.indexOf(x) === i);
  const bizOf = (leadId, hint) => hint || ((loadApplications().filter(a => a.leadId === leadId)[0] || {}).biz) || leadId;

  function sendMail(o) {
    const store = readStore('kashierNotifications');
    const list = store.list = store.list || [];
    uniq(o.to).forEach(role => {
      if (!ROLES[role]) return;
      list.unshift({ id: 'N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: o.ts || new Date().toISOString(), to: role, toName: ROLES[role].name, toEmail: emailOf(role),
        subject: o.subject, lines: o.lines || [], leadId: o.leadId || '', appId: o.appId || '', biz: o.biz || '', kind: o.kind || 'info', by: o.by || '', byRole: o.byRole || '', read: false });
    });
    store.list = list.slice(0, 200);
    writeStore('kashierNotifications', store);
  }
  /* Every email sent, newest first. */
  function mailbox() { seedMail(); return (readStore('kashierNotifications').list || []).slice().sort((x, y) => new Date(y.ts) - new Date(x.ts)); }
  /* Watching an application: a Sales Manager or Head of Sales can turn it on to be emailed about every change and action, or
     off to stop. With no choice made, whoever has worked on the application is watching it. */
  function watchChoice(leadId, role) { const w = readStore('kashierWatchers')[leadId]; return w && w[role] != null ? !!w[role] : null; }
  function isWatching(leadId, role) {
    const c = watchChoice(leadId, role);
    return c != null ? c : (readStore('kashierContributors')[leadId] || []).indexOf(role) !== -1;
  }
  /* What the switch shows: Unwatch only once Watch has been chosen. */
  function watchChosen(leadId, role) { return watchChoice(leadId, role) === true; }
  function setWatching(leadId, role, on) {
    const all = readStore('kashierWatchers'), w = all[leadId] = all[leadId] || {};
    w[role] = !!on;
    writeStore('kashierWatchers', all);
  }
  /* Who an update goes to: the people it is addressed to, anyone watching, minus whoever turned watching off. */
  function audience(leadId, base) {
    const watchers = Object.keys(readStore('kashierWatchers')[leadId] || {}).filter(r => watchChoice(leadId, r));
    return uniq((base || []).concat(watchers)).filter(r => watchChoice(leadId, r) !== false);
  }
  function addContributor(leadId, role) {
    if (!leadId || WORKERS.indexOf(role) === -1) return;
    const store = readStore('kashierContributors'), arr = store[leadId] || [];
    if (arr.indexOf(role) === -1) { arr.push(role); store[leadId] = arr; writeStore('kashierContributors', store); }
  }
  /* Tell everyone else who has worked on the application what was just done. Edits from the same person within a
     quarter of an hour are gathered into one email, so a long editing session is not a flood. */
  function notifyContributors(leadId, actorRole, subject, lines, opts) {
    opts = opts || {};
    const others = audience(leadId, readStore('kashierContributors')[leadId] || []).filter(r => r !== actorRole);
    if (!others.length) return;
    const store = readStore('kashierNotifications'), list = store.list = store.list || [];
    const fresh = [];
    others.forEach(role => {
      const hit = opts.merge && list.filter(n => n.to === role && n.leadId === leadId && n.kind === 'changes' && n.byRole === actorRole && !n.read
        && Date.now() - new Date(n.ts).getTime() < 15 * 60000)[0];
      if (hit) { hit.lines = hit.lines.concat(lines).slice(-25); hit.ts = new Date().toISOString(); }
      else fresh.push(role);
    });
    writeStore('kashierNotifications', store);
    if (fresh.length) sendMail({ to: fresh, subject: subject, lines: lines.slice(0, 25), leadId: leadId, biz: opts.biz, kind: opts.merge ? 'changes' : 'update', by: opts.by, byRole: actorRole });
  }
  const detailLines = details => (details || []).map(d => d.from != null ? d.label + ': ' + (d.from || '\u2014') + ' \u2192 ' + (d.to || '\u2014') : d.label + ': ' + d.value);

  /* Rates sent for approval: one "action required" email per approver, and a note to the others who worked on it. */
  function notifySubmission(o) {
    const actorRole = roleOfName(o.actorName) || 'sales';
    addContributor(o.leadId, actorRole);
    const byTier = { manager: [], head: [] };
    (o.requests || []).forEach(r => { const t = escalatedTier(o.actorName, r.tier); if (byTier[t]) byTier[t].push(r); });
    ['manager', 'head'].forEach(tier => {
      const lines = byTier[tier];
      if (!lines.length || tier === actorRole) return;
      const escalated = actorRole === 'manager' && tier === 'head' && lines.some(r => r.tier === 'manager');
      sendMail({ to: [tier], kind: 'action', leadId: o.leadId, biz: o.biz, by: o.actorName, byRole: actorRole,
        subject: 'Action required: ' + lines.length + ' rate' + (lines.length === 1 ? ' needs' : 's need') + ' your approval \u2014 ' + o.biz,
        lines: [o.actorName + (o.resubmission ? ' resubmitted ' : ' submitted ') + o.biz + '.']
          .concat(escalated ? ['It came from a Sales Manager, so it needs the Head of Sales rather than the Sales Manager.'] : [])
          .concat(o.comment ? ['Comment: ' + o.comment] : [])
          .concat(lines.map(r => r.rate + ' (' + [r.service, r.bank].filter(Boolean).join(' \u00b7 ') + '): requested ' + r.requested + '% against ' + r.standard + '% published'
            + (r.note ? ' \u2014 "' + r.note + '"' : ''))) });
    });
    notifyContributors(o.leadId, actorRole, o.actorName + (o.resubmission ? ' resubmitted ' : ' submitted ') + o.biz,
      [o.actorName + (o.resubmission ? ' resubmitted the application.' : ' submitted the application.')].concat(o.comment ? ['Comment: ' + o.comment] : []), { biz: o.biz, by: o.actorName });
  }
  /* A Sales Manager's own rates are approved by the Head of Sales. */
  function escalatedTier(actorName, tier) { return tier === 'manager' && roleOfName(actorName) === 'manager' ? 'head' : tier; }

  function seedMail() {
    // The applications already waiting for an approver have had their action-required email.
    if (readStore('kashierNotifSeeded').done) return;
    approvalRequests().filter(r => r.state === 'pending' && r.pendingLines.length && !r.app.superseded).forEach(r => {
      sendMail({ to: [r.tier], kind: 'action', leadId: r.app.leadId, biz: r.app.biz, by: r.app.actor, ts: r.app.ts,
        subject: 'Action required: ' + r.pendingLines.length + ' rate' + (r.pendingLines.length === 1 ? ' needs' : 's need') + ' your approval \u2014 ' + r.app.biz,
        lines: [r.app.actor + ' submitted ' + r.app.biz + '.'].concat(r.pendingLines.map(l => l.rate + ' (' + [l.service, l.bank].filter(Boolean).join(' \u00b7 ') + '): requested ' + l.requested + '% against ' + l.standard + '% published')) });
    });
    writeStore('kashierNotifSeeded', { done: true });
  }
  /* Rate requests are reviewed on the application's own view too. */
  function requestURL(appId, tier) {
    const a = loadApplications().filter(x => x.id === appId)[0];
    return applicationURL(a && a.leadId);
  }

  return {
    ROLES: ROLES, TIER_LABEL: TIER_LABEL, TIER_OWNER: TIER_OWNER,
    readStore: readStore, writeStore: writeStore,
    getRole: getRole, setRole: setRole,
    decisionsFor: decisionsFor, canRoleAct: canRoleAct,
    statusFor: statusFor, recordDecision: recordDecision, recordRequestDecision: recordRequestDecision,
    loadApplications: loadApplications,
    approvalRequests: approvalRequests, findApprovalRequest: findApprovalRequest, requestURL: requestURL,
    tierForPricing: tierForPricing, rejectedApplicationFor: rejectedApplicationFor,
    revisionPlan: revisionPlan, resubmitApplication: resubmitApplication, applicationURL: applicationURL, logEvent: logEvent, applicationLog: applicationLog, rejectionInfo: rejectionInfo, docKey: docKey, requiredDocuments: requiredDocuments, missingDocuments: missingDocuments, notifySubmission: notifySubmission, sendMail: sendMail, isWatching: isWatching, watchChosen: watchChosen, setWatching: setWatching, mailbox: mailbox, emailOf: emailOf, payoutLabel: payoutLabel, payoutList: payoutList,
    ACCOUNT_STATUS: ACCOUNT_STATUS, midFor: midFor, accountStatusFor: accountStatusFor,
    merchantAccounts: merchantAccounts, findAccount: findAccount, accountLog: accountLog, accountURL: accountURL,
    approveAccount: approveAccount, rejectAccount: rejectAccount, goLiveAccount: goLiveAccount,
    payoutChanges: payoutChanges, payoutAccounts: payoutAccounts, payoutMethodStates: payoutMethodStates, payoutVerification: payoutVerification, reviewPayoutMethod: reviewPayoutMethod, verifyPayoutOtp: verifyPayoutOtp, resendPayoutOtp: resendPayoutOtp, OTP_MINUTES: OTP_MINUTES, currentPayout: currentPayout, payoutDiff: payoutDiff, payoutCompare: payoutCompare, decidePayoutChange: decidePayoutChange,
  };
})();

