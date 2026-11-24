# Code-Editor

Textdateien aller Art ansehen und bearbeiten, mit Syntax-Hervorhebung (highlight.js). Tests: `tests/code-editor.spec.mjs`, WebMCP in `tests/webmcp.spec.mjs`.

## Aufbau

- `text-files.js` (`window.TextFiles`, ohne DOM): Kodierung lesen/schreiben (`decode`/`encode`: UTF-8 mit/ohne BOM, UTF-16 LE/BE mit BOM, Windows-1252; Zeilenenden LF/CRLF/CR), Erkennen von Binärdateien (Null-Bytes wie git, oder > 10 % Steuerzeichen), Sprachenliste `LANGS` mit Endungen und Dateinamen, `detect(name, text)` (Name → Endung → Shebang/`<?xml`), `indentUnit(text)`.
- `index.html`: Oberfläche. Der Editor ist ein `<textarea>` mit durchsichtiger Schrift über einem `<pre>` mit der eingefärbten Kopie. Beide haben exakt dieselbe Schrift, Abstände und Umbruchregeln und liegen in **einer** Scroll-Box (`#scroller`); das Textfeld ist so groß wie der Text und scrollt nie selbst (geprüft im Test „lies exactly under the textarea“). Deshalb nimmt es nicht den Standardstil von `base.css`.
- Zeilennummern: die eingefärbte Kopie besteht aus einem Block je Zeile (`.ln`, `toLines` schließt Spans am Zeilenende und öffnet sie in der nächsten Zeile wieder); die Nummer setzt ein CSS-Zähler davor, in den linken Innenabstand (`--gw`) von Kopie und Textfeld. So bleibt sie auch bei umgebrochenen Zeilen an der richtigen Stelle.
- Eingefärbt wird bei jeder Eingabe synchron bis 100 000 Zeichen; darüber beim Bearbeiten nur Text, beim Ansehen bis 1 000 000 Zeichen. Dateien bis 2 MB (Speicher im Browser).
- Sprachen: die gängigen stecken in `highlight.min.js`, die übrigen (`src` in `LANGS`, Pfade wörtlich für den Offline-Cache) lädt `ensureLang` bei Bedarf als Skript nach. Unbekannte Dateien rät `guessLang` (JSON zuerst, dann `hljs.highlightAuto` über die eingebauten Sprachen, Relevanz ≥ 6, sonst Text); das Ergebnis wird je Datei gemerkt (`guess`).
- Suchen: Treffer werden über `Range.getClientRects()` auf der eingefärbten Kopie als Kästchen (`#hits`) gezeichnet – so sind sie auch sichtbar, solange der Fokus im Suchfeld liegt. Dieselbe Rechnung scrollt zu Treffern und Zeilen.
- Speichern in die geöffnete Datei (File System Access API) wie im Markdown-Editor, mit Kodierung und Zeilenenden der Datei.

## Speicher

- `code-editor.files.v1`: Dateien `{id, name, text, lang ('auto' | id), encoding, eol, indent, guess, created, modified}`; Text immer mit `\n`.
- `code-editor.state.v1`: geöffnete Datei und Modus (`view`/`edit`).
- `code-editor.settings.v1`: Zeilennummern, Umbruch, Schriftgröße, Tabulatorbreite.

## Icons

Werkzeugleiste: Suchen `search`, Zeile `list-numbers`, Umbruch `text-wrap`, Sprache (Programmiersprache, nicht die Oberflächensprache) `code`, Einrücken/Ausrücken `indent-increase`/`indent-decrease`, JSON formatieren `braces`. Menü-Liste der Dateien `files`.
