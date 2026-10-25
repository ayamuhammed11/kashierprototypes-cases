/* Cases module — shared model and shell for cases.html and case-details.html.

   A case is the Underwriting team's work on one submitted application. It opens when every
   rate is through rate approval, and follows the account the Merchant module already tracks:
     Underwriting Review  (account: submitted)               — review, then approve or reject
     Bank Submission      (account: pending-configurations)  — waiting on the bank, then Submit to the bank
     A case leaves this list when it is rejected (it goes back to the salesperson, and a resubmission opens a new case)
   or once the account is live (it is worked from the Merchant module).
   The decisions themselves are made with the same functions the Merchant module uses
   (approveAccount, rejectAccount, goLiveAccount, reviewPayoutMethod in rate-decisions.js),
   so the salesperson's tracking page, the emails and the logs all stay in step.
   Only what is new here — assignee, review checklist, internal notes — lives in 'kashierCases'. */
window.Cases = (function () {
  const K = window.KashierRates;
  const ME = K.ROLES.onboarding;                       // Underwriting works as the Onboarding Team role
  const TEAM = ['Rana Adel', 'Omar Hassan', 'Salma Nabil'];   // the underwriting agents cases rotate between
  /* Who is using the module. Each agent sees only the cases assigned to them; an Underwriting Manager sees every case and is
     authorized to reassign cases between agents. */
  const USERS = {
    agent:   { key: 'agent',   name: 'Rana Adel',   initials: 'RA', label: 'Underwriting Agent',   canReassign: false },
    agent2:  { key: 'agent2',  name: 'Omar Hassan', initials: 'OH', label: 'Underwriting Agent',   canReassign: false },
    agent3:  { key: 'agent3',  name: 'Salma Nabil', initials: 'SN', label: 'Underwriting Agent',   canReassign: false },
    manager: { key: 'manager', name: 'Layla Samir', initials: 'LS', label: 'Underwriting Manager', canReassign: true },
  };
  function user() { let k = 'agent'; try { k = localStorage.getItem('kashierCasesUser') || 'agent'; } catch (e) { /* storage unavailable */ } return USERS[k] || USERS.agent; }
  function setUser(k) { try { localStorage.setItem('kashierCasesUser', k); } catch (e) { /* storage unavailable */ } }
  // Decisions made here are recorded under whoever is signed in, not a fixed name.
  ME.name = user().name; ME.initials = user().initials;
  const canSee = c => user().canReassign || c.assignee === user().name;
  const STORE = 'kashierCases';

  /* Heroicons (outline, 24px) — path data copied verbatim from @heroicons/react. */
  const P = {
    cases: 'M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75',
    search: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
    down: 'm19.5 8.25-7.5 7.5-7.5-7.5',
    up: 'm4.5 15.75 7.5-7.5 7.5 7.5',
    left: 'M15.75 19.5 8.25 12l7.5-7.5',
    right: 'm8.25 4.5 7.5 7.5-7.5 7.5',
    check: 'm4.5 12.75 6 6 9-13.5',
    x: 'M6 18 18 6M6 6l12 12',
    user: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
    users: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    upload: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
    doc: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
    flag: 'M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5',
    checkCircle: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    exclCircle: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z',
    warn: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
    info: 'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
    cash: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
    card: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
    store: 'M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z',
    clock: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
    chat: 'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z',
    plane: 'M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5',
    undo: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
    rocket: 'M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    bars: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
    plus: 'M12 4.5v15m7.5-7.5h-15',
    trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
    xCircle: 'm9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    mail: 'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
    list: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    pencil: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125',
    inbox: 'M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z',
    updown: 'M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9',
  };
  function icon(name, cls, sw) {
    return '<svg class="' + (cls || 'hi-18') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.5) + '" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="' + P[name] + '"/></svg>';
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const initials = n => String(n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  function ageOf(iso) {
    const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    return d === 0 ? 'Today' : d === 1 ? '1 day' : d + ' days';
  }

  const STATUS = {
    submitted:                { label: 'Underwriting Review', tone: 'warning',  step: 1 },
    'pending-configurations': { label: 'Bank Submission',     tone: 'neutral',  step: 2 },
  };
  const chip = st => { const m = STATUS[st]; return '<span class="chip ' + m.tone + '">' + esc(m.label) + '</span>'; };

  /* ── Local state: assignee, review checklist, internal notes ── */
  const read = () => K.readStore(STORE);
  const write = o => K.writeStore(STORE, o);
  function local(appId) { return Object.assign({ assignee: '', review: {}, notes: [], events: [] }, read()[appId] || {}); }
  function save(appId, patch) { const all = read(); all[appId] = Object.assign(local(appId), patch); write(all); }
  /* Case-only events (assignment, review, notes), shaped like the application log's so both read the same way. */
  function addEvent(app, text, action, who) {
    const l = local(app.id);
    l.events.push({ ts: new Date().toISOString(), who: who || user().name, text: text, action: action || 'Changed', category: 'Case', role: 'Underwriting', details: [] });
    save(app.id, { events: l.events });
  }
  function assign(app, name) {
    const prev = local(app.id).assignee;
    if (prev === name || !user().canReassign || TEAM.indexOf(name) === -1) return false;
    save(app.id, { assignee: name });
    addEvent(app, 'Reassigned the case from ' + (prev || 'no one') + ' to ' + name, 'Assigned');
    K.sendMail({ to: ['onboarding'], kind: 'info', leadId: app.leadId, biz: app.biz, by: user().name, subject: app.id + ' was reassigned to ' + name,
      lines: [user().name + ' reassigned the case for ' + app.biz + ' from ' + (prev || 'no one') + ' to ' + name + '.'] });
    return true;
  }

  /* ── Cases, read off the Merchant module's accounts ── */
  const caseNo = app => app.id;                         // the case ID is the application ID
  /* Round robin: every case without an assignee goes to the next underwriting agent in the team, oldest submission first.
     The pointer is saved, so the rotation continues across visits and a new case never jumps the queue. */
  function autoAssign(accounts) {
    const rr = K.readStore('kashierCasesRR'), st = { next: rr.next || 0 };
    let changed = false;
    accounts.filter(a => !local(a.app.id).assignee).sort((x, y) => new Date(x.app.ts) - new Date(y.app.ts)).forEach(a => {
      const name = TEAM[st.next % TEAM.length]; st.next++; changed = true;
      const l = local(a.app.id);
      l.events.push({ ts: new Date().toISOString(), who: 'System', text: 'Assigned the case to ' + name + ' (round robin)', action: 'Assigned', category: 'Case', role: '', system: true, details: [] });
      save(a.app.id, { assignee: name, events: l.events });
    });
    if (changed) K.writeStore('kashierCasesRR', st);
  }
  function build() {
    autoAssign(K.merchantAccounts().filter(a => STATUS[a.status]));
    const superseded = K.readStore('kashierSupersededApplications');
    const replaces = {};
    Object.keys(superseded).forEach(prev => { replaces[superseded[prev].by] = prev; });
    return K.merchantAccounts().filter(a => STATUS[a.status]).map(a => {
      const l = local(a.app.id), s = a.app.summary;
      return { app: a.app, mid: a.mid, status: a.status, record: a.record, no: caseNo(a.app), assignee: l.assignee, local: l,
        resubmission: replaces[a.app.id] || '', since: a.status === 'submitted' ? a.app.ts : (a.record.ts || a.app.ts),
        services: s.services || [], industry: s.industry, type: s.entity };
    });
  }
  const all = () => build().filter(canSee);
  const get = appId => build().filter(c => c.app.id === appId && canSee(c))[0] || null;

  /* ── Review checklist ──
     Business details and Services & pricing are checked by hand; every document and contract is checked on its
     own row; payout methods follow their own approve/reject, which the Merchant module already records. */
  function payoutState(app) {
    const states = K.payoutMethodStates(app);
    if (!states.length) return { state: 'ok', pending: 0, rejected: [], n: 0 };
    const pending = states.filter(s => s.verification.state === 'pending-ops').length;
    const rejected = states.filter(s => s.verification.state === 'rejected');
    return { state: rejected.length ? 'flag' : pending ? 'todo' : 'ok', pending: pending, rejected: rejected, n: states.length, states: states };
  }
  const docKey = d => 'doc:' + d.name;
  const conKey = (c, i) => 'con:' + (c.name || c.label || c.title || i);
  const conName = (c, i) => c.name || c.label || c.title || 'Contract ' + (i + 1);
  function checks(c) {
    const r = c.local.review, app = c.app, out = [];
    const manual = (key, label, tab) => out.push({ key: key, label: label, tab: tab, state: (r[key] || {}).state || 'todo', reason: (r[key] || {}).reason || '' });
    // The same steps, in the same order, as the application the salesperson filled in.
    manual('business', 'Business details', 'business');
    manual('pricing', 'Services & pricing', 'pricing');
    (app.documents || []).forEach(d => manual(docKey(d), d.name, 'documents'));
    // A required document that was not uploaded blocks approval until the case is rejected back to Sales.
    K.missingDocuments(app).forEach(d => out.push({ key: 'doc:' + d.name, label: d.name, tab: 'documents', state: 'flag', missing: true, why: d.why, reason: 'Required document was not uploaded' }));
    const po = payoutState(app);
    out.push({ key: 'payout', label: 'Payout method', tab: 'payout', optional: true, state: po.n ? po.state : 'na', reason: po.rejected.map(x => x.account + ': ' + (x.verification.reason || '')).join(' | '), auto: true });
    (app.contracts || []).forEach((k, i) => manual(conKey(k, i), conName(k, i), 'contracts'));
    if (!(app.contracts || []).length) out.push({ key: 'contracts', label: 'Contracts', tab: 'contracts', optional: !contractsRequired(app), state: 'na', reason: '' });
    return out;
  }
  /* A PF service needs a signed contract; otherwise contracts are optional. */
  const contractsRequired = app => (app.summary.serviceConfigs || []).some(sc => (sc.configs || []).some(x => x.module === 'PF'));
  function progress(c) {
    const list = checks(c), counted = list.filter(x => x.state !== 'na'), done = counted.filter(x => x.state === 'ok').length;
    return { list: list, done: done, total: counted.length, flagged: list.filter(x => x.state === 'flag'), ready: done === counted.length };
  }
  function setReview(app, key, state, reason, label) {
    const l = local(app.id);
    if (state === 'todo') delete l.review[key]; else l.review[key] = { state: state, reason: reason || '', by: ME.name, ts: new Date().toISOString() };
    save(app.id, { review: l.review });
    if (state === 'ok') addEvent(app, 'Verified ' + label, 'Verified');
    else if (state === 'flag') addEvent(app, 'Flagged ' + label + ' \u2014 ' + reason, 'Flagged');
    else addEvent(app, 'Cleared the review of ' + label, 'Changed');
  }

  /* ── Underwriting decisions (the Merchant module's own functions) ── */
  const approve = app => K.approveAccount({ app: app, role: 'onboarding' });
  const reject = (app, reason, items, fromBank) => K.rejectAccount({ app: app, role: 'onboarding', reason: reason, items: items, fromBank: !!fromBank });
  const goLive = app => K.goLiveAccount({ app: app, role: 'onboarding' });
  function addNote(app, text) {
    const l = local(app.id);
    l.notes.unshift({ ts: new Date().toISOString(), who: user().name, text: text });
    save(app.id, { notes: l.notes });
    addEvent(app, 'Added a note \u2014 ' + text, 'Note');
  }

  /* Everything that happened on the case, newest first: the Merchant module's log plus this module's own events and notes. */
  function activity(c) {
    const base = K.applicationLog(c.app.leadId).filter(e => !e.app || e.app === c.app.id);
    return base.concat(c.local.events).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }


  /* ── Services & pricing, rebuilt the way the sales application shows it ──
     The application lists, for each chosen service, every rate type with its fee. Published pricing depends on the model
     (PSP runs above PF) and, for Card, on the bank's rule for the merchant's activities. A rate Sales asked below published
     pricing is carried on the application as a request; every other rate sits at the published price. */
  const CATALOG = [
    { tier: 'Online', services: ['Online Card', 'Online Wallet', 'Online Valu', 'Online OCTO', 'Online Souhoola', 'Online Contact', 'Online Basata', 'Online Mogo', 'Online Tru', 'Online Forsa', 'Online Aman', 'Online Bank Installments', 'Online Instapay'] },
    { tier: 'POS', services: ['POS Card', 'POS Wallet', 'POS Valu', 'POS OCTO', 'POS Souhoola', 'POS Contact', 'POS Basata', 'POS Mogo', 'POS Tru', 'POS Forsa', 'POS Aman', 'POS Bank Installments', 'POS Instapay'] },
  ];
  const CARD_TIERS = [
    { key: 'national-onus',  label: 'National \u2014 On-us rate (Mastercard/Visa)',  fixedFee: 2,   standard: 1.5 },
    { key: 'national-offus', label: 'National \u2014 Off-us rate (Mastercard/Visa)', fixedFee: 2,   standard: 2 },
    { key: 'meeza-onus',     label: 'Meeza \u2014 On-us rate',                        fixedFee: 1.5, standard: 1.2 },
    { key: 'meeza-offus',    label: 'Meeza \u2014 Off-us rate',                       fixedFee: 1.8, standard: 1.4 },
  ];
  const LOCAL_TIER = { key: 'local', label: 'Local rates', fixedFee: 2, standard: 1.75 };
  const DEFAULT_TIERS = [{ key: 'selling', label: 'Selling rate', fixedFee: 1.5, standard: 1 }];
  const intlTier = cur => ({ key: 'intl-' + cur, label: 'International rate \u2014 ' + cur, fixedFee: 3, standard: 2.5, feeCurrency: cur });
  const BANK_IND = {
    'National Bank of Egypt': { 'Retail & E-commerce': 0.96, 'Food & Beverage': 1.05, 'Healthcare / Pharmacy': 0.98, 'Education': 0.94, 'Travel & Tourism': 1.04, 'Professional Services': 0.97, 'Technology / SaaS': 0.95, 'Real Estate': 1.02, 'Automotive': 1.00, 'Fashion & Beauty': 0.99, 'Entertainment & Media': 1.03, 'Non-profit / NGO': 0.92, 'Government': 0.90, 'Financial Services': 1.06, 'Insurance': 1.01, 'Marketplace': 0.97, 'Logistics & Delivery': 1.02 },
    'Bank Misr': { 'Retail & E-commerce': 1.04, 'Food & Beverage': 0.95, 'Healthcare / Pharmacy': 1.02, 'Education': 1.05, 'Travel & Tourism': 0.97, 'Professional Services': 1.03, 'Technology / SaaS': 1.05, 'Real Estate': 0.98, 'Automotive': 1.00, 'Fashion & Beauty': 1.01, 'Entertainment & Media': 0.97, 'Non-profit / NGO': 1.06, 'Government': 1.08, 'Financial Services': 0.94, 'Insurance': 0.99, 'Marketplace': 1.03, 'Logistics & Delivery': 0.98 },
  };
  const r2 = v => Math.round(v * 100) / 100;
  function bankFactor(app, bank) {
    const acts = [app.summary.industry].concat((app.altIndustries || []).map(a => a.industry)).filter((x, i, a) => x && a.indexOf(x) === i);
    if (!acts.length || !BANK_IND[bank]) return 1;
    return Math.min.apply(null, acts.map(i => BANK_IND[bank][i] || 1));
  }
  /* The rate types of one service on one bank, each with its published rate and fixed fee. */
  function ratesFor(app, service, cfg) {
    const isCard = service.includes('Card'), pf = isCard && cfg.module === 'PF', cur = cfg.currencies && cfg.currencies.length ? cfg.currencies : ['EGP'];
    let tiers = DEFAULT_TIERS;
    if (isCard) {
      if (pf && !cfg.customRates) tiers = [LOCAL_TIER].concat(cur.map(intlTier));
      else if (pf) tiers = CARD_TIERS.map(t => Object.assign({}, t, { standard: LOCAL_TIER.standard, fixedFee: LOCAL_TIER.fixedFee })).concat(cur.map(intlTier));
      else tiers = CARD_TIERS.concat(cur.map(intlTier));
    }
    const bf = isCard && cfg.bank ? bankFactor(app, cfg.bank) : 1, rf = bf * ({ PF: 1, PSP: 1.1 }[cfg.module] || 1);
    return rf === 1 && bf === 1 ? tiers : tiers.map(t => Object.assign({}, t, { standard: r2(t.standard * rf), fixedFee: r2(t.fixedFee * bf) }));
  }

  /* ── Shell: sidebar + topbar (shared by both pages) ── */
  function sidebarHTML() {
    return "<aside class=\"sidebar\" id=\"sidebar\">\n    <div class=\"brand\">kashier</div>\n\n    <a class=\"nav-link\" href=\"home.html\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25\"/></svg>Home</a>\n    <a class=\"nav-link\" href=\"sales-leads.html\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z\"/></svg>My Applications</a>\n    <a class=\"nav-link active\" href=\"cases.html\" aria-current=\"page\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75\"/></svg>Cases</a>\n    <a class=\"nav-link\" href=\"#\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z\"/></svg>BIN Management</a>\n    <a class=\"nav-link\" href=\"#\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21\"/></svg>Financial Institutions</a>\n    <a class=\"nav-link\" href=\"merchants.html\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z\"/></svg>Merchant</a>\n    <a class=\"nav-link\" href=\"#\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z\"/></svg>Business Industries</a>\n    <a class=\"nav-link\" href=\"#\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z\"/></svg>PCC Templates</a>\n    <a class=\"nav-link\" href=\"terminals.html\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25\"/></svg>Terminals</a>\n    <a class=\"nav-link\" href=\"#\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5\"/></svg>Reconciliation</a>\n    <a class=\"nav-link\" href=\"#\"><svg class=\"hi\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z\"/></svg>Transfers</a>\n\n    <div class=\"nav-section\">\n      <div class=\"section-head\" id=\"documentsHead\">Documents\n        <svg class=\"hi-sm\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m4.5 15.75 7.5-7.5 7.5 7.5\"/></svg>\n      </div>\n      <div class=\"nav-sub\" id=\"documentsSub\">\n        <a href=\"document-types.html\">Document Types</a>\n        <a href=\"document-rules.html\">Document Rules</a>\n      </div>\n    </div>\n    <div class=\"nav-section\">\n      <div class=\"section-head\" id=\"balanceHead\">Balance Management\n        <svg class=\"hi-sm\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m4.5 15.75 7.5-7.5 7.5 7.5\"/></svg>\n      </div>\n      <div class=\"nav-sub\" id=\"balanceSub\">\n        <a href=\"#\">Settlement Windows</a>\n        <a href=\"#\">Accounts</a>\n        <a href=\"on-hold.html\">On-Hold</a>\n        <a href=\"#\">Vacations</a>\n      </div>\n    </div>\n  </aside>".replace(/class=\"hi\"/g, 'class=\"hi-18\"');
  }
  function mountShell(opts) {
    document.getElementById('shell-side').outerHTML = sidebarHTML();
    document.getElementById('shell-top').innerHTML =
      '<button class="hamburger" id="hamburger" aria-label="Open menu">' + icon('bars', 'hi', 1.7) + '</button>' +
      (opts.search === false ? '' : '<div class="top-search">' + icon('search', 'hi', 1.5) +
      '<input type="search" id="topSearch" placeholder="' + esc(opts.placeholder || 'Search cases') + '" aria-label="' + esc(opts.placeholder || 'Search cases') + '"></div>') +
      '<div class="topbar-right"><label class="role-switch" style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--cadet-04)">Viewing as<select id="userSel" class="select" style="height:32px;width:auto;font-size:13px;padding:0 8px">' +
      Object.keys(USERS).map(k => '<option value="' + k + '"' + (user().key === k ? ' selected' : '') + '>' + esc(USERS[k].name + ' \u00b7 ' + USERS[k].label.replace('Underwriting ', '')) + '</option>').join('') + '</select></label>' +
      '<button class="lang" type="button">عربي</button><div class="divider"></div>' +
      '<div class="user"><div class="avatar">' + esc(user().initials) + '</div><div class="who"><span class="name">' + esc(user().name) + '</span><span class="role">' + esc(user().label) + '</span></div></div></div>';
    document.getElementById('userSel').addEventListener('change', e => { setUser(e.target.value); location.reload(); });
    const sidebar = document.getElementById('sidebar'), overlay = document.getElementById('overlay');
    document.getElementById('hamburger').addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('open'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
    document.querySelectorAll('.nav-section').forEach(sec => {
      const head = sec.querySelector('.section-head'), sub = sec.querySelector('.nav-sub');
      sub.style.maxHeight = '0px';
      head.addEventListener('click', () => {
        const open = head.classList.toggle('open');
        head.querySelector('svg').style.transform = open ? 'rotate(180deg)' : '';
        sub.style.maxHeight = open ? sub.scrollHeight + 'px' : '0px';
      });
    });
  }

  let toastTimer;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  /* ── Drawer + modal helpers: scroll lock, Esc, focus returns to the trigger ── */
  const openers = new Map();
  function openDrawer(id, trigger) {
    const d = document.getElementById(id), s = document.getElementById('scrim');
    openers.set(id, trigger || document.activeElement);
    d.classList.add('open'); s.classList.add('open'); document.body.classList.add('no-scroll');
    setTimeout(() => (d.querySelector('[data-focus]') || d).focus(), 30);
  }
  function closeDrawer(id) {
    const d = document.getElementById(id);
    d.classList.remove('open'); document.getElementById('scrim').classList.remove('open'); document.body.classList.remove('no-scroll');
    const t = openers.get(id); if (t && t.focus) t.focus();
  }
  function openModal(id, trigger) {
    openers.set(id, trigger || document.activeElement);
    document.getElementById(id).classList.add('open');
    const m = document.querySelector('#' + id + ' .modal');
    setTimeout(() => (m.querySelector('[data-focus]') || m).focus(), 30);
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    const t = openers.get(id); if (t && t.focus) t.focus();
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = document.querySelector('.modal-wrap.open');
    if (m) { closeModal(m.id); return; }
    const d = document.querySelector('.drawer.open');
    if (d) closeDrawer(d.id);
  });

  return { K: K, ME: ME, TEAM: TEAM, user: user, CATALOG: CATALOG, ratesFor: ratesFor, contractsRequired: contractsRequired, STATUS: STATUS, icon: icon, esc: esc, fmtDate: fmtDate, fmtDateTime: fmtDateTime, initials: initials, ageOf: ageOf, chip: chip,
    all: all, get: get, local: local, assign: assign, addEvent: addEvent, checks: checks, progress: progress, setReview: setReview, payoutState: payoutState,
    approve: approve, reject: reject, goLive: goLive, addNote: addNote, activity: activity, mountShell: mountShell, toast: toast,
    openDrawer: openDrawer, closeDrawer: closeDrawer, openModal: openModal, closeModal: closeModal, caseNo: caseNo, docKey: docKey, conKey: conKey, conName: conName };
})();
