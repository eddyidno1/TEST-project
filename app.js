/* ===========================================================
   Lumen — Luxury Calculator
   =========================================================== */

(() => {
  'use strict';

  // ============ State ============
  const state = {
    expression: '',
    result: '0',
    justEvaluated: false,
    mode: 'basic', // 'basic' | 'scientific' | 'convert'
    history: loadHistory(),
    historyOpen: true,
  };

  // ============ Elements ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const exprEl = $('#expression');
  const resultEl = $('#result');
  const keysEl = $('#keys');
  const calcCard = $('.calculator');
  const convCard = $('.converter');
  const historyEl = $('#historyPanel');
  const historyListEl = $('#historyList');
  const workspace = $('.workspace');
  const modeBtns = $$('.mode-btn');
  const modeIndicator = $('.mode-indicator');
  const historyToggle = $('.history-toggle');
  const clearHistoryBtn = $('#clearHistory');
  const fab = $('#fab');
  const toast = $('#toast');

  // ============ Math engine ============
  // Operator precedence/eval via shunting-yard + RPN.
  const OPS = {
    '+': { p: 1, a: 'L', fn: (a, b) => a + b },
    '-': { p: 1, a: 'L', fn: (a, b) => a - b },
    '*': { p: 2, a: 'L', fn: (a, b) => a * b },
    '/': { p: 2, a: 'L', fn: (a, b) => b === 0 ? NaN : a / b },
    '^': { p: 4, a: 'R', fn: (a, b) => Math.pow(a, b) },
    'u-': { p: 3, a: 'R', unary: true, fn: (a) => -a },
  };
  const FNS = {
    sin: (x) => Math.sin(x),
    cos: (x) => Math.cos(x),
    tan: (x) => Math.tan(x),
    asin: (x) => Math.asin(x),
    acos: (x) => Math.acos(x),
    atan: (x) => Math.atan(x),
    sqrt: (x) => x < 0 ? NaN : Math.sqrt(x),
    ln: (x) => x <= 0 ? NaN : Math.log(x),
    log: (x) => x <= 0 ? NaN : Math.log10(x),
    fact: (x) => {
      if (x < 0 || !Number.isInteger(x) || x > 170) return NaN;
      let r = 1; for (let i = 2; i <= x; i++) r *= i; return r;
    },
  };
  const CONSTS = { 'π': Math.PI, 'e': Math.E };

  function tokenize(expr) {
    // Normalize unicode operators
    expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (c === ' ') { i++; continue; }
      // number
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
        tokens.push({ type: 'num', value: parseFloat(expr.slice(i, j)) });
        i = j; continue;
      }
      // constants
      if (c === 'π' || c === 'e') {
        // only treat 'e' as constant if not part of a function name
        if (c === 'e') {
          // crude check: not followed by alpha (e.g. ln, log handled below)
        }
        tokens.push({ type: 'num', value: CONSTS[c] });
        i++; continue;
      }
      // function name (letters)
      if (/[a-z]/i.test(c)) {
        let j = i;
        while (j < expr.length && /[a-z0-9]/i.test(expr[j])) j++;
        const name = expr.slice(i, j);
        if (FNS[name]) tokens.push({ type: 'fn', value: name });
        else throw new Error('Unknown function: ' + name);
        i = j; continue;
      }
      if (c === '(' || c === ')') {
        tokens.push({ type: c });
        i++; continue;
      }
      if ('+-*/^'.includes(c)) {
        // detect unary minus
        const prev = tokens[tokens.length - 1];
        if (c === '-' && (!prev || prev.type === 'op' || prev.type === '(' || prev.type === 'fn')) {
          tokens.push({ type: 'op', value: 'u-' });
        } else {
          tokens.push({ type: 'op', value: c });
        }
        i++; continue;
      }
      throw new Error('Unexpected char: ' + c);
    }
    return tokens;
  }

  function toRPN(tokens) {
    const out = [], stack = [];
    for (const t of tokens) {
      if (t.type === 'num') out.push(t);
      else if (t.type === 'fn') stack.push(t);
      else if (t.type === 'op') {
        const o1 = OPS[t.value];
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type === 'fn') { out.push(stack.pop()); continue; }
          if (top.type === 'op') {
            const o2 = OPS[top.value];
            if ((o1.a === 'L' && o1.p <= o2.p) || (o1.a === 'R' && o1.p < o2.p)) {
              out.push(stack.pop()); continue;
            }
          }
          break;
        }
        stack.push(t);
      } else if (t.type === '(') stack.push(t);
      else if (t.type === ')') {
        while (stack.length && stack[stack.length - 1].type !== '(') out.push(stack.pop());
        if (!stack.length) throw new Error('Mismatched )');
        stack.pop();
        if (stack.length && stack[stack.length - 1].type === 'fn') out.push(stack.pop());
      }
    }
    while (stack.length) {
      const t = stack.pop();
      if (t.type === '(' || t.type === ')') throw new Error('Mismatched parens');
      out.push(t);
    }
    return out;
  }

  function evalRPN(rpn) {
    const stack = [];
    for (const t of rpn) {
      if (t.type === 'num') stack.push(t.value);
      else if (t.type === 'op') {
        const op = OPS[t.value];
        if (op.unary) {
          const a = stack.pop();
          stack.push(op.fn(a));
        } else {
          const b = stack.pop(), a = stack.pop();
          stack.push(op.fn(a, b));
        }
      } else if (t.type === 'fn') {
        const a = stack.pop();
        stack.push(FNS[t.value](a));
      }
    }
    if (stack.length !== 1) throw new Error('Invalid expression');
    return stack[0];
  }

  function evaluate(expr) {
    if (!expr.trim()) return 0;
    const v = evalRPN(toRPN(tokenize(expr)));
    if (!Number.isFinite(v)) throw new Error('Math error');
    return v;
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return 'Error';
    if (Math.abs(n) >= 1e15 || (n !== 0 && Math.abs(n) < 1e-9)) {
      return n.toExponential(6);
    }
    // strip trailing zeros, but keep readable
    const s = parseFloat(n.toPrecision(12)).toString();
    // add thousands separators to integer part if no exponent
    if (!s.includes('e') && !s.includes('E')) {
      const [intPart, decPart] = s.split('.');
      const sign = intPart.startsWith('-') ? '-' : '';
      const abs = sign ? intPart.slice(1) : intPart;
      const withSep = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return decPart != null ? `${sign}${withSep}.${decPart}` : `${sign}${withSep}`;
    }
    return s;
  }

  function displayExpr(expr) {
    return expr
      .replace(/\*/g, '×')
      .replace(/\//g, '÷')
      .replace(/(?<![a-z])-/g, '−'); // unary/binary minus prettify
  }

  // ============ Render ============
  function render() {
    exprEl.textContent = displayExpr(state.expression);
    resultEl.textContent = state.result;
  }

  function pop() {
    resultEl.classList.remove('pop');
    void resultEl.offsetWidth;
    resultEl.classList.add('pop');
  }

  // ============ Actions ============
  function input(action, payload) {
    if (state.result === 'Error') {
      state.expression = ''; state.result = '0'; resultEl.classList.remove('error');
    }

    switch (action) {
      case 'num': {
        if (state.justEvaluated) { state.expression = ''; state.justEvaluated = false; }
        state.expression += payload;
        liveEval();
        break;
      }
      case 'dot': {
        if (state.justEvaluated) { state.expression = '0'; state.justEvaluated = false; }
        // prevent multiple dots in current number segment
        const tail = state.expression.split(/[^0-9.]/).pop();
        if (!tail.includes('.')) {
          state.expression += tail === '' ? '0.' : '.';
        }
        liveEval();
        break;
      }
      case 'op': {
        state.justEvaluated = false;
        if (state.expression === '' && payload !== '-') {
          // allow leading negative; otherwise seed with result
          state.expression = state.result.replace(/,/g, '');
        }
        // replace trailing operator
        if (/[+\-*/^]$/.test(state.expression)) {
          state.expression = state.expression.slice(0, -1);
        }
        state.expression += payload;
        break;
      }
      case 'paren': {
        if (state.justEvaluated) { state.expression = ''; state.justEvaluated = false; }
        state.expression += payload;
        liveEval();
        break;
      }
      case 'fn': {
        if (state.justEvaluated) { state.expression = ''; state.justEvaluated = false; }
        state.expression += payload + '(';
        break;
      }
      case 'const': {
        if (state.justEvaluated) { state.expression = ''; state.justEvaluated = false; }
        state.expression += payload;
        liveEval();
        break;
      }
      case 'clear': {
        state.expression = ''; state.result = '0'; state.justEvaluated = false;
        resultEl.classList.remove('error');
        break;
      }
      case 'sign': {
        // toggle sign of current number or whole result
        if (state.expression === '' || state.justEvaluated) {
          const cur = parseFloat(state.result.replace(/,/g, ''));
          if (!isNaN(cur)) {
            state.expression = String(-cur);
            state.result = formatNumber(-cur);
            state.justEvaluated = true;
          }
        } else {
          const m = state.expression.match(/(-?\d*\.?\d+)$/);
          if (m) {
            const num = m[1];
            const start = state.expression.length - num.length;
            const flipped = num.startsWith('-') ? num.slice(1) : '-' + num;
            state.expression = state.expression.slice(0, start) + flipped;
            liveEval();
          }
        }
        break;
      }
      case 'percent': {
        try {
          const v = evaluate(state.expression || state.result.replace(/,/g, '')) / 100;
          state.expression = String(v);
          state.result = formatNumber(v);
          state.justEvaluated = true;
        } catch {}
        break;
      }
      case 'equals': {
        try {
          // auto-close unmatched parens
          let expr = state.expression;
          const opens = (expr.match(/\(/g) || []).length;
          const closes = (expr.match(/\)/g) || []).length;
          if (opens > closes) expr += ')'.repeat(opens - closes);
          if (!expr) return;
          const v = evaluate(expr);
          const formatted = formatNumber(v);
          pushHistory(displayExpr(expr), formatted);
          state.result = formatted;
          state.expression = String(v);
          state.justEvaluated = true;
          pop();
        } catch (e) {
          state.result = 'Error';
          resultEl.classList.add('error');
          state.justEvaluated = true;
        }
        break;
      }
    }
    render();
  }

  function liveEval() {
    try {
      let expr = state.expression;
      if (!expr) { state.result = '0'; return; }
      const opens = (expr.match(/\(/g) || []).length;
      const closes = (expr.match(/\)/g) || []).length;
      if (opens > closes) expr += ')'.repeat(opens - closes);
      // don't preview if ends with operator/fn-open
      if (/[+\-*/^(]$/.test(expr)) return;
      const v = evaluate(expr);
      state.result = formatNumber(v);
    } catch { /* mid-typing — keep last result */ }
  }

  // ============ History ============
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem('lumen.history') || '[]'); }
    catch { return []; }
  }
  function saveHistory() {
    try { localStorage.setItem('lumen.history', JSON.stringify(state.history.slice(0, 50))); } catch {}
  }
  function pushHistory(expr, result) {
    state.history.unshift({ expr, result, ts: Date.now() });
    state.history = state.history.slice(0, 50);
    saveHistory();
    renderHistory();
  }
  function renderHistory() {
    historyListEl.innerHTML = '';
    if (!state.history.length) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'No calculations yet';
      historyListEl.appendChild(li);
      return;
    }
    for (const h of state.history) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `<span class="hi-expr">${escapeHtml(h.expr)} =</span><span class="hi-res">${escapeHtml(h.result)}</span>`;
      li.addEventListener('click', () => {
        state.expression = h.result.replace(/,/g, '');
        state.result = h.result;
        state.justEvaluated = true;
        render();
        showToast('Loaded from history');
      });
      historyListEl.appendChild(li);
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ============ Mode switch ============
  function setMode(mode) {
    state.mode = mode;
    const isConvert = mode === 'convert';
    calcCard.classList.toggle('hidden', isConvert);
    convCard.classList.toggle('hidden', !isConvert);
    calcCard.dataset.mode = mode === 'scientific' ? 'scientific' : 'basic';

    modeBtns.forEach((b, idx) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      if (active) {
        const rect = b.getBoundingClientRect();
        const parentRect = b.parentElement.getBoundingClientRect();
        modeIndicator.style.width = rect.width + 'px';
        modeIndicator.style.transform = `translateX(${rect.left - parentRect.left - 4}px)`;
      }
    });
  }

  // ============ Button feedback (ripple + haptic) ============
  function attachRipple(btn, ev) {
    const rect = btn.getBoundingClientRect();
    const x = (ev.clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (ev.clientY ?? rect.top + rect.height / 2) - rect.top;
    const size = Math.max(rect.width, rect.height);
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.width = r.style.height = size + 'px';
    r.style.left = (x - size / 2) + 'px';
    r.style.top = (y - size / 2) + 'px';
    btn.appendChild(r);
    btn.style.setProperty('--rx', (x / rect.width * 100) + '%');
    btn.style.setProperty('--ry', (y / rect.height * 100) + '%');
    setTimeout(() => r.remove(), 600);
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // ============ Key bindings ============
  keysEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.key');
    if (!btn) return;
    attachRipple(btn, ev);
    const a = btn.dataset.action;
    if (a === 'num') input('num', btn.dataset.num);
    else if (a === 'op') input('op', btn.dataset.op);
    else if (a === 'fn') input('fn', btn.dataset.fn);
    else if (a === 'const') input('const', btn.dataset.const);
    else if (a === 'paren') input('paren', btn.dataset.paren);
    else input(a);
  });

  document.addEventListener('keydown', (e) => {
    if (state.mode === 'convert') return;
    const k = e.key;
    let matched = true;
    if (/^[0-9]$/.test(k)) input('num', k);
    else if (k === '.') input('dot');
    else if (k === '+' || k === '-' || k === '*' || k === '/') input('op', k);
    else if (k === '^') input('op', '^');
    else if (k === '(' || k === ')') input('paren', k);
    else if (k === 'Enter' || k === '=') { e.preventDefault(); input('equals'); }
    else if (k === 'Backspace') {
      if (state.justEvaluated) { input('clear'); }
      else { state.expression = state.expression.slice(0, -1); liveEval(); render(); }
    }
    else if (k === 'Escape') input('clear');
    else if (k === '%') input('percent');
    else matched = false;

    if (matched) {
      // flash matching button if any
      const map = {
        '+': '[data-op="+"]', '-': '[data-op="-"]', '*': '[data-op="*"]', '/': '[data-op="/"]',
        '(': '[data-paren="("]', ')': '[data-paren=")"]',
        'Enter': '[data-action="equals"]', '=': '[data-action="equals"]',
        'Escape': '[data-action="clear"]', 'Backspace': null,
        '.': '[data-action="dot"]', '%': '[data-action="percent"]',
      };
      const sel = /^[0-9]$/.test(k) ? `[data-num="${k}"]` : map[k];
      if (sel) {
        const btn = document.querySelector('.key' + sel);
        if (btn) {
          btn.classList.add('pressed');
          attachRipple(btn, { clientX: undefined, clientY: undefined });
          setTimeout(() => btn.classList.remove('pressed'), 140);
        }
      }
    }
  });

  // ============ Mode tabs ============
  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ============ History toggle ============
  historyToggle.addEventListener('click', () => {
    state.historyOpen = !state.historyOpen;
    historyEl.classList.toggle('collapsed', !state.historyOpen);
    workspace.classList.toggle('no-history', !state.historyOpen);
  });
  clearHistoryBtn.addEventListener('click', () => {
    state.history = [];
    saveHistory();
    renderHistory();
    showToast('History cleared');
  });

  // ============ FAB: copy result ============
  fab.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.result.replace(/,/g, ''));
      showToast('Copied to clipboard');
    } catch {
      showToast('Copy failed');
    }
  });

  // ============ Toast ============
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ============ Converter ============
  const CONV_DATA = {
    currency: {
      label: 'USD-based reference rates',
      base: 'USD',
      // approximate static rates (1 USD = X)
      units: {
        USD: 1, EUR: 0.92, GBP: 0.78, JPY: 156.4, CNY: 7.24, INR: 83.5,
        CAD: 1.37, AUD: 1.52, CHF: 0.89, HKD: 7.81, SGD: 1.35, KRW: 1370,
        BRL: 5.05, MXN: 17.1, SEK: 10.6, NOK: 10.7, ZAR: 18.4, NZD: 1.65,
      },
    },
    length: {
      label: 'Meter-based',
      base: 'm',
      units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
    },
    weight: {
      label: 'Gram-based',
      base: 'g',
      units: { mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592, ton: 1_000_000 },
    },
    temp: {
      label: 'Temperature',
      base: 'C',
      units: { C: 'C', F: 'F', K: 'K' },
      special: true,
    },
  };

  const convFrom = $('#convFrom'), convTo = $('#convTo');
  const fromUnit = $('#convFromUnit'), toUnit = $('#convToUnit');
  const convNote = $('#convNote');
  let currentCat = 'currency';

  function populateUnits(cat) {
    const data = CONV_DATA[cat];
    fromUnit.innerHTML = ''; toUnit.innerHTML = '';
    Object.keys(data.units).forEach((u, i) => {
      fromUnit.add(new Option(u, u));
      toUnit.add(new Option(u, u));
    });
    const keys = Object.keys(data.units);
    fromUnit.value = keys[0];
    toUnit.value = keys[1] ?? keys[0];
    convNote.textContent = data.label;
  }

  function convert() {
    const cat = currentCat;
    const data = CONV_DATA[cat];
    const v = parseFloat(convFrom.value);
    if (isNaN(v)) { convTo.value = ''; return; }
    let out;
    if (data.special) {
      out = convertTemp(v, fromUnit.value, toUnit.value);
    } else {
      const base = v * data.units[fromUnit.value];
      out = base / data.units[toUnit.value];
    }
    convTo.value = formatNumber(out).replace(/,/g, '');
  }
  function convertTemp(v, from, to) {
    let c;
    if (from === 'C') c = v;
    else if (from === 'F') c = (v - 32) * 5 / 9;
    else c = v - 273.15;
    if (to === 'C') return c;
    if (to === 'F') return c * 9 / 5 + 32;
    return c + 273.15;
  }

  $$('.conv-tab').forEach(t => t.addEventListener('click', () => {
    $$('.conv-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    currentCat = t.dataset.cat;
    populateUnits(currentCat);
    convert();
  }));
  [convFrom, fromUnit, toUnit].forEach(el => el.addEventListener('input', convert));
  $('#convSwap').addEventListener('click', () => {
    const a = fromUnit.value; fromUnit.value = toUnit.value; toUnit.value = a;
    convert();
  });

  // ============ Init ============
  populateUnits('currency');
  convert();
  renderHistory();
  render();
  // initialize indicator after layout
  requestAnimationFrame(() => setMode('basic'));
  window.addEventListener('resize', () => setMode(state.mode));
})();
