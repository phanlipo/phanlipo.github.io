// Python for Code ausführen: Pyodide (CPython as WebAssembly) in a worker. The page keeps this worker
// between runs (loading takes a few seconds) and terminates it on "Stop".
// From the page:  { type: 'run', code, stdin }
// To the page:    { type: 'ready', version } or { type: 'loaderror', message } once,
//                 { type: 'out', parts: [{ s: 'out' | 'err' | 'in', text }] }, { type: 'truncated' },
//                 { type: 'done', ok, result?, error?: { text, line? }, ms }
// Every run gets fresh variables (its own globals); imported modules stay loaded.
import { lockdown, outputChannel } from './guard.mjs';
import { loadPyodide } from '../assets/vendor/pyodide/pyodide.mjs';

// The engine loads its own files (WebAssembly, standard library) with fetch – nothing else gets through
const post = lockdown({ allow: new URL('../assets/vendor/pyodide/', self.location.href).href });
const out = outputChannel(post);

const SETUP = `
import sys, json, traceback
from pyodide.code import eval_code_async

async def __run(code):
    g = {'__name__': '__main__'}
    res = {'ok': True}
    try:
        value = await eval_code_async(code, globals=g, filename='main.py')
        if value is not None:
            res['result'] = repr(value)
    except SystemExit as e:
        if e.code not in (None, 0):
            res['ok'] = False
            res['error'] = {'text': 'SystemExit: ' + str(e.code)}
    except BaseException as e:
        tb = e.__traceback__
        while tb is not None and tb.tb_frame.f_code.co_filename != 'main.py':
            tb = tb.tb_next
        line = None
        if isinstance(e, SyntaxError) and e.filename == 'main.py':
            line = e.lineno
        else:
            last = tb
            while last is not None:
                if last.tb_frame.f_code.co_filename == 'main.py':
                    line = last.tb_lineno
                last = last.tb_next
        res['ok'] = False
        res['error'] = {'text': ''.join(traceback.format_exception(type(e), e, tb)).rstrip(), 'line': line}
    finally:
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
    return json.dumps(res)
`;

let pyodide = null, run = null, busy = false;
const decoder = { out: new TextDecoder(), err: new TextDecoder() };
const writer = s => ({ write: buf => { out.write(s, decoder[s].decode(buf, { stream: true })); return buf.length; } });

const ready = (async () => {
  try {
    pyodide = await loadPyodide({ indexURL: '../assets/vendor/pyodide/' });
    pyodide.setStdout(writer('out'));
    pyodide.setStderr(writer('err'));
    const ns = pyodide.toPy({});
    pyodide.runPython(SETUP, { globals: ns });
    run = ns.get('__run');
    post({ type: 'ready', version: pyodide.runPython('import sys; sys.version.split()[0]') });
    return true;
  } catch (e) {
    post({ type: 'loaderror', message: String((e && e.message) || e).slice(0, 300) });
    return false;
  }
})();

self.onmessage = async e => {
  const msg = e.data;
  if (!msg || msg.type !== 'run' || busy) return;
  busy = true;
  if (!(await ready)) return;
  const lines = msg.stdin ? String(msg.stdin).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
  // input() reads the next line of the "Input" field; at its end Python raises EOFError
  pyodide.setStdin({ stdin: () => { if (!lines.length) return undefined; const l = lines.shift(); out.write('in', l + '\n'); return l; } });
  out.reset();
  const t0 = performance.now();
  let res;
  try { res = JSON.parse(await run(String(msg.code))); }
  catch (err) { res = { ok: false, error: { text: String((err && err.message) || err) } }; }
  out.flush();
  busy = false;
  post({ type: 'done', ok: res.ok, result: res.result, error: res.error, ms: Math.round(performance.now() - t0) });
};
