# Code ausführen – Aufbau

Python (Pyodide = CPython als WebAssembly, `assets/vendor/pyodide`, ca. 13 MB, `precache: false`) und JavaScript, jeweils in einem Worker im App-Ordner: `py-worker.mjs` bleibt zwischen den Läufen, `js-worker.mjs` startet je Lauf neu; *Stopp* beendet den Worker (Python lädt beim nächsten Lauf neu, aus dem Cache).

- **`guard.mjs`** entfernt im Worker vor dem ersten Nutzer-Code Netzwerk (`fetch` nur noch für die eigenen Pyodide-Dateien, `XMLHttpRequest`, `WebSocket` …) und den gemeinsamen Speicher der Domain (`caches`, `indexedDB`).
- **`eval` nur im Worker:** Die CSP der Seite bleibt streng (kein `'unsafe-eval'`); Worker haben eine eigene CSP (auf GitHub Pages keine). Bekannte Lücke: `import('https://…')` lässt sich im Worker nicht abschalten – der Code kommt damit aber an keine Daten der Seite. Steht in der Hilfe („keine vollständige Sandbox“).
- **Eingaben** (`input()`) werden vorab im Menü eingetragen, eine Zeile je Aufruf.
- **Weitere Sprachen** (z. B. Lua mit `wasmoon`, SQL mit `sql.js`, Ruby mit `ruby.wasm`): je Sprache ein Worker mit demselben Nachrichten-Vertrag (`run` → `out`/`done`, siehe Kopf von `js-worker.mjs`) und ein Eintrag in `LANGS` in `app.js`.

Verworfene und zurückgestellte Wege (Bash, `<iframe sandbox>`, `input()` mittendrin, Python-Pakete): `IDEAS.md`.
