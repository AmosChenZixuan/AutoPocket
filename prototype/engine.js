// autopocket prototype engine: month-by-month cash-flow "waterfall" simulation.
// Pure functions, no I/O. Single filer, California, 2026 tax tables (approximate).
// Behavior spec and test vectors: docs/prototype-spec.md
const ENG = (() => {
  const FED = { std: 16100, br: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]] };
  const CA = { std: 5706, credit: 153, br: [[11079, .01], [26264, .02], [41452, .04], [57542, .06], [72724, .08], [371479, .093], [445771, .103], [742953, .113], [Infinity, .123]] };
  const SS_BASE = 184500, SDI = 0.013;
  const SUPP = { fed: .22, ca: .1023 };

  const bracketTax = (inc, br) => { let t = 0, lo = 0; inc = Math.max(0, inc); for (const [hi, r] of br) { if (inc <= lo) break; t += (Math.min(inc, hi) - lo) * r; lo = hi; } return t; };
  const fedTax = (w) => bracketTax(w - FED.std, FED.br);
  const caTax = (w) => Math.max(0, bracketTax(w - CA.std, CA.br) - CA.credit);

  const mk = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const parse = (k) => { const [y, m] = k.split('-').map(Number); return { y, m }; };
  const addM = (k, n) => { let { y, m } = parse(k); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return mk(y, m); };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function paydays(first, endYear) {
    const out = []; let d = new Date(first + 'T12:00:00');
    while (d.getFullYear() <= endYear) { out.push(new Date(d)); d.setDate(d.getDate() + 14); }
    return out;
  }
  const k401For = (s, y) => { const ys = Object.keys(s.k401).map(Number).sort(); let c = s.k401[ys[0]]; for (const yy of ys) if (y >= yy) c = s.k401[yy]; return c; };

  function budgetTotal(b) { return Object.values(b).reduce((a, v) => a + (+v || 0), 0); }

  // ---------- payroll: runs from first paycheck regardless of plan start ----------
  function payroll(s, endYear) {
    const days = paydays(s.income.firstPaycheck, endYear);
    const perYear = {}; days.forEach(d => { perYear[d.getFullYear()] = (perYear[d.getFullYear()] || 0) + 1; });
    const months = {}; // key -> {checks:[], bonus:null}
    const ytd = {}; // year -> totals
    const Y = (y) => (ytd[y] ||= { fedW: 0, caW: 0, fedWH: 0, caWH: 0, ss: 0, k: 0, hsa: 0, match: 0, gross: 0, seen: 0 });
    const lim = s.limits;
    const prem = +s.ded.premium || 0; // health premium per paycheck (pre-tax)
    const matchTiers = s.income.match || []; // [{upTo: % of pay, rate: employer $ per $}], ascending
    const matchPct = (p) => { let m = 0, lo = 0; for (const t of matchTiers) { m += Math.max(0, Math.min(p, t.upTo) - lo) * t.rate; lo = t.upTo; } return m; };
    const hsaLimitYear = (y) => {
      if (!s.ded.hsaEligible) return 0;
      const st = parse(s.ded.hdhpStart);
      if (y < st.y) return 0;
      if (y === st.y) return lim.hsa * (13 - st.m) / 12;
      return lim.hsa;
    };
    const gross = s.income.base / 26;
    const bonusDates = [];
    if (s.income.includeVariable && s.income.variable > 0) {
      let k = s.income.firstVariable;
      while (parse(k).y <= endYear) { bonusDates.push(k); k = addM(k, 3); }
    }
    // merge events in time order: paychecks, bonus at mid-month (15th)
    const events = days.map(d => ({ t: d, kind: 'pay' }));
    bonusDates.forEach(k => { const { y, m } = parse(k); events.push({ t: new Date(y, m - 1, 15, 12), kind: 'bonus' }); });
    events.sort((a, b) => a.t - b.t);
    for (const ev of events) {
      const y = ev.t.getFullYear(), key = mk(y, ev.t.getMonth() + 1);
      const T = Y(y); const cfg = k401For(s, y);
      const M = (months[key] ||= { checks: [], bonus: null });
      const matchOn = s.income.matchOn && cmp(key, s.income.matchFrom) >= 0;
      if (ev.kind === 'pay') {
        T.seen++;
        const left = perYear[y] - T.seen + 1;
        const hsaRoom = Math.max(0, hsaLimitYear(y) - T.hsa);
        const hsa = (s.ded.hsaEligible && cmp(key, s.ded.hdhpStart) >= 0) ? hsaRoom / left : 0;
        const k = Math.min(gross * cfg.pct / 100, Math.max(0, lim.k401 - T.k));
        const trad = cfg.type === 'trad' ? k : 0;
        const fedWage = gross - prem - hsa - trad;
        const fedWH = fedTax(fedWage * 26) / 26;
        const caWage = gross - prem - trad;
        const caWH = caTax(caWage * 26) / 26;
        const ficaW = gross - prem - hsa;
        const ss = Math.max(0, Math.min(ficaW, SS_BASE - T.ss)) * .062; T.ss += Math.min(ficaW, Math.max(0, SS_BASE - T.ss));
        const med = ficaW * .0145, sdi = ficaW * SDI;
        const p = gross > 0 ? k / gross * 100 : 0;
        const match = matchOn ? gross * matchPct(p) / 100 : 0;
        const net = gross - prem - hsa - k - fedWH - caWH - ss - med - sdi;
        T.fedW += fedWage; T.caW += caWage; T.fedWH += fedWH; T.caWH += caWH; T.k += k; T.hsa += hsa; T.match += match; T.gross += gross;
        M.checks.push({ date: ev.t.toISOString().slice(0, 10), gross, prem, hsa, k, kType: cfg.type, fedWH, caWH, fica: ss + med, sdi, net, match });
      } else {
        const g = s.income.variable / 4;
        const k = Math.min(g * cfg.pct / 100, Math.max(0, lim.k401 - T.k));
        const trad = cfg.type === 'trad' ? k : 0;
        const fedWH = (g - trad) * SUPP.fed, caWH = (g - trad) * SUPP.ca;
        const ss = Math.max(0, Math.min(g, SS_BASE - T.ss)) * .062; T.ss += Math.min(g, Math.max(0, SS_BASE - T.ss));
        const med = g * .0145, sdi = g * SDI;
        const p = k / g * 100;
        const match = matchOn ? g * matchPct(p) / 100 : 0;
        const net = g - k - fedWH - caWH - ss - med - sdi;
        T.fedW += g - trad; T.caW += g - trad; T.fedWH += fedWH; T.caWH += caWH; T.k += k; T.match += match; T.gross += g;
        M.bonus = { gross: g, k, kType: cfg.type, fedWH, caWH, fica: ss + med, sdi, net, match };
      }
    }
    // refunds land in March of the following year
    const refunds = {};
    for (const [y, T] of Object.entries(ytd)) {
      const fed = T.fedWH - fedTax(T.fedW), ca = T.caWH - caTax(T.caW);
      refunds[mk(+y + 1, 3)] = { year: +y, fed, ca, total: fed + ca, fedLiab: fedTax(T.fedW), caLiab: caTax(T.caW) };
    }
    return { months, ytd, refunds, prem };
  }

  // ---------- full plan ----------
  function simulate(s, start) {
    const endKey = s.plan.end || '2029-12';
    const endYear = parse(endKey).y;
    const P = payroll(s, endYear);
    const bMoved = budgetTotal(s.exp.moved);
    const basis = s.plan.basis === 'improved' ? budgetTotal(s.exp.improved) : bMoved;
    const target1 = s.plan.b1Months * basis, target2 = s.plan.b2Months * basis;
    const floor1 = Math.min(target1, s.plan.floorMonths * basis);
    const st = start.balances;
    const B = {
      checking: +st.checking || 0,
      cash: (+st.hysa || 0) + (+st.brokerageCash || 0),
      rothCash: +st.rothCash || 0, rothInv: +st.rothInv || 0,
      brokerage: +st.brokerage || 0, k401: +st.k401 || 0, hsa: +st.hsa || 0,
      loan: +st.loan || 0, foreign: +st.foreign || 0,
    };
    let rothPrin = +st.rothPrin || (B.rothCash + B.rothInv);
    const rothUsed = {}; // tax year -> contributed
    const sk = parse(start.month);
    if (st.rothThisYear) rothUsed[sk.y] = +st.rothThisYear;
    if (st.rothPriorYear) rothUsed[sk.y - 1] = +st.rothPriorYear;
    let moved = s.move.mode === 'month' ? cmp(start.month, s.move.month) >= 0 : !!st.moved;
    let investing = false;
    const rows = []; const ms = { car: null, b1: null, b2: null, move: moved ? start.month : null, invest: null };
    if (B.loan <= 0) ms.car = 'done';
    const gM = Math.pow(1 + s.plan.ret / 100, 1 / 12) - 1, cM = s.plan.hysa / 100 / 12, lR = s.debt.rate / 100 / 12;
    const foreignAdd = s.plan.foreignCounts ? B.foreign : 0;

    for (let key = start.month; cmp(key, endKey) <= 0; key = addM(key, 1)) {
      const { y, m } = parse(key);
      const r = { key, moved, flows: {}, notes: [] };
      // move trigger (fixed month)
      if (!moved && s.move.mode === 'month' && cmp(key, s.move.month) >= 0) { moved = true; ms.move = key; }
      r.moved = moved;
      // income
      const PM = P.months[key] || { checks: [], bonus: null };
      const pay = PM.checks.reduce((a, c) => a + c.net, 0);
      const bonus = PM.bonus ? PM.bonus.net : 0;
      const refund = P.refunds[key] ? P.refunds[key].total : 0;
      const k401c = PM.checks.reduce((a, c) => a + c.k + c.match, 0) + (PM.bonus ? PM.bonus.k + PM.bonus.match : 0);
      const hsac = PM.checks.reduce((a, c) => a + c.hsa, 0);
      // expenses
      const bud = moved ? s.exp.moved : (cmp(key, s.exp.improveFrom) >= 0 ? s.exp.improved : s.exp.now);
      let exp = budgetTotal(bud);
      if (m === +s.exp.regMonth && cmp(key, s.exp.regPaidThrough) > 0) { exp += +s.exp.reg; r.notes.push(`车辆注册费 $${s.exp.reg}`); }
      // interest on balances (start-of-month)
      const cashInt = B.cash * cM + B.rothCash * cM;
      B.cash += B.cash * cM; B.rothCash += B.rothCash * cM;
      // loan
      let loanInt = 0, carMin = 0;
      if (B.loan > 0) { loanInt = B.loan * lR; B.loan += loanInt; carMin = Math.min(B.loan, s.debt.min); B.loan -= carMin; }
      // checking flows
      B.checking += pay + bonus + refund - exp - carMin;
      const f = { pay, bonus, refund, exp, carMin, carExtra: 0, carFromSavings: 0, toCash: 0, fromCash: 0, rothPrior: 0, rothCur: 0, brokerage: 0, k401: k401c, hsa: hsac, loanInt, cashInt };
      const buf = s.plan.buffer;
      // restore buffer from cash if short
      if (B.checking < buf) { const need = buf - B.checking; const x = Math.min(need, B.cash); B.cash -= x; B.checking += x; f.fromCash += x; }
      let avail = Math.max(0, B.checking - buf);
      const take = (x) => { x = Math.max(0, Math.min(x, avail)); avail -= x; B.checking -= x; return x; };
      // 1. car loan
      if (B.loan > 0.005 && cmp(key, s.debt.payoffStart) >= 0) {
        const fromSav = Math.min(B.loan, Math.max(0, B.cash - s.debt.keepCash));
        B.cash -= fromSav; B.loan -= fromSav; f.carFromSavings = fromSav;
        const x = take(B.loan); B.loan -= x; f.carExtra = x;
        if (B.loan < 0.01) { B.loan = 0; if (!ms.car) ms.car = key; }
      }
      const loanFree = B.loan <= 0.005;
      if (loanFree) {
        // 2. emergency floor
        if (B.cash + foreignAdd < floor1) { const x = take(floor1 - B.cash - foreignAdd); B.cash += x; f.toCash += x; }
        // 3. prior-year Roth IRA (Jan - Apr 15)
        if (m <= 4) {
          const py = y - 1, room = Math.max(0, s.limits.roth - (rothUsed[py] || 0));
          if (room > 0 && s.plan.rothPrior && P.ytd[py]) {
            let x = take(room);
            if (m === 4 && x < room) { const y2 = Math.min(room - x, Math.max(0, B.cash + foreignAdd - floor1)); B.cash -= y2; f.fromCash += y2; x += y2; }
            rothUsed[py] = (rothUsed[py] || 0) + x; f.rothPrior = x; rothPrin += x;
            if (investing) B.rothInv += x; else B.rothCash += x;
          }
        }
        // 4. bucket 1
        if (B.cash + foreignAdd < target1) { const x = take(target1 - B.cash - foreignAdd); B.cash += x; f.toCash += x; }
        if (!ms.b1 && B.cash + foreignAdd >= target1 - 1) ms.b1 = key;
        // 5. bucket 2: current-year Roth IRA (cash) then HYSA
        const b2 = () => B.cash + foreignAdd + B.rothCash;
        if (!investing && b2() < target2) {
          const room = Math.max(0, s.limits.roth - (rothUsed[y] || 0));
          const x = take(Math.min(room, target2 - b2())); rothUsed[y] = (rothUsed[y] || 0) + x; B.rothCash += x; f.rothCur += x; rothPrin += x;
          const z = take(target2 - b2()); B.cash += z; f.toCash += z;
        }
        if (!ms.b2 && b2() >= target2 - 1) ms.b2 = key;
        // 6. invest
        if (ms.b1 && ms.b2 && !investing) { investing = true; ms.invest = key; B.rothInv += B.rothCash; B.rothCash = 0; r.notes.push('Roth IRA 内货币基金转为股票指数基金'); }
        if (investing) {
          // refill cash if it fell below target (e.g. after move)
          // bucket 2 = cash + Roth IRA principal (withdrawable). Keep cash at max(target1, target2 - principal).
          const cashGoal = Math.max(target1, target2 - rothPrin);
          if (B.cash + foreignAdd < cashGoal) { const x = take(cashGoal - B.cash - foreignAdd); B.cash += x; f.toCash += x; }
          const room = Math.max(0, s.limits.roth - (rothUsed[y] || 0));
          const x = take(room); rothUsed[y] = (rothUsed[y] || 0) + x; B.rothInv += x; f.rothCur += x; rothPrin += x;
          const z = take(avail); B.brokerage += z; f.brokerage = z;
        }
      }
      // remaining avail stays in checking (only while loan > 0 before payoffStart)
      // auto-move after both buckets full
      if (!moved && s.move.mode === 'auto' && ms.b1 && ms.b2) { moved = true; ms.move = addM(key, 1); r.notes.push('两个桶已满，下个月起按搬家后预算'); }
      // growth on invested
      B.k401 = B.k401 * (1 + gM) + k401c; B.hsa = B.hsa * (1 + gM) + hsac;
      B.rothInv *= (1 + gM); B.brokerage *= (1 + gM);
      r.flows = f;
      r.bal = { ...B };
      r.rothUsed = { ...rothUsed }; r.rothPrin = rothPrin;
      r.stage = B.loan > 0.005 ? 'debt' : !ms.b1 ? 'b1' : !ms.b2 ? 'b2' : 'invest';
      r.liquid = B.checking + B.cash + B.rothCash + B.rothInv + B.brokerage;
      r.net = r.liquid + B.k401 + B.hsa + B.foreign - B.loan;
      r.short = B.checking < -0.5;
      rows.push(r);
    }
    return { rows, ms, target1, target2, floor1, basis, payroll: P, budgets: { now: budgetTotal(s.exp.now), improved: budgetTotal(s.exp.improved), moved: bMoved } };
  }
  return { simulate, payroll, budgetTotal, addM, cmp, parse, mk, fedTax, caTax };
})();
if (typeof module !== 'undefined') module.exports = ENG;
