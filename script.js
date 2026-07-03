/* ==========================================================
   16K Saltwater Pool Advisor — script.js
   All dosing math is calculated for a 16,000-gallon pool.
   Change GALLONS below if your volume ever changes.
   ========================================================== */

(function(){
  const GALLONS = 16000;
  const per10k = GALLONS / 10000; // scales standard per-10,000-gal dosing

  // Parameter definitions: ideal band, acceptable band, gauge span
  const PARAMS = {
    fc:   {label:'Free Chlorine', unit:'ppm', lo:3,   hi:5,   okLo:2,   okHi:8,   min:0,    max:12,  dp:1},
    ph:   {label:'pH',            unit:'',    lo:7.4, hi:7.6, okLo:7.2, okHi:7.8, min:6.6,  max:8.6, dp:1},
    ta:   {label:'Total Alkalinity', unit:'ppm', lo:60, hi:90, okLo:50, okHi:120, min:0,   max:200, dp:0},
    cya:  {label:'Cyanuric Acid (Stabilizer)', unit:'ppm', lo:60, hi:80, okLo:50, okHi:90, min:0, max:150, dp:0},
    ch:   {label:'Calcium Hardness', unit:'ppm', lo:200, hi:400, okLo:150, okHi:500, min:0, max:700, dp:0},
    salt: {label:'Salt', unit:'ppm', lo:2800, hi:3600, okLo:2600, okHi:4000, min:0, max:6000, dp:0}
  };

  const fmt = n => {
    const r = Math.round(n*10)/10;
    return r % 1 === 0 ? r.toLocaleString() : r.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
  };
  const ozOrQuarts = oz => {
    if (oz >= 128) return fmt(oz/128) + ' gal (' + fmt(oz) + ' fl oz)';
    if (oz >= 32)  return fmt(oz/32)  + ' qt ('  + fmt(oz) + ' fl oz)';
    return fmt(oz) + ' fl oz';
  };

  /* ---- recommendation engines (return {verdict, level, dose, note}) ---- */

  function adviseFC(v, cya){
    const p = PARAMS.fc;
    // With known CYA, minimum safe FC is ~5% of CYA, target ~7.5%
    let lo = p.lo, hi = p.hi;
    if (cya != null && !isNaN(cya) && cya > 0){
      lo = Math.max(2, Math.round(cya * 0.05));
      hi = Math.max(lo + 2, Math.round(cya * 0.075) + 1);
    }
    if (v < lo){
      const targetMid = (lo + hi) / 2;
      const need = targetMid - v;
      const oz = need * 10 * per10k; // 10 fl oz of 12.5% liquid chlorine raises 1 ppm per 10k gal
      const level = v < lo * 0.5 ? 'bad' : 'warn';
      return {level,
        verdict: v <= 0.5 ? 'Critically low — algae risk. Act today.' : 'Low for your stabilizer level.',
        dose: 'Add <strong>' + ozOrQuarts(oz) + '</strong> of 12.5% liquid chlorine to reach ~' + fmt(targetMid) + ' ppm, and bump your SWG output up 10–20% (or extend pump runtime).',
        note: 'If FC keeps dropping fast in sunlight, verify CYA is in range and inspect the salt cell for scale.'};
    }
    if (v > hi + 3){
      return {level:'warn', verdict:'Higher than needed.',
        dose:'Turn your SWG output down and let sunlight burn it off — no chemicals needed. Avoid swimming above 10 ppm.',
        note:'High FC wastes cell life and can bleach liners over time.'};
    }
    return {level:'ok', verdict:'In range — your cell is keeping up.', dose:null, note:null};
  }

  function advisePH(v, ta){
    if (v > 7.8){
      // ~12 fl oz of 31.45% muriatic acid lowers pH ~0.2 per 10k gal (at TA ~80)
      const drop = v - 7.5;
      const oz = (drop / 0.2) * 12 * per10k;
      return {level: v >= 8.2 ? 'bad' : 'warn',
        verdict:'High — normal drift for saltwater pools, but it needs correcting.',
        dose:'Add <strong>' + ozOrQuarts(oz) + '</strong> of muriatic acid (31.45%) to bring pH to ~7.5. Pour slowly into the deep end with the pump running.',
        note:'SWG pools drift up constantly. If you fight pH weekly, keeping TA at 60–70 slows the climb.'};
    }
    if (v < 7.2){
      const rise = 7.5 - v;
      const oz = (rise / 0.2) * 10 * per10k; // ~10 oz soda ash raises 0.2 per 10k gal
      return {level: v <= 6.9 ? 'bad' : 'warn',
        verdict:'Low — acidic water corrodes equipment and irritates eyes.',
        dose:'Add <strong>' + fmt(oz) + ' oz</strong> (by weight) of soda ash (sodium carbonate), pre-dissolved in a bucket. Alternatively, run water features — aeration raises pH without chemicals.',
        note: (ta != null && ta < 60) ? 'Your alkalinity is also low, which makes pH unstable — fix TA first.' : null};
    }
    return {level:'ok', verdict:'In the sweet spot.', dose:null, note:null};
  }

  function adviseTA(v){
    const p = PARAMS.ta;
    if (v < p.lo){
      const need = 75 - v;
      const lbs = (need / 10) * 1.5 * per10k; // 1.5 lb baking soda raises TA 10 ppm per 10k gal
      return {level: v < 50 ? 'bad' : 'warn',
        verdict:'Low — pH will swing unpredictably.',
        dose:'Add <strong>' + fmt(lbs) + ' lbs</strong> of baking soda (sodium bicarbonate) to raise TA to ~75 ppm. Broadcast over the surface with the pump running.',
        note:'Add no more than 3–4 lbs at a time; retest after 6 hours.'};
    }
    if (v > p.okHi){
      return {level:'warn', verdict:'High — this drives pH up and invites scale on your salt cell.',
        dose:'Lower pH to 7.2 with muriatic acid, then aerate (water features, return jets pointed up). Repeat until TA lands near 70–80 ppm. It takes a few cycles — that\u2019s normal.',
        note:'There is no chemical that lowers TA alone; the acid-then-aerate cycle is the method.'};
    }
    return {level:'ok', verdict:'Right where a saltwater pool wants it.', dose:null, note:null};
  }

  function adviseCYA(v){
    const p = PARAMS.cya;
    if (v < p.lo){
      const need = 70 - v;
      const lbs = (need / 10) * 0.83 * per10k; // ~13 oz raises 10 ppm per 10k gal
      return {level: v < 30 ? 'bad' : 'warn',
        verdict:'Low — sunlight is eating your chlorine.',
        dose:'Add <strong>' + fmt(lbs) + ' lbs</strong> of stabilizer (cyanuric acid) to reach ~70 ppm. Put it in a sock hung in front of a return jet; it dissolves over 24–48 hours.',
        note:'Don\u2019t retest CYA for a full week — it reads artificially low while dissolving.'};
    }
    if (v > p.okHi){
      const drainPct = Math.round((1 - 70 / v) * 100);
      return {level: v > 120 ? 'bad' : 'warn',
        verdict:'High — chlorine gets locked up and loses killing power.',
        dose:'The only fix is dilution: drain and refill roughly <strong>' + drainPct + '%</strong> of the pool (~' + fmt(GALLONS * drainPct / 100) + ' gal) to bring CYA back to ~70 ppm.',
        note:'Refill will also drop your salt level — retest salt after refilling.'};
    }
    return {level:'ok', verdict:'Good sun protection for your chlorine.', dose:null, note:null};
  }

  function adviseCH(v){
    const p = PARAMS.ch;
    if (v < p.lo){
      const need = 300 - v;
      const lbs = (need / 10) * 1.25 * per10k; // 1.25 lb CaCl2 (77%) raises 10 ppm per 10k gal
      return {level: v < 150 ? 'bad' : 'warn',
        verdict:'Low — soft water can etch plaster and corrode metal.',
        dose:'Add <strong>' + fmt(lbs) + ' lbs</strong> of calcium chloride (77%) to reach ~300 ppm. Pre-dissolve in a bucket of water (it gets hot — add chemical to water, never the reverse) and pour around the perimeter.',
        note:'Add in stages of no more than 10 lbs, a few hours apart.'};
    }
    if (v > p.okHi){
      return {level:'warn', verdict:'High — scale risk, especially on your salt cell plates.',
        dose:'Dilution is the only fix: partially drain and refill with lower-calcium water. Meanwhile keep pH ≤ 7.6 and TA ≤ 80 to hold scaling in check.',
        note:'Inspect and clean your salt cell more often while CH is elevated.'};
    }
    return {level:'ok', verdict:'Healthy for plaster and equipment.', dose:null, note:null};
  }

  function adviseSalt(v){
    const p = PARAMS.salt;
    if (v < p.okLo){
      const need = 3200 - v;
      const lbs = need * (GALLONS * 8.34 / 1e6); // lbs per ppm for this volume ≈ 0.133
      const bags = Math.ceil(lbs / 40 * 10) / 10;
      return {level: v < 2200 ? 'bad' : 'warn',
        verdict:'Low — your generator may throttle or shut off.',
        dose:'Add <strong>' + fmt(lbs) + ' lbs</strong> of pool-grade salt (~' + fmt(bags) + ' × 40-lb bags) to reach ~3200 ppm. Broadcast into the shallow end, brush to dissolve, and run the pump 24 hours before retesting.',
        note:'Use plain pool salt (99%+ NaCl) — never rock salt or salt with anti-caking additives.'};
    }
    if (v > p.okHi){
      const drainPct = Math.round((1 - 3200 / v) * 100);
      return {level: v > 4500 ? 'bad' : 'warn',
        verdict:'High — risks a cell error or shutdown.',
        dose:'Drain and refill about <strong>' + drainPct + '%</strong> of the pool (~' + fmt(GALLONS * drainPct / 100) + ' gal) with fresh water to bring salt back to ~3200 ppm.',
        note:'Confirm against your generator\u2019s own salt reading — test strips and cells often disagree by a few hundred ppm.'};
    }
    return {level:'ok', verdict:'Your generator is happy.', dose:null, note:null};
  }

  /* ---- render ---- */

  function gaugePct(v, p){
    const clamped = Math.min(Math.max(v, p.min), p.max);
    return ((clamped - p.min) / (p.max - p.min)) * 100;
  }

  function paramCard(key, v, res){
    const p = PARAMS[key];
    const pct = gaugePct(v, p).toFixed(1);
    return `
    <div class="param">
      <div class="param-head">
        <h3>${p.label}</h3>
        <span class="reading">${fmt(v)} <span class="unit">${p.unit}</span></span>
      </div>
      <div class="gauge"><div class="marker" style="left:${pct}%"></div></div>
      <div class="gauge-labels"><span>${fmt(p.min)}</span><span>ideal ${fmt(p.lo)}–${fmt(p.hi)}</span><span>${fmt(p.max)}</span></div>
      <div class="verdict ${res.level}">${res.level === 'ok' ? '✓ ' : res.level === 'bad' ? '✕ ' : '△ '}${res.verdict}</div>
      ${res.dose ? `<div class="dose">${res.dose}</div>` : ''}
      ${res.note ? `<div class="note">${res.note}</div>` : ''}
    </div>`;
  }

  document.getElementById('analyze').addEventListener('click', () => {
    const read = id => {
      const el = document.getElementById(id);
      return el.value === '' ? null : parseFloat(el.value);
    };
    const vals = {fc:read('fc'), ph:read('ph'), ta:read('ta'), cya:read('cya'), ch:read('ch'), salt:read('salt')};
    const results = [];

    if (vals.fc   != null) results.push(['fc',   vals.fc,   adviseFC(vals.fc, vals.cya)]);
    if (vals.ph   != null) results.push(['ph',   vals.ph,   advisePH(vals.ph, vals.ta)]);
    if (vals.ta   != null) results.push(['ta',   vals.ta,   adviseTA(vals.ta)]);
    if (vals.cya  != null) results.push(['cya',  vals.cya,  adviseCYA(vals.cya)]);
    if (vals.ch   != null) results.push(['ch',   vals.ch,   adviseCH(vals.ch)]);
    if (vals.salt != null) results.push(['salt', vals.salt, adviseSalt(vals.salt)]);

    const box = document.getElementById('results');
    if (results.length === 0){
      box.style.display = 'block';
      box.innerHTML = '<div class="card">Enter at least one test result above, then analyze.</div>';
      return;
    }

    // sort issues first, worst first
    const rank = {bad:0, warn:1, ok:2};
    results.sort((a,b) => rank[a[2].level] - rank[b[2].level]);

    const issues = results.filter(r => r[2].level !== 'ok').length;
    let badgeCls = 'ok', badgeTxt = 'ALL SYSTEMS SWIM';
    if (issues === 1){ badgeCls = 'warn'; badgeTxt = '1 ADJUSTMENT NEEDED'; }
    if (issues >= 2){ badgeCls = issues >= 3 ? 'bad' : 'warn'; badgeTxt = issues + ' ADJUSTMENTS NEEDED'; }

    box.style.display = 'block';
    box.innerHTML =
      `<div class="summary"><h2>Today\u2019s water report</h2><span class="badge ${badgeCls}">${badgeTxt}</span></div>` +
      results.map(r => paramCard(r[0], r[1], r[2])).join('') +
      (issues > 1 ? `<div class="note" style="margin-top:4px">Order of operations: correct alkalinity first, then pH, then everything else. Retest between each adjustment.</div>` : '');

    box.scrollIntoView({behavior:'smooth', block:'start'});
  });

  document.getElementById('clear').addEventListener('click', () => {
    ['fc','ph','ta','cya','ch','salt'].forEach(id => document.getElementById(id).value = '');
    const box = document.getElementById('results');
    box.style.display = 'none';
    box.innerHTML = '';
  });
})();
