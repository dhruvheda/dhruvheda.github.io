(() => {
  const S = window.DemoStore;
  let cfg, money; // set once the store is ready (after sign-in in live mode)
  const DEMO = S.mode === 'demo';
  // Toast suffix that keeps demo actions honest.
  const demoNote = (txt) => (DEMO ? ` <i>(demo: ${txt})</i>` : '');
  // Human result for a message the server tried to deliver.
  const chName = { whatsapp: 'WhatsApp', email: 'email', sms: 'SMS' };
  function delivery(r, ch, who) {
    const st = (r && r.status) || 'sent';
    if (DEMO) return `Sent on ${chName[ch]} to ${who}${demoNote('logged, not actually sent')}`;
    if (st === 'sent') return `Sent on ${chName[ch]} to ${who}`;
    if (st === 'logged') return `Recorded, but not delivered: ${chName[ch]} isn't connected yet`;
    if (st === 'skipped') return `Not sent: ${esc(r.error || 'no address for this channel')}`;
    return `Sending failed: ${esc(r.error || 'unknown error')}`;
  }
  const fail = (e) => toast(`<b>Couldn't do that.</b> ${esc(e.message || e)}`, 5000);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = () => S.today();
  const first = (n) => n.split(' ')[0];
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24); return d < 30 ? `${d} d ago` : S.fmtDate(iso.slice(0, 10));
  };
  const shortDate = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`; };
  const statusLabel = (s) => ({ confirmed: 'Confirmed', completed: 'Completed', no_show: 'No-show', cancelled: 'Cancelled', paid: 'Paid', unpaid: 'Unpaid' }[s] || s);
  const kindLabel = { callback: 'Callback request', confirmation: 'Booking confirmation', reminder: 'Reminder', receipt: 'Receipt', offer: 'Offer', followup: 'Follow-up', recall: 'Recall', payment_link: 'Payment link', message: 'Message', inbound: 'Patient reply' };
  const msgStatus = { sent: ['sent', 'Sent'], logged: ['scheduled', 'Not delivered'], skipped: ['cancelled', 'Skipped'], failed: ['bad', 'Failed'], received: ['confirmed', 'Received'] };
  const chLabel = { whatsapp: 'WA', sms: 'SMS', email: '@' };
  const invoiceFor = (apptId) => S.invoiceFor(apptId);

  const ui = { apptFilter: 'today', apptQ: '', patQ: '', patTag: '', billFilter: 'all', billQ: '', msgKind: 'all', week: 0 };
  let current = 'overview';
  let drawerPid = null;

  function toast(html, ms = 4200) {
    const t = $('#toast'); t.innerHTML = html; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
  }

  // ======================= VIEWS =======================
  const VIEWS = {
    overview: {
      title: 'Overview',
      render() {
        const st = S.state, t = T(), month = t.slice(0, 7);
        const lastMonth = S.addDays(month + '-01', -1).slice(0, 7);
        const todays = st.appointments.filter((a) => a.date === t && a.status !== 'cancelled');
        const paid = st.invoices.filter((i) => i.status === 'paid');
        const rev = paid.filter((i) => i.date.startsWith(month)).reduce((s, i) => s + i.total, 0);
        const revLast = paid.filter((i) => i.date.startsWith(lastMonth)).reduce((s, i) => s + i.total, 0);
        const unpaid = st.invoices.filter((i) => i.status === 'unpaid');
        const newP = st.patients.filter((p) => S.dayDiff(p.createdAt.slice(0, 10), t) <= 90).length;
        const dayOfMonth = Number(t.slice(8, 10));
        return `
        <div class="card guide">
          <div><b>Demo walkthrough</b></div>
          <ol>
            <li><a href="../#book"><u>Book on the website</u></a></li>
            <li>See it in Today's schedule</li>
            <li>Bill it and send the receipt</li>
            <li><a href="#offers"><u>Send an offer</u></a></li>
          </ol>
        </div>
        <div class="grid kpis">
          <div class="card kpi dark"><small>Revenue this month</small><b class="num">${money(rev)}</b><span>${dayOfMonth} days in · last month ${money(revLast)}</span></div>
          <div class="card kpi"><small>Today's appointments</small><b class="num">${todays.length}</b><span>${todays.filter((a) => a.status === 'completed').length} done · ${todays.filter((a) => a.status === 'confirmed').length} to come</span></div>
          <div class="card kpi"><small>Patients</small><b class="num">${st.patients.length}</b><span>${newP} new in the last 90 days</span></div>
          <div class="card kpi"><small>Unpaid bills</small><b class="num">${money(unpaid.reduce((s, i) => s + i.total, 0))}</b><span>${unpaid.length} bill${unpaid.length === 1 ? '' : 's'} to collect</span></div>
        </div>
        <div class="grid two" style="margin-top:14px">
          <div class="card">
            <div class="card-h"><div><h3>Revenue collected</h3><p>Paid bills per day, last 30 days</p></div></div>
            <div class="chart" id="revChart"></div>
          </div>
          <div class="card">
            <div class="card-h"><div><h3>Today's schedule</h3><p>${S.fmtDate(t)}</p></div><button class="btn sm ghost" data-action="new-appt">+ Add</button></div>
            <div class="sched">${todays.length ? todays.map(schedItem).join('') : '<p class="empty">No appointments today.</p>'}</div>
          </div>
        </div>
        <div class="grid two" style="margin-top:14px">
          <div class="card">
            <div class="card-h"><div><h3>Revenue by treatment</h3><p>Last 90 days, paid bills</p></div></div>
            ${treatmentMix()}
          </div>
          <div class="card">
            <div class="card-h"><div><h3>Recent activity</h3><p>Messages sent by the system</p></div><a class="btn sm ghost" href="#messages">All</a></div>
            <div class="feed">${st.messages.slice(0, 7).map((m) => { const p = S.patient(m.patientId); return `<div><i>${chLabel[m.channel] || '•'}</i><span><b>${esc(kindLabel[m.kind] || m.kind)}</b> to ${esc(p ? p.name : '')}<small>${ago(m.at)}</small></span></div>`; }).join('')}</div>
          </div>
        </div>`;
      },
      after() { drawRevenue(); },
    },

    calendar: {
      title: 'Calendar',
      render() {
        const t = T();
        const monday = S.addDays(t, -((new Date(t + 'T00:00:00').getDay() + 6) % 7) + ui.week * 7);
        const days = Array.from({ length: 7 }, (_, i) => S.addDays(monday, i));
        const START = 600, END = 1200, PX = 56 / 60, H = (END - START) * PX;
        const times = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);
        const col = (date) => {
          const evs = S.state.appointments.filter((a) => a.date === date && a.status !== 'cancelled').map((a) => ({ a, s: S.toMin(a.time), e: S.toMin(a.time) + S.tr(a.treatmentId).duration }));
          const ends = [];
          evs.forEach((ev) => { let c = ends.findIndex((e) => e <= ev.s); if (c === -1) { c = ends.length; ends.push(0); } ends[c] = ev.e; ev.c = c; });
          evs.forEach((ev) => { ev.split = evs.some((o) => o !== ev && o.s < ev.e && ev.s < o.e); });
          return evs.map(({ a, s, e, c, split }) => {
            const p = S.patient(a.patientId);
            const style = `top:${(s - START) * PX}px;height:${(e - s) * PX - 3}px;${split ? `left:${c ? '50%' : '3px'};right:${c ? '3px' : '50%'};` : ''}`;
            return `<div class="ev ${a.status}" style="${style}" data-action="appt" data-id="${a.id}" title="${esc(p.name)} · ${esc(S.tr(a.treatmentId).name)}"><b>${esc(p.name)}</b>${S.fmtTime(a.time)} · ${esc(S.tr(a.treatmentId).name)}</div>`;
          }).join('');
        };
        const dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return `
        <div class="toolbar">
          <div class="seg"><button data-action="week" data-d="-1">← Prev</button><button class="${ui.week === 0 ? 'on' : ''}" data-action="week" data-d="0">This week</button><button data-action="week" data-d="1">Next →</button></div>
          <b>${shortDate(days[0])} – ${shortDate(days[6])}</b>
          <span class="spacer"></span>
          <div class="cal-legend"><span style="--c:var(--lime)">Confirmed</span><span style="--c:#e3e5e8">Completed</span><span style="--c:#fde7ea">No-show</span></div>
        </div>
        <div class="card" style="padding:0;overflow:auto">
          <div class="cal">
            <div class="cal-h"></div>
            ${days.map((d, i) => `<div class="cal-h ${d === t ? 'today' : ''}">${dn[i]}<b>${new Date(d + 'T00:00:00').getDate()}</b></div>`).join('')}
            <div class="cal-times" style="height:${H}px">${times.map((m) => `<span style="top:${(m - START) * PX}px">${S.fmtTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`)}</span>`).join('')}</div>
            ${days.map((d) => `<div class="cal-day ${cfg.hours[new Date(d + 'T00:00:00').getDay()] ? '' : 'closed'}" style="height:${H}px">${col(d)}</div>`).join('')}
          </div>
        </div>`;
      },
    },

    appointments: {
      title: 'Appointments',
      render() {
        const f = [['today', 'Today'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']];
        return `
        <div class="toolbar">
          <div class="seg">${f.map(([k, l]) => `<button class="${ui.apptFilter === k ? 'on' : ''}" data-action="appt-filter" data-k="${k}">${l}</button>`).join('')}</div>
          <input class="in" id="apptQ" placeholder="Search patient, phone or ref" value="${esc(ui.apptQ)}" aria-label="Search appointments" />
        </div>
        <div class="card"><div class="tbl-wrap" id="list">${this.list()}</div></div>`;
      },
      list() {
        const t = T(), q = ui.apptQ.toLowerCase();
        let rows = S.state.appointments.filter((a) => {
          if (ui.apptFilter === 'today') return a.date === t;
          if (ui.apptFilter === 'upcoming') return a.date > t;
          if (ui.apptFilter === 'past') return a.date < t;
          return true;
        });
        if (ui.apptFilter === 'past' || ui.apptFilter === 'all') rows = [...rows].reverse();
        if (q) rows = rows.filter((a) => { const p = S.patient(a.patientId); return `${p.name} ${p.phone} ${a.ref}`.toLowerCase().includes(q); });
        const shown = rows.slice(0, 150);
        if (!shown.length) return '<p class="empty">No appointments here.</p>';
        return `<table class="tbl"><thead><tr><th>When</th><th>Patient</th><th>Treatment</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>
          ${shown.map((a) => { const p = S.patient(a.patientId), inv = invoiceFor(a.id); return `<tr>
            <td class="num"><b>${shortDate(a.date)}</b><small>${S.fmtTime(a.time)}</small></td>
            <td><a href="#" data-action="patient" data-id="${p.id}"><b>${esc(p.name)}</b></a><small>${esc(p.phone)} · ${esc(a.ref)}</small></td>
            <td>${esc(S.tr(a.treatmentId).name)}</td>
            <td><span class="src">${esc(a.source)}</span>${a.calendarSynced ? '<small>On Google Calendar</small>' : ''}</td>
            <td><select class="in" style="height:32px;width:auto" data-action="status" data-id="${a.id}" aria-label="Status">${['confirmed', 'completed', 'no_show', 'cancelled'].map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}</select></td>
            <td class="r">${inv ? (inv.status === 'paid' ? `<button class="btn sm ghost" data-action="receipt" data-id="${inv.id}">Receipt</button>` : `<button class="btn sm lime" data-action="collect" data-id="${inv.id}">Collect ${money(inv.total)}</button>`) : (a.status !== 'cancelled' && a.status !== 'no_show' ? `<button class="btn sm dark" data-action="bill-appt" data-id="${a.id}">Bill</button>` : '')}</td>
          </tr>`; }).join('')}
        </tbody></table>${rows.length > 150 ? `<p class="hint" style="padding:10px">Showing 150 of ${rows.length}. Search to narrow down.</p>` : ''}`;
      },
    },

    patients: {
      title: 'Patients',
      render() {
        const tags = ['VIP', 'New', 'Due for recall', 'Implants', 'Ortho', 'Payment due', 'Opted out'];
        return `
        <div class="toolbar">
          <input class="in" id="patQ" placeholder="Search name, phone or area" value="${esc(ui.patQ)}" aria-label="Search patients" />
          <select class="in" id="patTag" style="max-width:200px" aria-label="Filter by tag"><option value="">All patients</option>${tags.map((t) => `<option ${ui.patTag === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <span class="spacer"></span>
          <span class="hint">${S.state.patients.length} patients in one place: visits, bills and messages</span>
        </div>
        <div class="card"><div class="tbl-wrap" id="list">${this.list()}</div></div>`;
      },
      list() {
        const q = ui.patQ.toLowerCase();
        const rows = S.state.patients.map((p) => ({ p, st: S.patientStats(p.id), tags: S.patientTags(p.id) }))
          .filter(({ p, tags }) => (!q || `${p.name} ${p.phone} ${p.area}`.toLowerCase().includes(q)) && (!ui.patTag || tags.includes(ui.patTag)))
          .sort((a, b) => (b.st.lastVisit || b.p.createdAt).localeCompare(a.st.lastVisit || a.p.createdAt));
        if (!rows.length) return '<p class="empty">No patients match.</p>';
        return `<table class="tbl"><thead><tr><th>Patient</th><th>Phone</th><th class="r">Visits</th><th>Last visit</th><th class="r">Total paid</th><th>Tags</th></tr></thead><tbody>
          ${rows.map(({ p, st, tags }) => `<tr class="click" data-action="patient" data-id="${p.id}">
            <td><b>${esc(p.name)}</b><small>${esc(p.area || 'Walk-in')}</small></td>
            <td class="num">${esc(p.phone)}</td>
            <td class="r num">${st.visits}</td>
            <td>${st.lastVisit ? shortDate(st.lastVisit) : '<span class="hint">Not yet</span>'}${st.next ? `<small>Next ${shortDate(st.next.date)}</small>` : ''}</td>
            <td class="r num">${money(st.spent)}${st.due ? `<small style="color:var(--bad)">${money(st.due)} due</small>` : ''}</td>
            <td>${tags.map((t) => `<span class="tag ${t === 'VIP' ? 'VIP' : t === 'Payment due' ? 'pay' : ''}">${t}</span>`).join('')}</td>
          </tr>`).join('')}
        </tbody></table>`;
      },
    },

    billing: {
      title: 'Billing',
      render() {
        const t = T(), month = t.slice(0, 7), inv = S.state.invoices;
        const mPaid = inv.filter((i) => i.status === 'paid' && i.date.startsWith(month));
        const unpaid = inv.filter((i) => i.status === 'unpaid');
        const modes = {}; mPaid.forEach((i) => { modes[i.payment.mode] = (modes[i.payment.mode] || 0) + i.total; });
        const f = [['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']];
        return `
        <div class="grid kpis">
          <div class="card kpi dark"><small>Collected this month</small><b class="num">${money(mPaid.reduce((s, i) => s + i.total, 0))}</b><span>${mPaid.length} paid bills</span></div>
          <div class="card kpi"><small>To collect</small><b class="num">${money(unpaid.reduce((s, i) => s + i.total, 0))}</b><span>${unpaid.length} unpaid</span></div>
          <div class="card kpi"><small>Average bill</small><b class="num">${money(mPaid.length ? mPaid.reduce((s, i) => s + i.total, 0) / mPaid.length : 0)}</b><span>this month</span></div>
          <div class="card kpi"><small>Paid by</small><b style="font-size:16px;letter-spacing:0;font-family:var(--font);font-weight:500;line-height:1.5">${Object.entries(modes).sort((a, b) => b[1] - a[1]).map(([m, v]) => `${m} ${money(v)}`).join('<br>') || '–'}</b></div>
        </div>
        <div class="toolbar" style="margin-top:14px">
          <div class="seg">${f.map(([k, l]) => `<button class="${ui.billFilter === k ? 'on' : ''}" data-action="bill-filter" data-k="${k}">${l}</button>`).join('')}</div>
          <input class="in" id="billQ" placeholder="Search patient or bill no." value="${esc(ui.billQ)}" aria-label="Search bills" />
          <span class="spacer"></span><button class="btn dark" data-action="new-bill">+ New bill</button>
        </div>
        <div class="card"><div class="tbl-wrap" id="list">${this.list()}</div></div>`;
      },
      list() {
        const q = ui.billQ.toLowerCase();
        const rows = [...S.state.invoices].reverse().filter((i) => (ui.billFilter === 'all' || i.status === ui.billFilter) && (!q || `${S.patient(i.patientId).name} ${i.no}`.toLowerCase().includes(q))).slice(0, 150);
        if (!rows.length) return '<p class="empty">No bills here.</p>';
        return `<table class="tbl"><thead><tr><th>Bill</th><th>Patient</th><th>Treatment</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
          ${rows.map((i) => { const p = S.patient(i.patientId); return `<tr>
            <td class="num"><b>${i.no}</b><small>${shortDate(i.date)}</small></td>
            <td><a href="#" data-action="patient" data-id="${p.id}"><b>${esc(p.name)}</b></a><small>${esc(p.phone)}</small></td>
            <td>${esc(i.items.map((it) => it.name + (it.qty > 1 ? ` ×${it.qty}` : '')).join(', '))}${i.discount ? `<small>${esc(i.discount.code || 'Discount')} −${money(i.discountAmt)}</small>` : ''}</td>
            <td class="r num"><b>${money(i.total)}</b>${i.payment ? `<small>${esc(i.payment.mode)}</small>` : ''}</td>
            <td><span class="pill ${i.status}">${statusLabel(i.status)}</span></td>
            <td class="r">${i.status === 'paid' ? `<button class="btn sm ghost" data-action="receipt" data-id="${i.id}">Receipt</button>` : `<button class="btn sm lime" data-action="collect" data-id="${i.id}">Collect</button> <button class="btn sm ghost" data-action="void" data-id="${i.id}" title="Void this bill">Void</button>`}</td>
          </tr>`; }).join('')}
        </tbody></table>`;
      },
    },

    offers: {
      title: 'Offers',
      render() {
        const t = T();
        return `
        <div class="toolbar"><span class="hint">Send discounts to all patients or a chosen group by WhatsApp, SMS or email. Patients who opted out are skipped automatically.</span><span class="spacer"></span><button class="btn dark" data-action="new-offer">+ New offer</button></div>
        <div class="card">
          <div class="card-h"><h3>Campaigns</h3></div>
          ${S.state.offers.map((o) => `<div class="offer-card">
            <span class="code ${o.validTill < t ? 'exp' : ''}">${esc(o.code)}</span>
            <div><b>${esc(o.title)}</b> · ${S.offerLabel(o)} off
              <div class="stats-inline"><span>Sent <b>${o.stats.sent}</b></span><span>Skipped (opted out) <b>${o.stats.optedOut}</b></span><span>Redeemed <b>${S.redemptions(o.code)}</b></span><span>${o.validTill < t ? 'Expired' : 'Valid till'} ${shortDate(o.validTill)}</span><span>${esc(o.channel === 'whatsapp' ? 'WhatsApp' : o.channel.toUpperCase())} · ${ago(o.sentAt)}</span></div>
            </div>
            <button class="btn sm ghost" data-action="offer" data-id="${o.id}">Preview</button>
          </div>`).join('')}
        </div>`;
      },
    },

    messages: {
      title: 'Messages',
      render() {
        const st = S.state.settings, rem = S.reminders();
        const f = [['all', 'All'], ['confirmation', 'Confirmations'], ['reminder', 'Reminders'], ['receipt', 'Receipts'], ['offer', 'Offers'], ['message', 'Direct'], ['callback', 'Callbacks']];
        const pending = rem.filter((r) => !r.sent);
        return `
        <div class="grid two">
          <div class="card">
            <div class="card-h"><div><h3>Outbox</h3><p>${DEMO ? 'Every message the clinic system sent (simulated in demo)' : (S.integrations.whatsapp ? 'Every message sent to patients, with delivery status' : 'WhatsApp isn\'t connected yet: messages are recorded but not delivered')}</p></div></div>
            <div class="toolbar"><div class="seg">${f.map(([k, l]) => `<button class="${ui.msgKind === k ? 'on' : ''}" data-action="msg-filter" data-k="${k}">${l}</button>`).join('')}</div></div>
            <div id="list">${this.list()}</div>
          </div>
          <div class="stack" style="align-content:start">
            <div class="card">
              <div class="card-h"><h3>Automations</h3></div>
              <div class="stack">
                <label class="switch"><input type="checkbox" data-action="setting" data-k="dayBefore" ${st.dayBefore ? 'checked' : ''}/> Day-before appointment reminder (WhatsApp)</label>
                <label class="switch"><input type="checkbox" data-action="setting" data-k="followUp" ${st.followUp ? 'checked' : ''}/> Post-treatment check-in, next day</label>
                <label class="switch"><input type="checkbox" data-action="setting" data-k="recall" ${st.recall ? 'checked' : ''}/> 6-month cleaning recall</label>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><div><h3>Tomorrow's reminders</h3><p>${st.dayBefore ? `${pending.length} to send automatically at 10:00 AM` : 'Reminders are switched off'}</p></div>${st.dayBefore && pending.length ? '<button class="btn sm lime" data-action="send-reminders">Send now</button>' : ''}</div>
              ${st.dayBefore ? (rem.length ? rem.map((r) => `<div class="msg"><span class="ch">WA</span><div><b>${esc(r.patient.name)}</b><p>${esc(r.body)}</p></div>${r.sent ? '<span class="pill sent">Done</span>' : '<span class="pill scheduled">Scheduled</span>'}</div>`).join('') : '<p class="empty">No appointments tomorrow.</p>') : ''}
            </div>
          </div>
        </div>`;
      },
      list() {
        const rows = S.state.messages.filter((m) => ui.msgKind === 'all' || m.kind === ui.msgKind).slice(0, 80);
        if (!rows.length) return '<p class="empty">Nothing here yet.</p>';
        return rows.map((m) => { const p = S.patient(m.patientId); return `<div class="msg"><span class="ch">${chLabel[m.channel] || '•'}</span><div><b>${esc(p ? p.name : '')}</b> <small>· ${esc(kindLabel[m.kind] || m.kind)} · ${ago(m.at)}</small><p>${esc(m.body)}</p>${m.error ? `<small style="color:var(--bad)">${esc(m.error)}</small>` : ''}</div><span class="pill ${(msgStatus[m.status] || msgStatus.sent)[0]}">${(msgStatus[m.status] || msgStatus.sent)[1]}</span></div>`; }).join('');
      },
    },
  };

  function schedItem(a) {
    const p = S.patient(a.patientId), inv = invoiceFor(a.id);
    let act = '';
    if (a.status === 'confirmed') act = `<button class="btn sm dark" data-action="done" data-id="${a.id}">Done &amp; bill</button>`;
    else if (inv && inv.status === 'paid') act = `<button class="btn sm ghost" data-action="receipt" data-id="${inv.id}">Receipt</button>`;
    else if (inv) act = `<button class="btn sm lime" data-action="collect" data-id="${inv.id}">Collect</button>`;
    else if (a.status === 'completed') act = `<button class="btn sm dark" data-action="bill-appt" data-id="${a.id}">Bill</button>`;
    else act = `<span class="pill ${a.status}">${statusLabel(a.status)}</span>`;
    return `<div class="sched-item"><time>${S.fmtTime(a.time)}</time><div><a href="#" data-action="patient" data-id="${p.id}"><b>${esc(p.name)}</b></a><small>${esc(S.tr(a.treatmentId).name)} · ${esc(a.source)}</small></div>${act}</div>`;
  }

  function treatmentMix() {
    const t = T(), by = {};
    S.state.invoices.filter((i) => i.status === 'paid' && S.dayDiff(i.date, t) <= 90).forEach((i) => i.items.forEach((it) => { by[it.name] = (by[it.name] || 0) + it.qty * it.price; }));
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = rows.length ? rows[0][1] : 1;
    return `<div class="hbars">${rows.map(([n, v]) => `<div class="hbar"><span title="${esc(n)}">${esc(n)}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><b class="num">${money(v)}</b></div>`).join('')}</div>`;
  }

  function drawRevenue() {
    const host = $('#revChart'); if (!host) return;
    const t = T(), days = Array.from({ length: 30 }, (_, i) => S.addDays(t, i - 29));
    const data = days.map((d) => { const inv = S.state.invoices.filter((i) => i.status === 'paid' && i.date === d); return { d, v: inv.reduce((s, i) => s + i.total, 0), n: inv.length }; });
    const W = host.clientWidth || 600, H = 220, padL = 46, padB = 24, padT = 8;
    const max = Math.max(1, ...data.map((x) => x.v));
    const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))); const s = [1, 2, 2.5, 5, 10].find((k) => k * p >= m / 4) * p; return s; };
    const step = nice(max), top = Math.ceil(max / step) * step;
    const y = (v) => padT + (H - padT - padB) * (1 - v / top);
    const bw = (W - padL) / data.length, gap = Math.min(4, bw * 0.25);
    const ticks = []; for (let v = 0; v <= top + 1; v += step) ticks.push(v);
    const k = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(v % 100000 ? 1 : 0)}L` : v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`);
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Revenue collected per day for the last 30 days">
      ${ticks.map((v) => `<line class="grid-l" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${k(v)}</text>`).join('')}
      ${data.map((x, i) => { const bx = padL + i * bw + gap / 2, h = Math.max(0, y(0) - y(x.v)), r = Math.min(4, h, (bw - gap) / 2); return x.v ? `<path class="bar" data-i="${i}" d="M${bx},${y(0)} V${y(x.v) + r} Q${bx},${y(x.v)} ${bx + r},${y(x.v)} H${bx + bw - gap - r} Q${bx + bw - gap},${y(x.v)} ${bx + bw - gap},${y(x.v) + r} V${y(0)} Z"/>` : ''; }).join('')}
      ${data.map((x, i) => (i % 7 === 2 || i === 29 ? `<text class="ax" x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${i === 29 ? 'Today' : shortDate(x.d)}</text>` : '')).join('')}
      ${data.map((x, i) => `<rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" data-i="${i}"/>`).join('')}
    </svg>`;
    const tip = $('#tip');
    host.onpointermove = (e) => {
      const i = e.target.dataset && e.target.dataset.i; $$('.bar', host).forEach((b) => b.classList.toggle('hot', b.dataset.i === i));
      if (i == null) { tip.hidden = true; return; }
      const x = data[i]; tip.innerHTML = `${S.fmtDate(x.d)}<br><b>${money(x.v)}</b> · ${x.n} bill${x.n === 1 ? '' : 's'}`; tip.hidden = false;
      const r = e.target.getBoundingClientRect(); tip.style.left = r.left + r.width / 2 + 'px'; tip.style.top = r.top + 'px';
    };
    host.onpointerleave = () => { tip.hidden = true; $$('.bar', host).forEach((b) => b.classList.remove('hot')); };
  }

  // ======================= MODALS =======================
  function openModal(html, wide) { const box = $('#modalBox'); box.className = 'modal' + (wide ? ' wide' : ''); box.innerHTML = html; $('#modal').hidden = false; const f = box.querySelector('input,select,textarea,button:not(.x)'); f && f.focus(); }
  function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; }
  const head = (title, sub) => `<div class="modal-h"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="x" data-action="close" aria-label="Close">×</button></div>`;
  const patientOptions = (sel) => [...S.state.patients].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} · ${esc(p.phone)}</option>`).join('');
  const treatmentOptions = (sel) => cfg.treatments.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

  function newAppointment(pid) {
    openModal(`${head('New appointment', 'Added to the schedule and Google Calendar (simulated). The patient gets a WhatsApp confirmation.')}
      <form class="stack" id="apptForm">
        <label class="f">Patient<select class="in" name="patient" id="apPatient"><option value="__new">+ New patient</option>${patientOptions(pid)}</select></label>
        <div class="grid2" id="newPat" ${pid ? 'hidden' : ''}>
          <label class="f">Full name<input class="in" name="name" autocomplete="off" /></label>
          <label class="f">Phone<input class="in" name="phone" placeholder="+91" autocomplete="off" /></label>
        </div>
        <div class="grid2">
          <label class="f">Treatment<select class="in" name="treatment" id="apTr">${treatmentOptions('consult')}</select></label>
          <label class="f">Booked via<select class="in" name="source"><option value="phone">Phone call</option><option value="walk-in">Walk-in</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option></select></label>
        </div>
        <div class="grid2">
          <label class="f">Date<input class="in" type="date" name="date" id="apDate" min="${T()}" value="${S.addDays(T(), 1)}" /></label>
          <label class="f">Time<select class="in" name="time" id="apTime"></select></label>
        </div>
        <label class="f">Notes <small>(optional)</small><input class="in" name="notes" /></label>
        <p class="err-msg" id="apErr"></p>
        <div class="modal-f"><button type="button" class="btn ghost" data-action="close">Cancel</button><button class="btn dark">Book appointment</button></div>
      </form>`);
    const fill = () => {
      const slots = S.availableSlots($('#apDate').value, $('#apTr').value);
      $('#apTime').innerHTML = slots.length ? slots.map((s) => `<option value="${s}">${S.fmtTime(s)}</option>`).join('') : '<option value="">No free slots</option>';
    };
    $('#apPatient').onchange = (e) => { $('#newPat').hidden = e.target.value !== '__new'; };
    $('#apTr').onchange = fill; $('#apDate').onchange = fill; fill();
    $('#apptForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        if (f.patient === '__new' && (f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 10)) throw new Error('Enter the new patient\'s name and a 10-digit phone number.');
        if (!f.time) throw new Error('Pick a date with free slots.');
        const a = await S.book({ ...f, patientId: f.patient === '__new' ? null : f.patient });
        closeModal();
        toast(`Booked <b>${esc(S.patient(a.patientId).name)}</b> for ${S.fmtDate(a.date)}, ${S.fmtTime(a.time)}${DEMO ? ' · added to Google Calendar' + demoNote('simulated') : S.integrations.googleCalendar ? ' · added to Google Calendar' : ''}`);
      } catch (err) { $('#apErr').textContent = err.message; }
    };
  }

  function billEditor({ patientId, appointmentId } = {}) {
    const appt = appointmentId && S.appointment(appointmentId);
    const pid = patientId || (appt && appt.patientId) || null;
    const t0 = appt ? S.tr(appt.treatmentId) : null;
    const m = { items: t0 ? [{ treatmentId: t0.id, name: t0.name, qty: 1, price: t0.priceFrom }] : [{ treatmentId: 'consult', name: S.tr('consult').name, qty: 1, price: S.tr('consult').priceFrom }], discount: null, taxPct: S.state.settings.taxPct || 0 };
    openModal(`${head('New bill', appt ? `For ${esc(S.tr(appt.treatmentId).name)} on ${S.fmtDate(appt.date)}` : 'Bill a patient for treatment')}
      <div class="stack">
        <label class="f">Patient<select class="in" id="blPatient">${pid ? '' : '<option value="">Select patient…</option>'}${patientOptions(pid)}</select></label>
        <div><div class="hint" style="margin-bottom:6px">Treatments · prices start at the clinic's list price and can be edited</div><div class="items" id="blItems"></div>
          <button class="btn sm ghost" style="margin-top:8px" data-action="bl-add">+ Add treatment</button></div>
        <div class="grid3">
          <label class="f">Offer code<div style="display:flex;gap:6px"><input class="in" id="blCode" placeholder="e.g. GLOW20" style="text-transform:uppercase" /><button class="btn sm ghost" data-action="bl-code" style="height:40px">Apply</button></div></label>
          <label class="f">Or discount<div style="display:flex;gap:6px"><input class="in num" id="blDisc" type="number" min="0" placeholder="0" /><select class="in" id="blDiscK" style="width:76px"><option value="pct">%</option><option value="flat">₹</option></select></div></label>
          <label class="f">Tax %<input class="in num" id="blTax" type="number" min="0" max="28" value="${m.taxPct}" /><small>Most dental care is billed without GST; check cosmetic work with your CA.</small></label>
        </div>
        <p id="blCodeMsg"></p>
        <div class="sum" id="blSum"></div>
        <p class="err-msg" id="blErr"></p>
        <div class="modal-f"><button class="btn ghost" data-action="bl-save">Save as unpaid</button><button class="btn dark" data-action="bl-pay">Collect payment →</button></div>
      </div>`, true);
    const itemsEl = $('#blItems');
    const drawItems = () => {
      itemsEl.innerHTML = m.items.map((it, i) => `<div class="item-row" data-i="${i}">
        <select class="in" data-f="treatmentId" aria-label="Treatment">${treatmentOptions(it.treatmentId)}</select>
        <input class="in num" data-f="qty" type="number" min="1" value="${it.qty}" aria-label="Quantity" />
        <input class="in num" data-f="price" type="number" min="0" step="100" value="${it.price}" aria-label="Price" />
        <span class="amt" data-amt>${money(it.qty * it.price)}</span>
        <button class="x" data-action="bl-rm" data-i="${i}" aria-label="Remove" ${m.items.length === 1 ? 'disabled' : ''}>×</button></div>`).join('');
      drawSum();
    };
    const drawSum = () => {
      const tt = S.totals(m.items, m.discount, m.taxPct);
      $('#blSum').innerHTML = `<div><span>Subtotal</span><span>${money(tt.subtotal)}</span></div>
        ${tt.discountAmt ? `<div><span>Discount ${m.discount.code ? `(${esc(m.discount.code)})` : ''}</span><span>−${money(tt.discountAmt)}</span></div>` : ''}
        ${tt.tax ? `<div><span>Tax ${m.taxPct}%</span><span>${money(tt.tax)}</span></div>` : ''}
        <div class="tot"><span>Total</span><span>${money(tt.total)}</span></div>
        ${tt.total >= 15000 ? `<div class="hint"><span>No-cost EMI from ${money(tt.total / 12)}/month</span></div>` : ''}`;
      $$('.item-row', itemsEl).forEach((row) => { const it = m.items[row.dataset.i]; $('[data-amt]', row).textContent = money(it.qty * it.price); });
    };
    itemsEl.oninput = itemsEl.onchange = (e) => {
      const row = e.target.closest('.item-row'); if (!row) return;
      const it = m.items[row.dataset.i], f = e.target.dataset.f;
      if (f === 'treatmentId') { const t = S.tr(e.target.value); it.treatmentId = t.id; it.name = t.name; it.price = t.priceFrom; $('[data-f=price]', row).value = t.priceFrom; }
      else it[f] = Math.max(f === 'qty' ? 1 : 0, Number(e.target.value) || 0);
      drawSum();
    };
    const manual = () => { const v = Number($('#blDisc').value) || 0; m.discount = v ? { kind: $('#blDiscK').value, value: v, code: '' } : null; $('#blCode').value = ''; $('#blCodeMsg').className = ''; $('#blCodeMsg').textContent = ''; drawSum(); };
    $('#blDisc').oninput = manual; $('#blDiscK').onchange = manual;
    $('#blTax').oninput = (e) => { m.taxPct = Math.min(28, Math.max(0, Number(e.target.value) || 0)); drawSum(); };
    m.add = () => { m.items.push({ treatmentId: 'cleaning', name: S.tr('cleaning').name, qty: 1, price: S.tr('cleaning').priceFrom }); drawItems(); };
    m.rm = (i) => { m.items.splice(i, 1); drawItems(); };
    m.code = () => {
      const r = S.findOffer($('#blCode').value), msg = $('#blCodeMsg');
      if (r.error) { msg.className = 'err-msg'; msg.textContent = r.error; return; }
      m.discount = { kind: r.offer.kind, value: r.offer.value, code: r.offer.code }; $('#blDisc').value = '';
      msg.className = 'ok-msg'; msg.textContent = `${r.offer.title}: ${S.offerLabel(r.offer)} off applied.`; drawSum();
    };
    m.save = async (pay) => {
      const p = $('#blPatient').value;
      if (!p) { $('#blErr').textContent = 'Choose the patient for this bill.'; return; }
      let inv;
      try { inv = await S.createInvoice({ patientId: p, appointmentId: appointmentId || null, date: T(), items: m.items.map(({ treatmentId, name, qty, price }) => ({ treatmentId, name, qty, price })), discount: m.discount, taxPct: m.taxPct }); } catch (e) { $('#blErr').textContent = e.message; return; }
      if (pay) payment(inv.id); else { closeModal(); toast(`Bill <b>${inv.no}</b> saved as unpaid · ${money(inv.total)}`); }
    };
    billEditor.m = m;
    drawItems();
  }

  function payment(invId) {
    const inv = S.invoice(invId), p = S.patient(inv.patientId);
    const online = DEMO || S.integrations.razorpay;
    const modes = [['Cash', 'At the desk'], ['UPI', 'Scan & pay'], ['Card', 'POS machine'], ['Online', DEMO ? 'Payment link · test' : online ? 'Razorpay link' : 'Not connected']];
    let mode = 'UPI';
    openModal(`${head(`Collect ${money(inv.total)}`, `${inv.no} · ${esc(p.name)}`)}
      <div class="stack">
        <div class="paymodes" id="pm">${modes.map(([m, s]) => `<button class="${m === mode ? 'on' : ''}" data-m="${m}">${m}<small>${s}</small></button>`).join('')}</div>
        <label class="f" id="pmRefL">Reference <small>(UPI transaction ID / last 4 digits, optional)</small><input class="in" id="pmRef" /></label>
        <p class="hint" id="pmHint"></p>
        <div class="modal-f"><button class="btn ghost" data-action="close">Later</button><button class="btn dark" id="pmGo">Mark as paid</button></div>
      </div>`);
    const sync = () => {
      $$('#pm button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
      $('#pmRefL').hidden = mode === 'Cash' || mode === 'Online';
      $('#pmHint').textContent = mode !== 'Online' ? '' : DEMO ? 'Sends the patient a secure payment link (Razorpay in the live version). In this demo the payment is simulated in test mode.'
        : online ? 'Creates a Razorpay payment link and sends it on WhatsApp. The bill turns Paid automatically when the patient pays.' : 'Connect the clinic\'s Razorpay account to send payment links. Until then, use Cash, UPI or Card.';
      $('#pmGo').textContent = mode === 'Online' ? (DEMO ? 'Send link & simulate payment' : 'Send payment link') : 'Mark as paid';
      $('#pmGo').disabled = mode === 'Online' && !online;
    };
    $('#pm').onclick = (e) => { const b = e.target.closest('button'); if (b) { mode = b.dataset.m; sync(); } };
    $('#pmGo').onclick = async () => {
      $('#pmGo').disabled = true;
      try {
        if (mode !== 'Online') { await S.payInvoice(invId, { mode, ref: $('#pmRef').value.trim() }); receipt(invId, true); return; }
        const r = await S.paymentLink(invId);
        if (DEMO) {
          $('#modalBox').innerHTML = `${head('Online payment', 'Test mode · no real money moves')}<div class="checkout"><p>Waiting for ${esc(first(p.name))} to pay <b>${money(inv.total)}</b>…</p><div class="spinner"></div><p class="hint">Payment link sent on WhatsApp (simulated)</p></div>`;
          setTimeout(async () => { await S.payInvoice(invId, { mode: 'Online', ref: 'pay_TEST' + Math.random().toString(36).slice(2, 12).toUpperCase() }); receipt(invId, true); }, 1600);
          return;
        }
        $('#modalBox').innerHTML = `${head('Payment link sent', `${inv.no} · ${money(inv.total)}`)}<div class="checkout">
          <p>${delivery(r.message, 'whatsapp', esc(p.phone))}</p>
          <p style="margin:14px 0"><a class="link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></p>
          <div class="spinner"></div><p class="hint">Waiting for payment. This bill turns Paid on its own when ${esc(first(p.name))} pays; you can close this window.</p></div>`;
        const poll = setInterval(async () => {
          if ($('#modal').hidden) return clearInterval(poll);
          try { await S.refresh(); } catch { return; }
          if (S.invoice(invId).status === 'paid') { clearInterval(poll); receipt(invId, true); }
        }, 5000);
      } catch (e) { fail(e); const b = $('#pmGo'); if (b) b.disabled = false; }
    };
    sync();
  }

  function receiptHTML(inv) {
    const p = S.patient(inv.patientId), c = cfg.clinic;
    return `<div class="receipt">
      <div class="rc-h"><div><h3>${esc(c.name)}</h3><p>${esc(c.address)}<br>${esc(c.phone)} · ${esc(c.email)}</p></div><div style="text-align:right"><b>RECEIPT</b><p>${inv.no}<br>${S.fmtDate(inv.date)}</p></div></div>
      <div class="rc-meta"><div><b>Billed to</b><br>${esc(p.name)}<br>${esc(p.phone)}</div><div style="text-align:right"><b>Payment</b><br>${inv.payment ? `${esc(inv.payment.mode)}${inv.payment.ref ? ` · ${esc(inv.payment.ref)}` : ''}<br>${new Date(inv.payment.paidAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Pending'}</div></div>
      <table><thead><tr><th>Treatment</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>
        ${inv.items.map((it) => `<tr><td>${esc(it.name)}</td><td class="r">${it.qty}</td><td class="r">${money(it.price)}</td><td class="r">${money(it.qty * it.price)}</td></tr>`).join('')}
      </tbody></table>
      <div class="sum">
        <div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
        ${inv.discountAmt ? `<div><span>Discount${inv.discount && inv.discount.code ? ` (${esc(inv.discount.code)})` : ''}</span><span>−${money(inv.discountAmt)}</span></div>` : ''}
        <div><span>${inv.tax ? `Tax ${inv.taxPct}%` : 'Tax'}</span><span>${inv.tax ? money(inv.tax) : 'Not charged'}</span></div>
        <div class="tot"><span>Total</span><span>${money(inv.total)}</span></div>
      </div>
      ${inv.status === 'paid' ? '<span class="rc-paid">PAID</span>' : ''}
      <p class="rc-foot">${DEMO ? 'Computer-generated receipt. Demo document with sample data, not valid for tax or insurance claims.' : 'This is a computer-generated receipt and does not need a signature.'}</p>
    </div>`;
  }

  function receipt(invId, justPaid) {
    const inv = S.invoice(invId), p = S.patient(inv.patientId);
    const sent = (ch) => inv.sentVia.includes(ch);
    openModal(`${head(justPaid ? 'Payment received' : `Receipt ${inv.no}`, justPaid ? `${money(inv.total)} from ${esc(p.name)} · ${esc(inv.payment.mode)}` : esc(p.name))}
      ${receiptHTML(inv)}
      <div class="modal-f">
        ${S.receiptPdfUrl(inv) ? `<a class="btn ghost" href="${esc(S.receiptPdfUrl(inv))}" target="_blank" rel="noopener">Download PDF</a>` : `<button class="btn ghost" data-action="print" data-id="${inv.id}">Print / Save PDF</button>`}
        <button class="btn ghost" data-action="send-receipt" data-ch="email" data-id="${inv.id}" ${p.email ? '' : 'disabled'}>${sent('email') ? 'Sent by email ✓' : 'Email receipt'}</button>
        <button class="btn lime" data-action="send-receipt" data-ch="whatsapp" data-id="${inv.id}">${sent('whatsapp') ? 'Sent on WhatsApp ✓' : 'Send on WhatsApp'}</button>
      </div>`, true);
  }

  function offerComposer() {
    const t = T();
    const o = { title: 'Winter Smile Week', kind: 'pct', value: 15, code: 'SMILE15', validTill: S.addDays(t, 14), audience: 'all', channel: 'whatsapp', message: '' };
    o.message = S.defaultOfferMessage(o);
    openModal(`${head('New offer', 'Write it once, send it to the right patients')}
      <div class="offer-grid">
        <form class="stack" id="ofForm">
          <label class="f">Offer name<input class="in" name="title" value="${esc(o.title)}" /></label>
          <div class="grid3">
            <label class="f">Discount<input class="in num" name="value" type="number" min="1" value="${o.value}" /></label>
            <label class="f">Type<select class="in" name="kind"><option value="pct">% off</option><option value="flat">₹ off</option></select></label>
            <label class="f">Code<input class="in" name="code" value="${o.code}" style="text-transform:uppercase" /></label>
          </div>
          <div class="grid2">
            <label class="f">Valid till<input class="in" name="validTill" type="date" min="${t}" value="${o.validTill}" /></label>
            <label class="f">Send by<select class="in" name="channel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></select></label>
          </div>
          <label class="f">Who gets it<select class="in" name="audience">${S.audiences.map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}</select><small id="ofCount"></small></label>
          <label class="f">Message <small>{name} {discount} {code} {validTill} are filled in per patient</small><textarea class="in" name="message" rows="4">${esc(o.message)}</textarea></label>
          <p class="err-msg" id="ofErr"></p>
          <div class="modal-f"><button type="button" class="btn ghost" data-action="close">Cancel</button><button class="btn dark" id="ofSend">Send offer</button></div>
        </form>
        <div><div class="phone"><div class="phone-top">${esc(cfg.clinic.name)}</div><div class="bubble" id="ofPrev"></div></div></div>
      </div>`, true);
    let armed = false;
    const form = $('#ofForm');
    const read = () => Object.assign(o, Object.fromEntries(new FormData(form)), { value: Number(form.value.value) || 0, code: form.code.value.trim().toUpperCase() });
    const sync = () => {
      read();
      const target = S.audience(o.audience), rec = target.filter((p) => p.optIn);
      const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      $('#ofCount').textContent = `${pl(rec.length, 'patient')} will get it${target.length - rec.length ? ` · ${target.length - rec.length} opted out and will be skipped` : ''}`;
      const sample = rec[0] || S.state.patients[0];
      $('#ofPrev').innerHTML = `${esc(S.renderOffer(o, sample))}<small>${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small>`;
      armed = false; $('#ofSend').textContent = 'Send offer';
    };
    form.oninput = form.onchange = sync;
    form.onsubmit = async (e) => {
      e.preventDefault(); read();
      if (!o.title.trim() || !o.code || !o.value) { $('#ofErr').textContent = 'Add an offer name, a discount and a code.'; return; }
      if (S.state.offers.some((x) => x.code === o.code)) { $('#ofErr').textContent = `Code ${o.code} is already used. Pick another.`; return; }
      const n = S.audience(o.audience).filter((p) => p.optIn).length;
      if (!armed) { armed = true; $('#ofSend').textContent = `Confirm: send to ${n} patient${n === 1 ? '' : 's'}`; $('#ofErr').textContent = ''; return; }
      let sentO;
      try { sentO = await S.createOffer(o); } catch (err) { $('#ofErr').textContent = err.message; armed = false; $('#ofSend').textContent = 'Send offer'; return; }
      closeModal();
      const n2 = sentO.stats.sent, who = `${n2} patient${n2 === 1 ? '' : 's'}`;
      toast(DEMO ? `<b>${esc(sentO.code)}</b> sent to ${who}${demoNote('logged in Messages, nothing was actually sent')}`
        : S.integrations[o.channel === 'email' ? 'email' : 'whatsapp'] ? `<b>${esc(sentO.code)}</b> is going out to ${who}. Delivery status shows in Messages.`
        : `<b>${esc(sentO.code)}</b> recorded for ${who}, but not delivered: ${chName[o.channel]} isn't connected yet.`, 6000);
    };
    sync();
  }

  function offerPreview(id) {
    const o = S.state.offers.find((x) => x.id === id);
    const sample = S.state.patients.find((p) => p.optIn);
    openModal(`${head(esc(o.title), `${esc(o.code)} · ${S.offerLabel(o)} off · valid till ${S.fmtDate(o.validTill)}`)}
      <div class="phone"><div class="phone-top">${esc(cfg.clinic.name)}</div><div class="bubble">${esc(S.renderOffer(o, sample))}<small>${ago(o.sentAt)}</small></div></div>
      <div class="stats-inline" style="justify-content:center;margin-top:14px"><span>Sent <b>${o.stats.sent}</b></span><span>Skipped <b>${o.stats.optedOut}</b></span><span>Redeemed <b>${S.redemptions(o.code)}</b></span></div>`);
  }

  function compose(pid) {
    const p = S.patient(pid);
    openModal(`${head(`Message ${esc(first(p.name))}`, esc(p.phone))}
      <form class="stack" id="msgForm">
        <label class="f">Send by<select class="in" name="channel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>${p.email ? '<option value="email">Email</option>' : ''}</select></label>
        <label class="f">Message<textarea class="in" name="body" rows="4">Hi ${esc(first(p.name))}, </textarea></label>
        <div class="modal-f"><button type="button" class="btn ghost" data-action="close">Cancel</button><button class="btn dark">Send</button></div>
      </form>`);
    $('#msgForm').onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (f.body.trim().length < 3) return;
      try { const r = await S.sendMessage({ patientId: pid, channel: f.channel, body: f.body.trim() }); closeModal(); toast(delivery(r, f.channel, `<b>${esc(p.name)}</b>`)); } catch (err) { fail(err); }
    };
  }

  // ======================= DRAWER =======================
  function openDrawer(pid) { drawerPid = pid; drawDrawer(); $('#drawer').hidden = false; }
  function closeDrawer() { drawerPid = null; $('#drawer').hidden = true; }
  function drawDrawer() {
    if (!drawerPid) return;
    const p = S.patient(drawerPid), st = S.patientStats(p.id), tags = S.patientTags(p.id);
    const events = [
      ...S.patientAppointments(p.id).map((a) => ({ at: a.date + 'T' + a.time, html: `<b>${esc(S.tr(a.treatmentId).name)}</b> <span class="pill ${a.status}">${statusLabel(a.status)}</span><small>${S.fmtDate(a.date)}, ${S.fmtTime(a.time)} · via ${esc(a.source)}</small>` })),
      ...S.patientInvoices(p.id).map((i) => ({ at: (i.payment ? i.payment.paidAt : i.date + 'T23:59').slice(0, 16), cls: 'inv', html: `<a href="#" data-action="${i.status === 'paid' ? 'receipt' : 'collect'}" data-id="${i.id}"><b>Bill ${i.no} · ${money(i.total)}</b></a> <span class="pill ${i.status}">${statusLabel(i.status)}</span><small>${esc(i.items.map((x) => x.name).join(', '))}${i.payment ? ' · ' + esc(i.payment.mode) : ''}</small>` })),
      ...S.state.messages.filter((m) => m.patientId === p.id).slice(0, 12).map((m) => ({ at: m.at.slice(0, 16), html: `${esc(kindLabel[m.kind] || m.kind)} sent<small>${ago(m.at)}</small>` })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 18);
    $('#drawerBox').innerHTML = `
      <div class="modal-h"><div><h2>${esc(p.name)}</h2><p>${esc(p.phone)}${p.email ? ' · ' + esc(p.email) : ''}${p.area ? ' · ' + esc(p.area) : ''}</p></div><button class="x" data-action="close-drawer" aria-label="Close">×</button></div>
      <div>${tags.map((t) => `<span class="tag ${t === 'VIP' ? 'VIP' : t === 'Payment due' ? 'pay' : ''}">${t}</span>`).join('')}</div>
      <div class="mini-kpis"><div><small>Visits</small><b class="num">${st.visits}</b></div><div><small>Paid</small><b class="num">${money(st.spent)}</b></div><div><small>Due</small><b class="num" style="${st.due ? 'color:var(--bad)' : ''}">${money(st.due)}</b></div></div>
      ${st.next ? `<p style="margin-bottom:12px">Next: <b>${esc(S.tr(st.next.treatmentId).name)}</b>, ${S.fmtDate(st.next.date)} at ${S.fmtTime(st.next.time)}</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn sm dark" data-action="new-appt" data-id="${p.id}">Book</button>
        <button class="btn sm ghost" data-action="new-bill" data-id="${p.id}">New bill</button>
        <button class="btn sm ghost" data-action="compose" data-id="${p.id}">Message</button>
      </div>
      <label class="switch" style="margin-bottom:14px"><input type="checkbox" data-action="optin" data-id="${p.id}" ${p.optIn ? 'checked' : ''}/> Receives offers & reminders</label>
      <label class="f" style="margin-bottom:18px">Notes<textarea class="in" rows="2" data-action="notes" data-id="${p.id}" placeholder="Allergies, preferences, anxiety…">${esc(p.notes)}</textarea></label>
      <h3 style="font-size:15px;margin-bottom:10px">History</h3>
      <div class="timeline">${events.map((e) => `<div class="${e.cls || ''}">${e.html}</div>`).join('') || '<p class="hint">No history yet.</p>'}</div>`;
  }

  // ======================= RENDER / EVENTS =======================
  function render() {
    const v = VIEWS[current];
    $('#title').textContent = v.title;
    document.title = `${v.title} · Aurelia Dental`;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === current));
    $('#view').innerHTML = v.render();
    renderChrome();
    v.after && v.after();
    if (drawerPid && !$('#drawer').hidden) drawDrawer();
  }
  function renderChrome() {
    const I = S.integrations, names = [['googleCalendar', 'Google Calendar'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['razorpay', 'Razorpay'], ['googleSheets', 'Google Sheets']];
    $('.demo-card').innerHTML = DEMO
      ? '<b>Demo mode</b><p>Sample data, saved in this browser only. Nothing is charged or sent.</p><button class="link-btn" data-action="reset">Reset demo data</button>'
      : `<b>Connections</b><p>${names.map(([k, l]) => `${I[k] ? '●' : '○'} ${l}${I[k] ? '' : ' · off'}`).join('<br>')}</p><button class="link-btn" data-action="sign-out">Sign out</button>`;
    $('.sync').innerHTML = DEMO || I.googleCalendar ? '<span class="dot"></span>Google Calendar synced' : '<span class="dot" style="background:var(--muted);box-shadow:none"></span>Google Calendar not connected';
  }
  function route() { const h = location.hash.slice(1); current = VIEWS[h] ? h : 'overview'; render(); window.scrollTo(0, 0); }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action, id = el.dataset.id;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    const M = billEditor.m;
    switch (a) {
      case 'close': closeModal(); break;
      case 'close-drawer': closeDrawer(); break;
      case 'reset': if (DEMO && confirm('Reset all demo data to the original sample?')) { S.reset(); closeDrawer(); toast('Demo data reset'); } break;
      case 'sign-out': S.signOut(); location.reload(); break;
      case 'void': if (confirm('Void this unpaid bill? It will disappear from billing.')) { try { await S.voidInvoice(id); toast('Bill voided'); } catch (err) { fail(err); } } break;
      case 'new-appt': newAppointment(id); break;
      case 'new-bill': billEditor({ patientId: id }); break;
      case 'bill-appt': billEditor({ appointmentId: id }); break;
      case 'done': try { await S.setStatus(id, 'completed'); billEditor({ appointmentId: id }); } catch (err) { fail(err); } break;
      case 'collect': payment(id); break;
      case 'receipt': receipt(id); break;
      case 'patient': openDrawer(id); break;
      case 'compose': compose(id); break;
      case 'appt': { const ap = S.appointment(id); openDrawer(ap.patientId); break; }
      case 'week': ui.week = Number(el.dataset.d) === 0 ? 0 : ui.week + Number(el.dataset.d); render(); break;
      case 'appt-filter': ui.apptFilter = el.dataset.k; render(); break;
      case 'bill-filter': ui.billFilter = el.dataset.k; render(); break;
      case 'msg-filter': ui.msgKind = el.dataset.k; render(); break;
      case 'new-offer': offerComposer(); break;
      case 'offer': offerPreview(id); break;
      case 'bl-add': M.add(); break;
      case 'bl-rm': M.rm(Number(el.dataset.i)); break;
      case 'bl-code': M.code(); break;
      case 'bl-save': M.save(false); break;
      case 'bl-pay': M.save(true); break;
      case 'print': $('#print').innerHTML = receiptHTML(S.invoice(id)); window.print(); break;
      case 'send-receipt': {
        const inv = S.invoice(id), p = S.patient(inv.patientId), ch = el.dataset.ch;
        el.disabled = true;
        try { const r = await S.sendReceipt(id, ch); receipt(id); toast(`Receipt ${inv.no}: ${delivery(r, ch, ch === 'email' ? esc(p.email) : esc(p.phone))}`, 5000); } catch (err) { el.disabled = false; fail(err); }
        break;
      }
      case 'send-reminders': {
        try { const n = await S.sendRemindersNow(); toast(`${n} reminder${n === 1 ? '' : 's'} ${DEMO ? 'sent' + demoNote('logged, not actually sent') : S.integrations.whatsapp ? 'sent. Delivery status shows in the Outbox.' : 'recorded, but not delivered: WhatsApp isn\'t connected yet'}`); } catch (err) { fail(err); }
        break;
      }
    }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target, a = el.dataset.action;
    try {
      if (a === 'status') { await S.setStatus(el.dataset.id, el.value); toast(`Marked ${statusLabel(el.value).toLowerCase()}${el.value === 'cancelled' && (DEMO || S.integrations.googleCalendar) ? ' · removed from Google Calendar' + demoNote('simulated') : ''}`); }
      if (a === 'setting') await S.updateSettings({ [el.dataset.k]: el.checked });
      if (a === 'optin') await S.updatePatient(el.dataset.id, { optIn: el.checked });
      if (a === 'notes') { await S.updatePatient(el.dataset.id, { notes: el.value }); toast('Notes saved'); }
    } catch (err) { fail(err); }
    if (el.id === 'patTag') { ui.patTag = el.value; $('#list').innerHTML = VIEWS.patients.list(); }
  });
  document.addEventListener('input', (e) => {
    const map = { apptQ: ['apptQ', 'appointments'], patQ: ['patQ', 'patients'], billQ: ['billQ', 'billing'] };
    const m = map[e.target.id]; if (!m) return;
    ui[m[0]] = e.target.value; $('#list').innerHTML = VIEWS[m[1]].list();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (!$('#drawer').hidden) closeDrawer(); } });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => current === 'overview' && drawRevenue(), 150); });
  window.addEventListener('hashchange', route);
  function start() {
    cfg = S.cfg; money = S.money;
    $('#login').hidden = true; $('.app').hidden = false;
    S.subscribe(() => { if (S.state) render(); });
    route();
  }
  async function boot() {
    if (DEMO) return start();
    if (await S.resume()) return start();
    $('.app').hidden = true; $('#login').hidden = false; $('#loginToken').focus();
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault(); $('#loginErr').textContent = '';
      try { await S.signIn($('#loginToken').value); start(); } catch (err) { $('#loginErr').textContent = err.status === 401 ? 'That access key is wrong.' : err.message; }
    };
  }
  boot();
})();
