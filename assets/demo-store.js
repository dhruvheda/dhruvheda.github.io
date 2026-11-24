/* Aurelia Dental sales demo store.
 * Runs the clinic back office entirely in the browser on sample data, with the same
 * interface as the live dashboard's api-store.js. Data lives in this browser's
 * localStorage (falls back to memory). Nothing is sent or charged.
 * Requires window.CLINIC_CONFIG (assets/config.js) and makeStoreCore (store-core.js).
 */
(function () {
  const CFG = window.CLINIC_CONFIG;
  const KEY = 'aurelia-demo-v3';
  const SEED = 20261124;
  let state = null, memory = null;
  const listeners = new Set();
  const core = window.makeStoreCore(CFG, () => state);
  const { addDays, dayDiff, today, tr, money, fmtDate } = core;
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);

  function read() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return memory; } }
  function write() { memory = state; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* memory only */ } listeners.forEach((f) => f()); }
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = read(); listeners.forEach((f) => f()); } });

  // Keep sample data current: if the demo was seeded on an earlier day, slide every date forward.
  function shiftToToday(s) {
    const n = dayDiff(s.anchor, today());
    if (!n) return s;
    const sd = (d) => (d ? addDays(d, n) : d);
    const st = (t) => (t ? new Date(new Date(t).getTime() + n * 864e5).toISOString() : t);
    s.patients.forEach((p) => { p.createdAt = st(p.createdAt); });
    s.appointments.forEach((a) => { a.date = sd(a.date); a.createdAt = st(a.createdAt); a.remindedAt = st(a.remindedAt); });
    s.invoices.forEach((i) => { i.date = sd(i.date); if (i.payment) i.payment.paidAt = st(i.payment.paidAt); });
    s.offers.forEach((o) => { o.sentAt = st(o.sentAt); o.validTill = sd(o.validTill); });
    s.messages.forEach((m) => { m.at = st(m.at); });
    s.blocked = (s.blocked || []).map(sd);
    s.anchor = today();
    return s;
  }

  function buildInvoice(s, { patientId, appointmentId, date, items, discount, taxPct }) {
    s.counters.invoice += 1;
    const d = date || today();
    return { id: uid('i'), no: `AUR-${d.slice(0, 4)}-${String(s.counters.invoice).padStart(4, '0')}`, patientId, appointmentId: appointmentId || null, date: d, items, discount: discount || null, taxPct: taxPct || 0, ...core.totals(items, discount, taxPct), status: 'unpaid', payment: null, sentVia: [] };
  }

  // ---------- seed ----------
  function seed() {
    let x = SEED; const r = () => { x |= 0; x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const weighted = (pairs) => { const total = pairs.reduce((s, p) => s + p[1], 0); let v = r() * total; for (const [k, w] of pairs) { if ((v -= w) < 0) return k; } return pairs[0][0]; };
    const first = ['Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Isha', 'Kabir', 'Rohan', 'Priya', 'Neha', 'Arjun', 'Meera', 'Sanya', 'Karan', 'Riya', 'Vikram', 'Pooja', 'Rahul', 'Sneha', 'Aman', 'Tanvi', 'Nikhil', 'Kavya', 'Siddharth', 'Ira', 'Manish', 'Shreya', 'Varun', 'Aditi', 'Harsh', 'Nisha', 'Yash', 'Simran', 'Dev', 'Anjali', 'Raghav', 'Ishaan', 'Mehak', 'Tara', 'Kunal', 'Gaurav', 'Ritika'];
    const last = ['Sharma', 'Verma', 'Gupta', 'Mehta', 'Kapoor', 'Malhotra', 'Singh', 'Agarwal', 'Bansal', 'Khanna', 'Chopra', 'Arora', 'Jain', 'Reddy', 'Iyer', 'Nair', 'Bhatia', 'Sethi', 'Saxena', 'Yadav'];
    const areas = ['Sushant Lok 1', 'DLF Phase 4', 'Sector 43', 'Golf Course Road', 'Sector 56', 'South City 1', 'Sohna Road', 'DLF Phase 1'];
    const t0 = today();
    const s = { version: 3, anchor: t0, patients: [], appointments: [], invoices: [], offers: [], messages: [], blocked: [], settings: { dayBefore: true, followUp: true, recall: true, taxPct: 0 }, counters: { invoice: 0 } };
    state = s; // core helpers read the state being built

    first.forEach((fn, i) => {
      const ln = last[(i * 7) % last.length];
      s.patients.push({
        id: 'p' + (i + 1), name: `${fn} ${ln}`, phone: `+91 9${Math.floor(r() * 9e8 + 1e8)}`.replace(/^(\+91 \d{5})(\d{5})$/, '$1 $2'),
        email: `${fn}.${ln}`.toLowerCase() + '@example.com', area: pick(areas), optIn: r() > 0.1, notes: '',
        createdAt: new Date(Date.now() - (60 + Math.floor(r() * 200)) * 864e5).toISOString(),
      });
    });
    const mix = [['consult', 20], ['cleaning', 16], ['filling', 12], ['rct', 8], ['crowns', 6], ['whitening', 6], ['kids', 5], ['wisdom', 5], ['gums', 4], ['implant', 4], ['aligners', 3], ['braces', 3], ['veneers', 3], ['smile', 2], ['dentures', 2], ['allon4', 1]];
    const regular = s.patients.slice(0, 26);
    const addAppt = (date, status) => {
      const tid = weighted(mix);
      const times = core.freeTimes(date, tid, s.appointments, { lead: false });
      if (!times.length) return;
      const p = r() < 0.7 ? pick(regular) : pick(s.patients);
      const a = {
        id: uid('a'), ref: 'AD-' + Math.floor(r() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'),
        patientId: p.id, treatmentId: tid, date, time: pick(times), status, notes: '',
        source: weighted([['website', 45], ['phone', 35], ['walk-in', 20]]), calendarSynced: true,
        createdAt: new Date(new Date(date + 'T09:00:00').getTime() - Math.floor(r() * 6) * 864e5).toISOString(), remindedAt: null,
      };
      s.appointments.push(a);
      if (new Date(p.createdAt) > new Date(a.createdAt)) p.createdAt = a.createdAt;
    };
    const wd = (d) => new Date(d + 'T00:00:00').getDay();
    for (let d = -150; d < 0; d++) {
      const date = addDays(t0, d);
      if (!CFG.hours[wd(date)]) continue;
      const n = wd(date) === 0 ? Math.floor(r() * 2) : 1 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) addAppt(date, weighted([['completed', 85], ['no_show', 8], ['cancelled', 7]]));
    }
    for (let d = 0; d < 14; d++) {
      const date = addDays(t0, d);
      if (!CFG.hours[wd(date)]) continue;
      const n = d === 0 ? 3 : Math.floor(r() * 3);
      for (let k = 0; k < n; k++) addAppt(date, 'confirmed');
    }
    s.appointments.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const o1 = { id: 'o1', title: 'Monsoon Smile Check', code: 'MONSOON15', kind: 'pct', value: 15, validTill: addDays(t0, -60), audience: 'all', channel: 'whatsapp', sentAt: new Date(Date.now() - 95 * 864e5).toISOString(), message: '' };
    const o2 = { id: 'o2', title: 'Festive Whitening', code: 'GLOW20', kind: 'pct', value: 20, validTill: addDays(t0, 10), audience: 'all', channel: 'whatsapp', sentAt: new Date(Date.now() - 20 * 864e5).toISOString(), message: '' };
    s.offers.push(o1, o2);

    s.appointments.filter((a) => a.status === 'completed').forEach((a) => {
      const t = tr(a.treatmentId);
      const qty = a.treatmentId === 'filling' ? 1 + Math.floor(r() * 2) : 1;
      const step = t.priceFrom >= 20000 ? 1000 : 100;
      const price = Math.round((t.priceFrom + (t.priceTo - t.priceFrom) * Math.pow(r(), 2) * 0.6) / step) * step;
      let discount = null;
      const daysAgo = dayDiff(a.date, t0);
      if (daysAgo <= 95 && daysAgo >= 60 && r() < 0.25) discount = { kind: 'pct', value: 15, code: 'MONSOON15' };
      if (daysAgo <= 20 && a.treatmentId === 'whitening' && r() < 0.6) discount = { kind: 'pct', value: 20, code: 'GLOW20' };
      const inv = buildInvoice(s, { patientId: a.patientId, appointmentId: a.id, date: a.date, items: [{ treatmentId: t.id, name: t.name, qty, price }], discount, taxPct: 0 });
      const unpaid = daysAgo <= 12 && r() < 0.18;
      if (!unpaid) inv.payment = { mode: weighted([['UPI', 45], ['Card', 25], ['Cash', 20], ['Online', 10]]), ref: '', paidAt: new Date(new Date(a.date + 'T' + a.time + ':00').getTime() + t.duration * 6e4).toISOString() };
      inv.status = unpaid ? 'unpaid' : 'paid';
      inv.sentVia = unpaid ? [] : ['whatsapp'];
      s.invoices.push(inv);
    });

    const msgs = [];
    s.appointments.forEach((a) => { const p = s.patients.find((y) => y.id === a.patientId); msgs.push({ id: uid('m'), patientId: p.id, channel: 'whatsapp', kind: 'confirmation', at: a.createdAt, status: 'sent', body: core.confirmationText(a, p) }); });
    s.invoices.filter((i) => i.status === 'paid').forEach((i) => msgs.push({ id: uid('m'), patientId: i.patientId, channel: 'whatsapp', kind: 'receipt', at: i.payment.paidAt, status: 'sent', body: core.receiptText(i) }));
    [o1, o2].forEach((o) => {
      o.message = core.defaultOfferMessage(o);
      const rec = s.patients.filter((p) => p.optIn);
      o.stats = { targeted: s.patients.length, sent: rec.length, optedOut: s.patients.length - rec.length };
      rec.forEach((p) => msgs.push({ id: uid('m'), patientId: p.id, channel: o.channel, kind: 'offer', at: o.sentAt, status: 'sent', body: core.renderOffer(o, p) }));
    });
    s.messages = msgs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);
    return s;
  }

  function log({ patientId, channel, kind, body }, persist = true) {
    state.messages.unshift({ id: uid('m'), patientId, channel, kind, body, status: 'sent', at: new Date().toISOString() });
    if (state.messages.length > 600) state.messages.length = 600;
    if (persist) write();
    return { status: 'sent' };
  }

  const API = {
    ...core,
    mode: 'demo',
    get state() { return state; },
    integrations: { googleCalendar: true, googleSheets: true, email: true, whatsapp: true, razorpay: true },
    signedIn: true,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load() { let s = read(); if (!s || s.version !== 3) s = seed(); state = shiftToToday(s); write(); return state; },
    reset() { state = seed(); write(); },

    findOrCreatePatient({ name, phone, email }) {
      let p = state.patients.find((y) => digits(y.phone) === digits(phone));
      if (!p) { p = { id: uid('p'), name, phone, email: email || '', area: '', optIn: true, notes: '', createdAt: new Date().toISOString() }; state.patients.push(p); }
      else if (email && !p.email) p.email = email;
      return p;
    },
    book({ name, phone, email, treatment, date, time, notes, source = 'website', patientId }) {
      if (!tr(treatment)) throw Object.assign(new Error('Please choose a treatment'), { status: 400 });
      if (!core.availableSlots(date, treatment).includes(time)) throw Object.assign(new Error('That slot was just taken. Please pick another time.'), { status: 409 });
      const p = patientId ? core.patient(patientId) : API.findOrCreatePatient({ name, phone, email });
      const a = { id: uid('a'), ref: 'AD-' + Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'), patientId: p.id, treatmentId: treatment, date, time, status: 'confirmed', notes: notes || '', source, calendarSynced: true, createdAt: new Date().toISOString(), remindedAt: null };
      state.appointments.push(a);
      state.appointments.sort((m, n) => (m.date + m.time).localeCompare(n.date + n.time));
      log({ patientId: p.id, channel: 'whatsapp', kind: 'confirmation', body: core.confirmationText(a, p) }, false);
      write();
      return a;
    },
    setStatus(id, status) { const a = core.appointment(id); if (a) { a.status = status; if (status === 'cancelled') a.calendarSynced = false; write(); } },
    updatePatient(id, patch) { Object.assign(core.patient(id), patch); write(); },
    updateSettings(patch) { Object.assign(state.settings, patch); write(); },
    createInvoice(data) {
      let discount = data.discount || null;
      if (discount && discount.code) { const f = core.findOffer(discount.code); if (f.error) throw new Error(f.error); discount = { kind: f.offer.kind, value: f.offer.value, code: f.offer.code }; }
      const inv = buildInvoice(state, { ...data, discount, date: today() });
      state.invoices.push(inv); write(); return inv;
    },
    payInvoice(id, { mode, ref }) {
      const inv = core.invoice(id); if (!inv) return null;
      inv.status = 'paid'; inv.payment = { mode, ref: ref || '', paidAt: new Date().toISOString() };
      const a = inv.appointmentId && core.appointment(inv.appointmentId);
      if (a && a.status === 'confirmed') a.status = 'completed';
      write(); return inv;
    },
    voidInvoice(id) { const inv = core.invoice(id); if (inv) { inv.status = 'void'; write(); } },
    sendReceipt(id, channel) {
      const inv = core.invoice(id);
      if (!inv.sentVia.includes(channel)) inv.sentVia.push(channel);
      return log({ patientId: inv.patientId, channel, kind: 'receipt', body: core.receiptText(inv) });
    },
    paymentLink(id) { // simulated: the dashboard plays a test-mode checkout
      const inv = core.invoice(id);
      log({ patientId: inv.patientId, channel: 'whatsapp', kind: 'payment_link', body: `Payment link for ${money(inv.total)} (bill ${inv.no})` });
      return { url: null, message: { status: 'sent' }, simulated: true };
    },
    receiptPdfUrl: () => null,
    createOffer(o) {
      if (state.offers.some((y) => y.code === o.code)) throw new Error(`Code ${o.code} is already used. Pick another.`);
      const offer = { id: uid('o'), title: o.title, code: o.code.toUpperCase(), kind: o.kind, value: Number(o.value), validTill: o.validTill, audience: o.audience, channel: o.channel, message: o.message, sentAt: new Date().toISOString() };
      const target = core.audience(o.audience), rec = target.filter((p) => p.optIn);
      offer.stats = { targeted: target.length, sent: rec.length, optedOut: target.length - rec.length };
      state.offers.unshift(offer);
      rec.forEach((p) => log({ patientId: p.id, channel: offer.channel, kind: 'offer', body: core.renderOffer(offer, p) }, false));
      write(); return offer;
    },
    sendMessage({ patientId, channel, body }) { return log({ patientId, channel, kind: 'message', body }); },
    sendRemindersNow() {
      const rem = core.reminders().filter((x) => !x.sent);
      rem.forEach((x) => { log({ patientId: x.patient.id, channel: 'whatsapp', kind: 'reminder', body: x.body }, false); x.appt.remindedAt = new Date().toISOString(); });
      write(); return rem.length;
    },
    log,
  };

  window.DemoStore = API;
  API.load();
})();
