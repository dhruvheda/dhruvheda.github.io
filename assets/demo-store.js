/* Aurelia Dental demo store.
 * Runs the whole clinic back office in the browser for the static demo:
 * patients, appointments, invoices, offers and an outbox of messages.
 * Data lives in this browser's localStorage (falls back to memory) and is
 * seeded with realistic sample data relative to today. Nothing is sent anywhere.
 * Requires window.CLINIC_CONFIG (generated from src/config.js at build time).
 */
(function () {
  const CFG = window.CLINIC_CONFIG;
  const KEY = 'aurelia-demo-v2';
  const SEED = 20261124;

  // ---------- small utils ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  const wd = (ds) => new Date(ds + 'T00:00:00').getDay();
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const toHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const tr = (id) => CFG.treatments.find((t) => t.id === id);

  function rng(seed) { // mulberry32
    return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- persistence ----------
  let state = null;
  let memory = null;
  const listeners = new Set();
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
    s.appointments.forEach((a) => { a.date = sd(a.date); a.createdAt = st(a.createdAt); });
    s.invoices.forEach((i) => { i.date = sd(i.date); if (i.payment) i.payment.paidAt = st(i.payment.paidAt); });
    s.offers.forEach((o) => { o.sentAt = st(o.sentAt); o.validTill = sd(o.validTill); });
    s.messages.forEach((m) => { m.at = st(m.at); });
    s.blocked = (s.blocked || []).map(sd);
    s.anchor = today();
    return s;
  }

  // ---------- slots ----------
  function candidateTimes(date, duration) {
    const h = CFG.hours[wd(date)];
    if (!h || ((state && state.blocked) || []).includes(date)) return [];
    const lunch = wd(date) !== 0 && CFG.lunchBreak ? [toMin(CFG.lunchBreak.start), toMin(CFG.lunchBreak.end)] : null;
    const out = [];
    for (let t = toMin(h.open); t + duration <= toMin(h.close); t += CFG.slotMinutes) {
      if (lunch && t < lunch[1] && t + duration > lunch[0]) continue;
      out.push(t);
    }
    return out;
  }
  function occupancy(date, appts) {
    const busy = new Map();
    appts.filter((a) => a.date === date && a.status !== 'cancelled').forEach((a) => {
      const d = (tr(a.treatmentId) || { duration: 30 }).duration;
      for (let m = toMin(a.time); m < toMin(a.time) + d; m += CFG.slotMinutes) busy.set(m, (busy.get(m) || 0) + 1);
    });
    return busy;
  }
  function freeTimes(date, treatmentId, appts, { lead = true } = {}) {
    const t = tr(treatmentId); if (!t) return [];
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const busy = occupancy(date, appts);
    return candidateTimes(date, t.duration)
      .filter((m) => !lead || date !== today() || m >= nowMin + CFG.minLeadMinutes)
      .filter((m) => { for (let x = m; x < m + t.duration; x += CFG.slotMinutes) if ((busy.get(x) || 0) >= CFG.chairs) return false; return true; })
      .map(toHHMM);
  }

  // ---------- seed ----------
  function seed() {
    const r = rng(SEED);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const weighted = (pairs) => { const total = pairs.reduce((s, p) => s + p[1], 0); let x = r() * total; for (const [v, w] of pairs) { if ((x -= w) < 0) return v; } return pairs[0][0]; };
    const first = ['Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Isha', 'Kabir', 'Rohan', 'Priya', 'Neha', 'Arjun', 'Meera', 'Sanya', 'Karan', 'Riya', 'Vikram', 'Pooja', 'Rahul', 'Sneha', 'Aman', 'Tanvi', 'Nikhil', 'Kavya', 'Siddharth', 'Ira', 'Manish', 'Shreya', 'Varun', 'Aditi', 'Harsh', 'Nisha', 'Yash', 'Simran', 'Dev', 'Anjali', 'Raghav', 'Ishaan', 'Mehak', 'Tara', 'Kunal', 'Gaurav', 'Ritika'];
    const last = ['Sharma', 'Verma', 'Gupta', 'Mehta', 'Kapoor', 'Malhotra', 'Singh', 'Agarwal', 'Bansal', 'Khanna', 'Chopra', 'Arora', 'Jain', 'Reddy', 'Iyer', 'Nair', 'Bhatia', 'Sethi', 'Saxena', 'Yadav'];
    const areas = ['Sushant Lok 1', 'DLF Phase 4', 'Sector 43', 'Golf Course Road', 'Sector 56', 'South City 1', 'Sohna Road', 'DLF Phase 1'];
    const t0 = today();
    const s = { version: 2, anchor: t0, patients: [], appointments: [], invoices: [], offers: [], messages: [], blocked: [], settings: { dayBefore: true, followUp: true, recall: true, taxPct: 0 }, counters: { invoice: 0 } };

    first.forEach((fn, i) => {
      const ln = last[(i * 7) % last.length];
      s.patients.push({
        id: 'p' + (i + 1), name: `${fn} ${ln}`, phone: `+91 9${Math.floor(r() * 9e8 + 1e8)}`.replace(/^(\+91 \d{5})(\d{5})$/, '$1 $2'),
        email: `${fn}.${ln}`.toLowerCase() + '@example.com', area: pick(areas), age: 18 + Math.floor(r() * 50),
        optIn: r() > 0.1, notes: '', createdAt: new Date(Date.now() - (60 + Math.floor(r() * 200)) * 864e5).toISOString(),
      });
    });
    const mix = [['consult', 20], ['cleaning', 16], ['filling', 12], ['rct', 8], ['crowns', 6], ['whitening', 6], ['kids', 5], ['wisdom', 5], ['gums', 4], ['implant', 4], ['aligners', 3], ['braces', 3], ['veneers', 3], ['smile', 2], ['dentures', 2], ['allon4', 1]];
    const regular = s.patients.slice(0, 26); // frequent visitors
    const addAppt = (date, status) => {
      const tid = weighted(mix), t = tr(tid);
      const times = freeTimes(date, tid, s.appointments, { lead: false });
      if (!times.length) return;
      const p = r() < 0.7 ? pick(regular) : pick(s.patients);
      const a = {
        id: uid('a'), ref: 'AD-' + Math.floor(r() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'),
        patientId: p.id, treatmentId: tid, date, time: pick(times), status, notes: '',
        source: weighted([['website', 45], ['phone', 35], ['walk-in', 20]]), calendarSynced: true,
        createdAt: new Date(new Date(date + 'T09:00:00').getTime() - Math.floor(r() * 6) * 864e5).toISOString(),
      };
      s.appointments.push(a);
      if (new Date(p.createdAt) > new Date(a.createdAt)) p.createdAt = a.createdAt;
      return { a, t };
    };
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

    // Two past campaigns
    const o1 = { id: 'o1', title: 'Monsoon Smile Check', code: 'MONSOON15', kind: 'pct', value: 15, validTill: addDays(t0, -60), audience: 'all', channel: 'whatsapp', sentAt: new Date(Date.now() - 95 * 864e5).toISOString(), message: '' };
    const o2 = { id: 'o2', title: 'Festive Whitening', code: 'GLOW20', kind: 'pct', value: 20, validTill: addDays(t0, 10), audience: 'all', channel: 'whatsapp', sentAt: new Date(Date.now() - 20 * 864e5).toISOString(), message: '' };
    s.offers.push(o1, o2);

    // Invoices for completed visits
    s.appointments.filter((a) => a.status === 'completed').forEach((a) => {
      const t = tr(a.treatmentId);
      const qty = a.treatmentId === 'filling' ? 1 + Math.floor(r() * 2) : 1;
      const span = t.priceTo - t.priceFrom;
      const step = t.priceFrom >= 20000 ? 1000 : 100;
      const price = Math.round((t.priceFrom + span * Math.pow(r(), 2) * 0.6) / step) * step;
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

    // Outbox history (kept to the most recent entries)
    const msgs = [];
    s.appointments.forEach((a) => {
      const p = s.patients.find((x) => x.id === a.patientId), t = tr(a.treatmentId);
      msgs.push({ id: uid('m'), patientId: p.id, channel: 'whatsapp', kind: 'confirmation', at: a.createdAt, status: 'sent', body: `Hi ${p.name.split(' ')[0]}, your ${t.name} at ${CFG.clinic.name} is confirmed for ${fmtDate(a.date)}, ${fmtTime(a.time)}. Ref ${a.ref}.` });
    });
    s.invoices.filter((i) => i.status === 'paid').forEach((i) => {
      const p = s.patients.find((x) => x.id === i.patientId);
      msgs.push({ id: uid('m'), patientId: p.id, channel: 'whatsapp', kind: 'receipt', at: i.payment.paidAt, status: 'sent', body: `Receipt ${i.no} for ${money(i.total)} from ${CFG.clinic.name}. Thank you for visiting!` });
    });
    [o1, o2].forEach((o) => {
      o.message = defaultOfferMessage(o);
      const rec = s.patients.filter((p) => p.optIn);
      o.stats = { targeted: s.patients.length, sent: rec.length, optedOut: s.patients.length - rec.length };
      rec.forEach((p) => msgs.push({ id: uid('m'), patientId: p.id, channel: o.channel, kind: 'offer', at: o.sentAt, status: 'sent', body: renderOffer(o, p) }));
    });
    s.messages = msgs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);
    return s;
  }

  // ---------- money / formatting ----------
  function money(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(ds) { const d = new Date(ds + 'T00:00:00'); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
  function fmtTime(hhmm) { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; }

  // ---------- invoices ----------
  function totals(items, discount, taxPct) {
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    let discountAmt = 0;
    if (discount && discount.value) discountAmt = discount.kind === 'pct' ? subtotal * discount.value / 100 : Math.min(discount.value, subtotal);
    discountAmt = Math.round(discountAmt);
    const tax = Math.round((subtotal - discountAmt) * (taxPct || 0) / 100);
    return { subtotal, discountAmt, tax, total: subtotal - discountAmt + tax };
  }
  function buildInvoice(s, { patientId, appointmentId, date, items, discount, taxPct }) {
    s.counters.invoice += 1;
    const year = (date || today()).slice(0, 4);
    return { id: uid('i'), no: `AUR-${year}-${String(s.counters.invoice).padStart(4, '0')}`, patientId, appointmentId: appointmentId || null, date: date || today(), items, discount: discount || null, taxPct: taxPct || 0, ...totals(items, discount, taxPct), status: 'unpaid', payment: null, sentVia: [] };
  }

  // ---------- offers ----------
  function offerLabel(o) { return o.kind === 'pct' ? `${o.value}%` : money(o.value); }
  function defaultOfferMessage(o) {
    return `Hi {name}! ${o.title} at ${CFG.clinic.name}: get {discount} off. Use code {code} before {validTill}. Book in 60 seconds on our website. Reply STOP to opt out.`;
  }
  function renderOffer(o, p) {
    return (o.message || defaultOfferMessage(o))
      .replaceAll('{name}', p ? p.name.split(' ')[0] : 'there').replaceAll('{discount}', offerLabel(o))
      .replaceAll('{code}', o.code).replaceAll('{validTill}', fmtDate(o.validTill));
  }

  // ---------- public API ----------
  const API = {
    cfg: CFG, money, fmtDate, fmtTime, addDays, today, toMin, dayDiff, tr, offerLabel, renderOffer, defaultOfferMessage, totals,
    get state() { return state; },
    load() {
      let s = read();
      if (!s || s.version !== 2) s = seed();
      state = shiftToToday(s);
      write();
      return state;
    },
    reset() { state = seed(); write(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    save: write,

    patient: (id) => state.patients.find((p) => p.id === id),
    appointment: (id) => state.appointments.find((a) => a.id === id),
    invoice: (id) => state.invoices.find((i) => i.id === id),
    availableSlots: (date, treatmentId) => (date < today() ? [] : freeTimes(date, treatmentId, state.appointments)),
    availability(treatmentId, days = 14) {
      return Array.from({ length: days }, (_, i) => { const date = addDays(today(), i); return { date, weekday: wd(date), slots: API.availableSlots(date, treatmentId).length }; });
    },

    findOrCreatePatient({ name, phone, email }) {
      let p = state.patients.find((x) => digits(x.phone) === digits(phone));
      if (!p) { p = { id: uid('p'), name, phone, email: email || '', area: '', age: null, optIn: true, notes: '', createdAt: new Date().toISOString() }; state.patients.push(p); }
      else { if (email && !p.email) p.email = email; }
      return p;
    },
    book({ name, phone, email, treatment, date, time, notes, source = 'website', patientId }) {
      const t = tr(treatment);
      if (!t) throw Object.assign(new Error('Please choose a treatment'), { status: 400 });
      if (!API.availableSlots(date, treatment).includes(time)) throw Object.assign(new Error('That slot was just taken. Please pick another time.'), { status: 409 });
      const p = patientId ? API.patient(patientId) : API.findOrCreatePatient({ name, phone, email });
      const a = { id: uid('a'), ref: 'AD-' + Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'), patientId: p.id, treatmentId: t.id, date, time, status: 'confirmed', notes: notes || '', source, calendarSynced: true, createdAt: new Date().toISOString() };
      state.appointments.push(a);
      state.appointments.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
      API.log({ patientId: p.id, channel: 'whatsapp', kind: 'confirmation', body: `Hi ${p.name.split(' ')[0]}, your ${t.name} at ${CFG.clinic.name} is confirmed for ${fmtDate(date)}, ${fmtTime(time)}. Ref ${a.ref}.` }, false);
      write();
      return a;
    },
    setStatus(apptId, status) { const a = API.appointment(apptId); if (a) { a.status = status; if (status === 'cancelled') a.calendarSynced = false; write(); } },

    createInvoice(data) { const inv = buildInvoice(state, data); state.invoices.push(inv); write(); return inv; },
    payInvoice(id, { mode, ref }) {
      const inv = API.invoice(id); if (!inv) return;
      inv.status = 'paid'; inv.payment = { mode, ref: ref || '', paidAt: new Date().toISOString() };
      const a = inv.appointmentId && API.appointment(inv.appointmentId);
      if (a && a.status === 'confirmed') a.status = 'completed';
      write(); return inv;
    },
    sendReceipt(id, channel) {
      const inv = API.invoice(id), p = API.patient(inv.patientId);
      if (!inv.sentVia.includes(channel)) inv.sentVia.push(channel);
      API.log({ patientId: p.id, channel, kind: 'receipt', body: `Receipt ${inv.no} for ${money(inv.total)} from ${CFG.clinic.name}. Thank you for visiting!` });
    },
    patientInvoices: (pid) => state.invoices.filter((i) => i.patientId === pid),
    patientAppointments: (pid) => state.appointments.filter((a) => a.patientId === pid),
    patientStats(pid) {
      const appts = API.patientAppointments(pid).filter((a) => a.status === 'completed');
      const inv = API.patientInvoices(pid);
      const last = appts.length ? appts[appts.length - 1].date : null;
      const next = state.appointments.find((a) => a.patientId === pid && a.status === 'confirmed' && a.date >= today());
      return { visits: appts.length, lastVisit: last, next, spent: inv.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0), due: inv.filter((i) => i.status === 'unpaid').reduce((s, i) => s + i.total, 0), treatments: [...new Set(appts.map((a) => a.treatmentId))] };
    },
    patientTags(pid) {
      const st = API.patientStats(pid), p = API.patient(pid), tags = [];
      if (st.spent >= 100000) tags.push('VIP');
      if (dayDiff(p.createdAt.slice(0, 10), today()) <= 90) tags.push('New');
      if (st.lastVisit && dayDiff(st.lastVisit, today()) >= 120 && !st.next) tags.push('Due for recall');
      if (st.treatments.some((t) => ['implant', 'allon4', 'dentures'].includes(t))) tags.push('Implants');
      if (st.treatments.some((t) => ['braces', 'aligners'].includes(t))) tags.push('Ortho');
      if (st.due > 0) tags.push('Payment due');
      if (!p.optIn) tags.push('Opted out');
      return tags;
    },

    audiences: [
      { id: 'all', label: 'All patients' },
      { id: 'recall', label: 'Due for recall (no visit in 4+ months)' },
      { id: 'new', label: 'New patients (last 90 days)' },
      { id: 'vip', label: 'VIP (spent ₹1 lakh+)' },
      { id: 'cosmetic', label: 'Had cosmetic treatment' },
      { id: 'ortho', label: 'Braces & aligner patients' },
    ],
    audience(id) {
      const tagMap = { recall: 'Due for recall', new: 'New', vip: 'VIP', ortho: 'Ortho' };
      return state.patients.filter((p) => {
        if (id === 'all') return true;
        if (id === 'cosmetic') return API.patientStats(p.id).treatments.some((t) => ['whitening', 'veneers', 'smile'].includes(t));
        return API.patientTags(p.id).includes(tagMap[id]);
      });
    },
    createOffer({ title, code, kind, value, validTill, audience, channel, message }) {
      const o = { id: uid('o'), title, code: code.toUpperCase(), kind, value: Number(value), validTill, audience, channel, message, sentAt: new Date().toISOString() };
      const target = API.audience(audience), rec = target.filter((p) => p.optIn);
      o.stats = { targeted: target.length, sent: rec.length, optedOut: target.length - rec.length };
      state.offers.unshift(o);
      rec.forEach((p) => API.log({ patientId: p.id, channel, kind: 'offer', body: renderOffer(o, p) }, false));
      write();
      return o;
    },
    findOffer(code) {
      const o = state.offers.find((x) => x.code === String(code || '').trim().toUpperCase());
      if (!o) return { error: 'No offer with that code.' };
      if (o.validTill < today()) return { error: `${o.code} expired on ${fmtDate(o.validTill)}.` };
      return { offer: o };
    },
    redemptions: (code) => state.invoices.filter((i) => i.discount && i.discount.code === code).length,

    log({ patientId, channel, kind, body, status = 'sent' }, persist = true) {
      state.messages.unshift({ id: uid('m'), patientId, channel, kind, body, status, at: new Date().toISOString() });
      if (state.messages.length > 600) state.messages.length = 600;
      if (persist) write();
    },
    reminders() { // computed, not stored: tomorrow's day-before reminders
      const d = addDays(today(), 1);
      return state.appointments.filter((a) => a.date === d && a.status === 'confirmed').map((a) => {
        const p = API.patient(a.patientId), t = tr(a.treatmentId);
        return { appt: a, patient: p, body: `Reminder: ${p.name.split(' ')[0]}, your ${t.name} at ${CFG.clinic.name} is tomorrow at ${fmtTime(a.time)}. Reply C to confirm or R to reschedule.` };
      });
    },
  };

  window.DemoStore = API;
  API.load();
})();
