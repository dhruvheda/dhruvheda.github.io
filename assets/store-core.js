/* Shared clinic business rules: formatting, slots, bill totals, offer codes,
 * patient stats and tags, campaign audiences and reminder lists.
 * Used in three places so the rules never drift apart:
 *   - the live staff dashboard (api-store.js)
 *   - the browser-only sales demo (demo/demo-store.js)
 *   - the server (src/clinic.js), via require()
 * makeStoreCore(cfg, getState, { today }) reads a state object of the shape
 * { patients, appointments, invoices, offers, messages, blocked, settings }.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.makeStoreCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return function makeStoreCore(cfg, getState, opts = {}) {
    const today = opts.today || (() => iso(new Date()));
    const nowMinutes = opts.nowMinutes || (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
    const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
    const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
    const wd = (ds) => new Date(ds + 'T00:00:00').getDay();
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const toHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const tr = (id) => cfg.treatments.find((t) => t.id === id);
    const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
    const fmtDate = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
    const fmtTime = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
    const S = () => getState();

    // ---------- slots (display only; the server re-checks every booking) ----------
    function candidateTimes(date, duration) {
      const h = cfg.hours[wd(date)];
      const st = S();
      if (!h || ((st && st.blocked) || []).includes(date)) return [];
      const lunch = wd(date) !== 0 && cfg.lunchBreak ? [toMin(cfg.lunchBreak.start), toMin(cfg.lunchBreak.end)] : null;
      const out = [];
      for (let t = toMin(h.open); t + duration <= toMin(h.close); t += cfg.slotMinutes) {
        if (lunch && t < lunch[1] && t + duration > lunch[0]) continue;
        out.push(t);
      }
      return out;
    }
    function freeTimes(date, treatmentId, appts, { lead = true } = {}) {
      const t = tr(treatmentId); if (!t) return [];
      const busy = new Map();
      appts.filter((a) => a.date === date && a.status !== 'cancelled').forEach((a) => {
        const d = (tr(a.treatmentId) || { duration: cfg.slotMinutes }).duration;
        for (let m = toMin(a.time); m < toMin(a.time) + d; m += cfg.slotMinutes) busy.set(m, (busy.get(m) || 0) + 1);
      });
      const nowMin = nowMinutes();
      return candidateTimes(date, t.duration)
        .filter((m) => !lead || date !== today() || m >= nowMin + cfg.minLeadMinutes)
        .filter((m) => { for (let x = m; x < m + t.duration; x += cfg.slotMinutes) if ((busy.get(x) || 0) >= cfg.chairs) return false; return true; })
        .map(toHHMM);
    }

    // ---------- bills ----------
    function totals(items, discount, taxPct) {
      const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
      let discountAmt = 0;
      if (discount && discount.value) discountAmt = discount.kind === 'pct' ? subtotal * Math.min(discount.value, 100) / 100 : Math.min(discount.value, subtotal);
      discountAmt = Math.round(discountAmt);
      const tax = Math.round((subtotal - discountAmt) * (taxPct || 0) / 100);
      return { subtotal, discountAmt, tax, total: subtotal - discountAmt + tax };
    }

    // ---------- offers ----------
    const offerLabel = (o) => (o.kind === 'pct' ? `${o.value}%` : money(o.value));
    const defaultOfferMessage = (o) => `Hi {name}! ${o.title} at ${cfg.clinic.name}: get {discount} off. Use code {code} before {validTill}. Book in 60 seconds on our website. Reply STOP to opt out.`;
    const renderOffer = (o, p) => (o.message || defaultOfferMessage(o))
      .split('{name}').join(p ? p.name.split(' ')[0] : 'there').split('{discount}').join(offerLabel(o))
      .split('{code}').join(o.code).split('{validTill}').join(fmtDate(o.validTill));
    function findOffer(code) {
      const c = String(code || '').trim().toUpperCase();
      const o = S().offers.find((x) => x.code === c);
      if (!o) return { error: 'No offer with that code.' };
      if (o.validTill < today()) return { error: `${o.code} expired on ${fmtDate(o.validTill)}.` };
      return { offer: o };
    }

    const core = {
      cfg, money, fmtDate, fmtTime, addDays, dayDiff, toMin, toHHMM, today, tr, totals, offerLabel, defaultOfferMessage, renderOffer, findOffer, freeTimes,
      patient: (id) => S().patients.find((p) => p.id === String(id)),
      appointment: (id) => S().appointments.find((a) => a.id === String(id)),
      invoice: (id) => S().invoices.find((i) => i.id === String(id)),
      invoiceFor: (apptId) => S().invoices.find((i) => i.appointmentId === String(apptId) && i.status !== 'void'),
      availableSlots: (date, treatmentId) => (date < today() ? [] : freeTimes(date, treatmentId, S().appointments)),
      availability(treatmentId, days = 14) {
        return Array.from({ length: days }, (_, i) => { const date = addDays(today(), i); return { date, weekday: wd(date), slots: core.availableSlots(date, treatmentId).length }; });
      },
      patientInvoices: (pid) => S().invoices.filter((i) => i.patientId === String(pid) && i.status !== 'void'),
      patientAppointments: (pid) => S().appointments.filter((a) => a.patientId === String(pid)),
      patientStats(pid) {
        const appts = core.patientAppointments(pid).filter((a) => a.status === 'completed');
        const inv = core.patientInvoices(pid);
        const t = today();
        return {
          visits: appts.length,
          lastVisit: appts.length ? appts[appts.length - 1].date : null,
          next: S().appointments.find((a) => a.patientId === String(pid) && a.status === 'confirmed' && a.date >= t),
          spent: inv.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0),
          due: inv.filter((i) => i.status === 'unpaid').reduce((s, i) => s + i.total, 0),
          treatments: [...new Set(appts.map((a) => a.treatmentId))],
        };
      },
      patientTags(pid) {
        const st = core.patientStats(pid), p = core.patient(pid), tags = [], t = today();
        if (st.spent >= 100000) tags.push('VIP');
        if (dayDiff(p.createdAt.slice(0, 10), t) <= 90) tags.push('New');
        if (st.lastVisit && dayDiff(st.lastVisit, t) >= 120 && !st.next) tags.push('Due for recall');
        if (st.treatments.some((x) => ['implant', 'allon4', 'dentures'].includes(x))) tags.push('Implants');
        if (st.treatments.some((x) => ['braces', 'aligners'].includes(x))) tags.push('Ortho');
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
        return S().patients.filter((p) => {
          if (id === 'all') return true;
          if (id === 'cosmetic') return core.patientStats(p.id).treatments.some((x) => ['whitening', 'veneers', 'smile'].includes(x));
          return core.patientTags(p.id).includes(tagMap[id]);
        });
      },
      redemptions: (code) => S().invoices.filter((i) => i.discount && i.discount.code === code && i.status !== 'void').length,
      reminderText: (a, p) => `Reminder: ${p.name.split(' ')[0]}, your ${tr(a.treatmentId).name} at ${cfg.clinic.name} is tomorrow at ${fmtTime(a.time)}. Reply C to confirm or R to reschedule.`,
      reminders() {
        const d = addDays(today(), 1);
        return S().appointments.filter((a) => a.date === d && a.status === 'confirmed').map((a) => {
          const p = core.patient(a.patientId);
          return { appt: a, patient: p, body: core.reminderText(a, p), sent: !!a.remindedAt };
        });
      },
      confirmationText: (a, p) => `Hi ${p.name.split(' ')[0]}, your ${tr(a.treatmentId).name} at ${cfg.clinic.name} is confirmed for ${fmtDate(a.date)}, ${fmtTime(a.time)}. Ref ${a.ref}.`,
      receiptText: (inv, link) => `Receipt ${inv.no} for ${money(inv.total)} from ${cfg.clinic.name}. Thank you for visiting!${link ? ' View or download: ' + link : ''}`,
    };
    return core;
  };
});
