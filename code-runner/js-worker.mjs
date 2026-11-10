// Runs one JavaScript program for Code ausführen. The page starts a fresh worker for every run and
// terminates it on "Stop" – so endless loops cannot freeze the app and no state leaks between runs.
// From the page:  { type: 'run', code, stdin }
// To the page:    { type: 'out', parts: [{ s: 'out' | 'err' | 'in', text }] }, { type: 'truncated' }, { type: 'clear' },
//                 { type: 'done', ok, result?, error?: { text, line? }, ms }
// The program is finished when its code has run, its promise has settled and no timer is waiting.
import { lockdown, outputChannel } from './guard.mjs';

const post = lockdown();
const out = outputChannel(post);
const real = { setTimeout: self.setTimeout.bind(self), clearTimeout: self.clearTimeout.bind(self),
  setInterval: self.setInterval.bind(self), clearInterval: self.clearInterval.bind(self), now: () => performance.now() };

/* ---------- Values as text (like a browser console, but plain text) ---------- */
function inspect(v, depth = 0, seen = new Set()) {
  if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
  if (typeof v === 'bigint') return v + 'n';
  if (typeof v === 'symbol') return v.toString();
  if (typeof v === 'function') return /^class\s/.test(Function.prototype.toString.call(v)) ? `[class ${v.name || '(anonymous)'}]` : `[Function: ${v.name || '(anonymous)'}]`;
  if (v === null || typeof v !== 'object') return Object.is(v, -0) ? '-0' : String(v);
  if (v instanceof Error) return errorText(v);
  if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString();
  if (v instanceof RegExp) return String(v);
  if (seen.has(v)) return '[Circular]';
  if (v instanceof Promise) return 'Promise {}';
  if (depth > 3) return Array.isArray(v) ? '[Array]' : '[Object]';
  seen.add(v);
  try {
    const list = (items, max = 100) => {
      const arr = [];
      let n = 0;
      for (const x of items) { if (n++ < max) arr.push(x); }
      return arr.join(', ') + (n > max ? `, … ${n - max} more` : '');
    };
    const each = it => (function* () { for (const x of it) yield inspect(x, depth + 1, seen); })();
    if (Array.isArray(v)) return `[${list(each(v))}]`;
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return `${v.constructor.name}(${v.length}) [${list(each(v))}]`;
    if (v instanceof Map) return `Map(${v.size}) {${list((function* () { for (const [k, x] of v) yield `${inspect(k, depth + 1, seen)} => ${inspect(x, depth + 1, seen)}`; })())}}`;
    if (v instanceof Set) return `Set(${v.size}) {${list(each(v))}}`;
    const name = v.constructor && v.constructor.name;
    const body = list((function* () {
      for (const k of Reflect.ownKeys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d.enumerable) continue;
        const key = typeof k === 'symbol' ? `[${k.toString()}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        yield `${key}: ${'value' in d ? inspect(d.value, depth + 1, seen) : '[Getter]'}`;
      }
    })());
    return `${name && name !== 'Object' ? name + ' ' : ''}{${body ? ` ${body} ` : ''}}`;
  } catch (e) { return '[Object]'; }
  finally { seen.delete(v); }
}
function errorText(e) {
  const name = (e && e.name) || 'Error';
  const msg = e && e.message != null ? String(e.message) : '';
  let text = msg ? `${name}: ${msg}` : name;
  if (e && e.cause !== undefined) text += `\n  [cause]: ${inspect(e.cause, 1)}`;
  return text;
}
// Line of the user's program where an error happened (the program is named script.js via sourceURL)
function errorLine(e) {
  if (!e || typeof e !== 'object') return null;
  const m = /script\.js:(\d+)(?::\d+)?/.exec(String(e.stack || ''));
  if (m) return Number(m[1]);
  if (e instanceof SyntaxError && Number.isInteger(e.lineNumber)) return e.lineNumber;   // Firefox
  if (e instanceof SyntaxError && Number.isInteger(e.line)) return e.line;               // Safari
  return null;
}
const fmt = args => args.map(a => inspect(a)).join(' ') + '\n';

/* ---------- console ---------- */
const counts = new Map(), timers = new Map();
let indent = '';
const line = (s, args) => out.write(s, indent ? fmt(args).replace(/^(?=.)/gm, indent) : fmt(args));
const con = {
  log: (...a) => line('out', a), info: (...a) => line('out', a), debug: (...a) => line('out', a), dir: v => line('out', [inspect(v, 1)]),
  warn: (...a) => line('err', a), error: (...a) => line('err', a),
  trace: (...a) => line('err', ['Trace:', ...a]),
  assert: (ok, ...a) => { if (!ok) line('err', ['Assertion failed' + (a.length ? ':' : ''), ...a]); },
  table: v => line('out', [inspect(v, 1)]),
  clear: () => { out.flush(); post({ type: 'clear' }); },
  count: (label = 'default') => { const n = (counts.get(label) || 0) + 1; counts.set(label, n); line('out', [`${label}: ${n}`]); },
  countReset: (label = 'default') => { counts.delete(label); },
  time: (label = 'default') => { timers.set(label, real.now()); },
  timeEnd: (label = 'default') => { if (timers.has(label)) { line('out', [`${label}: ${(real.now() - timers.get(label)).toFixed(1)} ms`]); timers.delete(label); } },
  timeLog: (label = 'default', ...a) => { if (timers.has(label)) line('out', [`${label}: ${(real.now() - timers.get(label)).toFixed(1)} ms`, ...a]); },
  group: (...a) => { if (a.length) line('out', a); indent += '  '; }, groupCollapsed: (...a) => { if (a.length) line('out', a); indent += '  '; },
  groupEnd: () => { indent = indent.slice(2); },
};
Object.defineProperty(self, 'console', { value: con, writable: true, configurable: true });

/* ---------- Input: prompt() and readline() read the lines of the "Input" field ---------- */
let stdin = [];
function readline() {
  if (!stdin.length) return null;
  const l = stdin.shift();
  out.write('in', l + '\n');
  return l;
}
self.readline = readline;
self.prompt = (message = '') => { if (message !== '') out.write('out', String(message) + ' '); return readline(); };
self.alert = (message = '') => line('out', [String(message)]);

/* ---------- Timers: the program is done when none is waiting ---------- */
const waiting = new Set();
let mainDone = false, finished = false, started = 0, ok = true, result, firstError = null;
function finish() {
  if (finished) return;
  finished = true;
  out.flush();
  post({ type: 'done', ok, result, error: firstError, ms: Math.round(real.now() - started) });
}
const check = () => real.setTimeout(() => { if (mainDone && !waiting.size) finish(); }, 0);
function fail(e) {
  ok = false;
  const err = { text: e instanceof Error || (e && typeof e === 'object' && 'message' in e) ? errorText(e) : 'Uncaught ' + inspect(e, 1), line: errorLine(e) };
  if (!firstError) firstError = err;
  post({ type: 'error', error: err });
}
const guard = (fn, args, after) => function () {
  try { if (typeof fn === 'function') fn.apply(self, args); else (0, eval)(String(fn)); }
  catch (e) { out.flush(); fail(e); }
  finally { if (after) after(); check(); }
};
self.setTimeout = (fn, ms, ...args) => { const id = real.setTimeout(guard(fn, args, () => waiting.delete(id)), ms); waiting.add(id); return id; };
self.setInterval = (fn, ms, ...args) => { const id = real.setInterval(guard(fn, args), ms); waiting.add(id); return id; };
self.clearTimeout = self.clearInterval = id => { real.clearTimeout(id); real.clearInterval(id); waiting.delete(id); check(); };
self.addEventListener('error', e => { e.preventDefault(); out.flush(); fail(e.error || new Error(e.message)); check(); });
self.addEventListener('unhandledrejection', e => { e.preventDefault(); out.flush(); fail(e.reason); check(); });

/* ---------- Run ---------- */
const AsyncFunction = (async () => {}).constructor;
// Plain script if it parses as one (then the value of the last expression is shown, like in a console);
// with a top-level `await` or `return` it runs as the body of an async function.
function asyncBody(code) {
  try { new Function(code); return topLevelReturn(code); }
  catch (e) {
    try { new AsyncFunction(code); return true; } catch (e2) { return false; }
  }
}
// Rough check, good enough to choose the mode: a `return` that is not inside any braces
function topLevelReturn(code) {
  let depth = 0;
  const src = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""');
  const re = /[{}]|\breturn\b/g;
  for (let m; (m = re.exec(src));) {
    if (m[0] === '{') depth++; else if (m[0] === '}') depth--; else if (depth === 0) return true;
  }
  return false;
}

self.onmessage = async e => {
  const msg = e.data;
  if (!msg || msg.type !== 'run' || started) return;
  started = real.now();
  stdin = msg.stdin ? String(msg.stdin).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
  const code = String(msg.code);
  try {
    let value;
    if (asyncBody(code)) value = await (0, eval)(`(async()=>{${code}\n})()\n//# sourceURL=script.js`);
    else {
      value = (0, eval)(`${code}\n//# sourceURL=script.js`);
      if (value && typeof value.then === 'function') value = await value;
    }
    if (value !== undefined) result = inspect(value, 1);
  } catch (err) { out.flush(); fail(err); }
  mainDone = true;
  check();
};
post({ type: 'ready' });
