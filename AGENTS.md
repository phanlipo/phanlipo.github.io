# AGENTS.md

Hinweise für alle, die an diesem Repository arbeiten – Menschen wie KI-Agenten.

## Projekt

Statische Web-Tools auf GitHub Pages (https://phanlipo.github.io/). Kein Server; die veröffentlichten Seiten brauchen keine Pakete (`package.json` gibt es nur für die Tests). Jede Seite ist eine einzelne `index.html` in einem eigenen Ordner, wird hauptsächlich **auf dem Handy** benutzt und ist als **PWA** installierbar und offline nutzbar.

```
index.html            Startseite – die Kartenliste ist generiert
assets/base.css       Design-Tokens, Dark Mode, Karten, Buttons, Toast, Hilfe-Bereich
assets/common.js      window.Tools: $, load, save, remove, toast, esc, copyText, fmt, parseNum, takeSharedFile, takeSharedText, i18n, t, lang, setLang, locale, onLang, mcp; registriert den Service Worker
assets/vendor/        Fremdbibliotheken mit LICENSE + SOURCE.md je Ordner (generiert, nicht von Hand ändern)
template/             Vorlage für neue Seiten (wird nicht gelistet)
scripts/build.mjs     erzeugt Seitenliste, Fußzeile (inkl. Version), <head>-Block (noindex, CSP, Icons, Manifest), manifest.webmanifest + sw.js je App
scripts/build-icons.mjs  erzeugt icon.svg und PNG-Icons (180/192/512/maskable) je Seite (Tabler Icons)
scripts/vendor.mjs    lädt Bibliotheken aus scripts/vendor.json nach assets/vendor/, prüft auf Updates
scripts/partials/footer.html  Text der gemeinsamen Fußzeile
scripts/partials/data.html    Bereich „Daten sichern & übertragen“ (in jede App eingesetzt)
tests/                Playwright-Tests (siehe tests/README.md)
<tool-name>/          index.html + generiert: manifest.webmanifest, sw.js, icon-*
.githooks/pre-commit  ruft build.mjs vor jedem Commit auf
.claude/hooks/session-start.sh  richtet Cloud-Sessions von Claude Code ein (Git-Hook, npm install, Browser für Playwright)
.github/workflows/build.yml         dasselbe bei jedem Push auf GitHub
.github/workflows/vendor-check.yml  prüft monatlich auf Bibliotheks-Updates und öffnet ein Issue
.github/workflows/test.yml          führt die Tests bei jedem PR und Push auf main aus
.github/dependabot.yml              wöchentliche Update-PRs für GitHub Actions und Test-Werkzeuge
NOTICE.md             Hinweise zu Fremdsoftware (Lizenzen der Bibliotheken) – generiert von build.mjs, verlinkt in der Fußzeile
robots.txt            erlaubt Crawlen – damit Suchmaschinen das noindex jeder Seite sehen
```

## Neue Seite

1. `template/` nach `<tool-name>/` kopieren.
2. `<title>`, `<meta name="description">`, `tool:tags` (Filter-Kategorien der Startseite; die erste ist der Bereich: `Alltag`, `Arbeit` oder `Freizeit`, danach 1–2 Themen wie `Rechner`, `Spiele`, `KI`), optional `tool:features` (zweite Filterreihe „Funktion“, nur Werte aus `FEATURES` in `scripts/build.mjs`, z. B. `Kamera`, `Verlauf`; was alle Apps können – offline, installierbar, lokal speichern – steht fest auf der Startseite und gehört nicht hinein), `tool:order`, `tool:short-name` (Name unter dem Home-Bildschirm-Icon, max. ca. 12 Zeichen), die englischen Fassungen `tool:title-en`, `tool:description-en` (Pflicht – sonst bricht `build.mjs` ab) und `tool:short-name-en` (max. 12 Zeichen) sowie `tool:storage` (Präfix der Speicher-Schlüssel, siehe „Daten sichern“) setzen. Aus diesen Angaben entstehen Karte, README-Eintrag und App-Manifest.
3. Icon wählen: `tool:icon` = Name eines [Tabler Icons](https://tabler.io/icons) (Outline), `tool:color` = Hintergrund- und Theme-Farbe. Dann `node scripts/build-icons.mjs <tool-name>` ausführen.
4. `node scripts/build.mjs` ausführen (macht auch der Git-Hook). Generierte Bereiche zwischen `<!-- tools/footer/head/data:start -->` und `…:end -->` sowie `manifest.webmanifest`, `sw.js` **nie von Hand** bearbeiten.

5. Texte zweisprachig anlegen (siehe „Sprachen“); die Vorlage zeigt das Muster.
6. Fachliche Tests in `tests/<tool-name>.spec.mjs` anlegen. Die allgemeinen Prüfungen (Fehler, Layout, PWA, offline) greifen automatisch.

Seiten, die nicht gelistet werden sollen (z. B. Weiterleitungen), bekommen `<meta name="tool:hidden" content="true">`.

## Konventionen

- **Ordnernamen:** Englisch, klein, kebab-case, ohne Umlaute (`brew-calculator`). Die Oberfläche ist **Deutsch**, mit **Englisch** als zweiter Sprache (siehe „Sprachen“).
- **Umbenennen:** Sobald eine Seite geteilt wurde, im alten Ordner eine kleine Weiterleitungsseite lassen (`<meta http-equiv="refresh">` + `<meta name="tool:hidden" content="true">`), damit Links weiter funktionieren.
- **Gemeinsame Basis nutzen:** `../assets/base.css` zuerst einbinden, `../assets/common.js` vor dem Seiten-Script. Im Seiten-CSS nur seitenspezifische Regeln; eigene Akzentfarbe über `--accent` / `--accent-text` (hell und dunkel).
- **Gemeinsames ändern = alle Seiten prüfen.** Eine Änderung in `assets/` wirkt sofort auf jedes Tool.
- **Mobile-first:** muss bei 375 px Breite ohne seitliches Scrollen funktionieren. Touch-Ziele mindestens 44 px, Eingabefelder 16 px Schrift (sonst zoomt iOS).
- **Dark Mode:** nur Farben aus den Tokens verwenden, keine festen Farben für Flächen und Text.
- **Hilfe:** Anleitung als `<details class="help card">` am Ende der Seite, standardmäßig eingeklappt.
- **Fußzeile:** `<footer>` mit den Markern `<!-- footer:start -->` / `<!-- footer:end -->`. Infos zur App (läuft im Browser, was gespeichert wird, Bibliotheken) gehören in die Hilfe, nicht in die Fußzeile; eine eigene Zeile `<p>…</p>` vor den Markern nur für Pflichthinweise (z. B. Marken). Den gemeinsamen Text (inkl. Hinweis „KI-generiert“, ohne Namen eines bestimmten KI-Anbieters) nur in `scripts/partials/footer.html` ändern. Die Zeile `footer-home` (Link „Alle Tools“ zur Startseite) setzt `build.mjs` in jede Seite außer der Startseite.
- **Icons:** nur frei lizenzierte Icons (aktuell Tabler Icons, MIT – Version und Lizenz in `assets/vendor/tabler-icons/`). Jede Seite hat eine eigene Farbe.
- **Speicher:** nur über `Tools.load` / `Tools.save` (fangen Fehler im privaten Modus ab). Der Präfix `tools.` ist für domainweite Einstellungen reserviert (bisher nur `tools.lang.v1`) und darf in keinem `tool:storage` stehen. Schlüssel für neue Tools: `<tool-name>.<was>.v1`. **Bestehende Schlüssel nie umbenennen** – sonst sind Einstellungen und Verläufe der Nutzer weg (`scanCopySecurPharm.*`, `wuerfelMuenze.*`, `brauRechner.*`).
- **Modelle/Daten von externen Diensten** (z. B. Whisper-Modelle von Hugging Face) nur, wenn es nicht anders geht: erst bei Bedarf laden, nie Nutzerdaten mitschicken, in der Hilfe erklären. Die Tests blockieren solche Anfragen und prüfen die Fehlermeldung; echte Downloads nur in `tests/manual/`.
- **Externe Bibliotheken:** nie per CDN einbinden, sondern in `scripts/vendor.json` eintragen (npm-Paket, feste Version, Lizenz, Dateien) und `node scripts/vendor.mjs` ausführen. Eingebunden wird aus `../assets/vendor/<name>/`. Lädt eine Bibliothek selbst weitere Dateien nach (z. B. `.wasm`), den Pfad auf `assets/vendor` umbiegen. Nur Lizenzen, die Weitergabe erlauben (MIT, Apache-2.0, BSD …).
- **Lizenzhinweise:** `NOTICE.md` (Bibliothek, Version, Lizenz, Copyright aus der `LICENSE`, weitere Lizenzdateien eines Pakets) erzeugt `build.mjs` aus `scripts/vendor.json` – nie von Hand ändern. Die gemeinsame Fußzeile verlinkt sie („Open-Source-Lizenzen“).
- **Bibliotheks-Updates:** Die Action „Vendor-Updates prüfen“ öffnet monatlich ein Issue. Aktualisieren mit `node scripts/vendor.mjs --update <name>`, bei Tabler danach `node scripts/build-icons.mjs`, dann `npm test`. Bei 0.x- oder Major-Sprüngen das Changelog lesen.
- **PWA / Offline:** `sw.js` cacht die Seite, `assets/base.css`, `assets/common.js`, Icons und jede genutzte Vendor-Bibliothek komplett. Die Cache-Version ist ein Hash dieser Dateien – Updates kommen automatisch. Lädt eine Seite zur Laufzeit weitere eigene Dateien, müssen sie unter `assets/vendor/` liegen oder in `build.mjs` (`precacheList`) ergänzt werden. Nie Daten an fremde Server senden – offline gibt es keine.
- **Große Bibliotheken:** In `scripts/vendor.json` mit `"precache": false` markieren – sie werden nicht bei der Installation, sondern beim ersten Gebrauch gecacht (Cache `vendor:<name>@<version>`, bleibt über App-Updates erhalten). `"wasm": true` kennzeichnet Bibliotheken, die WebAssembly kompilieren (CSP bekommt dann `'wasm-unsafe-eval'`). Muss eine Bibliothek exakt zur Abhängigkeit einer anderen passen, `"versionFrom"` setzen (Beispiel: onnxruntime-web ↔ transformers). Pakete ohne Lizenzdatei (nur MIT) bekommen `"licenseFallback"`.
- **Worker & Hilfsdateien:** Alle Dateien im App-Ordner werden offline gecacht; Vendor-Pfade werden auch in `.js`-Dateien des Ordners (z. B. `worker.js`) erkannt. Module-Worker laden Bibliotheken per `import` aus `../assets/vendor/`.
- **Vendor-Pfade wörtlich, Worker aus dem App-Ordner** (prüft `build.mjs`, bricht sonst ab):
  - Pfade immer als `'../assets/vendor/<name>/…'` ausschreiben – nie zusammensetzen (`VENDOR + 'docx/…'`). Sonst findet `build.mjs` die Bibliothek nicht und sie fehlt offline.
  - Den Worker einer Bibliothek nie direkt aus `assets/vendor/` starten (`workerSrc`, `workerPath`, `new Worker`). Ein Worker außerhalb des App-Ordners wird nicht vom Service Worker der App bedient und scheitert offline. Stattdessen eine kleine Datei im App-Ordner, die ihn lädt (Beispiel: `pdf2word/pdf-worker.mjs` mit `import`, `pdf2word/ocr-worker.js` mit `importScripts`).
- **Offline-Test für Nachgeladenes:** Lädt eine Funktion erst bei Gebrauch Bibliotheken, Worker oder Daten, braucht sie einen eigenen Offline-Test in `tests/<tool-name>.spec.mjs` (einmal online benutzen, Netz trennen, neu laden, nochmal benutzen). Der allgemeine Offline-Test lädt nur die Seite und merkt davon nichts.
- **Teilen an die App (Android):** `<meta name="tool:share-target" content="audio/*, .opus">` erzeugt einen `share_target` im Manifest und den Empfang im `sw.js`; die Seite holt die Datei mit `Tools.takeSharedFile()`. Nur Android/Chromium und nur bei installierter App; iPhone unterstützt das nicht.
- **Links/Text an die App teilen (Android):** `<meta name="tool:share-text" content="true">` erzeugt einen `share_target` (GET) im Manifest – die Seite öffnet sich als `./?title=…&text=…&url=…`; `Tools.takeSharedText()` liefert `{ title, text, url }` und entfernt die Parameter aus der Adresse. Viele Apps schicken den Link in `text`, nicht in `url`. Zusammen mit `tool:share-target` (Dateien) noch nicht unterstützt.
- **iPhone:** Eine zum Home-Bildschirm hinzugefügte App hat **eigenen Speicher**, getrennt von Safari.
- **Nicht auffindbar:** Jede Seite trägt `<meta name="robots" content="noindex, nofollow">` (generiert). `robots.txt` darf **kein** `Disallow: /` enthalten, sonst sehen Suchmaschinen das noindex nicht. Das ist Unauffindbarkeit, kein Zugriffsschutz – wer den Link hat, kann die Seite öffnen.
- **Content Security Policy:** Der `<head>`-Block enthält eine strenge CSP: nur eigene Dateien, Inline-Skripte nur per SHA-256-Prüfsumme (berechnet `build.mjs`), WebAssembly nur wo nötig. Nach jeder Änderung an einem `<script>` deshalb `node scripts/build.mjs` (macht der Git-Hook). Keine Inline-Event-Handler (`onclick="…"`), kein `eval`. Ein CSP-Verstoß erscheint als Konsolenfehler und lässt die Tests scheitern.
- **Version:** Die Fußzeile jeder App zeigt „Version …“ = Cache-Version aus `sw.js`. So lässt sich auf dem Handy prüfen, ob eine installierte App aktuell ist.
- **Barrierefreiheit:** `tests/a11y.spec.mjs` prüft jede Seite hell und dunkel mit axe-core (WCAG 2.1 A/AA). Bedienelemente brauchen einen zugänglichen Namen, der den sichtbaren Text enthält; reine Vorlese-Texte mit `.sr-only`.
- **Datenschutz:** keine Tracker, keine Analytics, keine Daten an Server senden (die Tests schlagen bei jeder Anfrage an eine fremde Domain fehl).
- **Tests:** Fehler nie durch Abschwächen, Überspringen oder Löschen eines Tests „beheben“. Erwartete Werte unabhängig nachrechnen.
- **Zahlen:** mit `Tools.fmt` formatieren (deutsch bzw. englisch je nach Sprache), Datum/Uhrzeit mit `toLocaleString(Tools.locale())`, Eingaben mit Komma und Punkt akzeptieren (`Tools.parseNum`).

## Sprachen (Deutsch/Englisch)

Deutsch ist Standard und Ausgangssprache, Englisch die zweite Sprache. Die Umstellung läuft App für App (Issue #33); übersetzt sind bisher Startseite und `dice-coin`.

- **Wahl:** `?lang=de|en` in der Adresse → gespeicherte Wahl → Sprache des Browsers → Deutsch. Der Umschalter *Deutsch | English* steht in der gemeinsamen Fußzeile und erscheint nur auf übersetzten Seiten; nicht übersetzte Seiten bleiben komplett deutsch.
- **Gemeinsam für alle Apps:** gespeichert unter `tools.lang.v1` – bewusst außerhalb jedes App-Präfixes: nicht in App-Sicherungen, bleibt bei „Alle Daten löschen“ erhalten (die Tests erlauben genau diesen Schlüssel). iPhone: Jede installierte App hat eigenen Speicher, dort gilt die Wahl je App.
- **Seite übersetzen:** Deutsch bleibt im HTML. Feste Texte bekommen `data-i18n="key"` (Text), `data-i18n-html="key"` (mit Auszeichnung) oder `data-i18n-attr="aria-label:key; placeholder:key2"`. Texte in Elementen mit Kindern (z. B. Checkbox-Labels) in ein eigenes `<span data-i18n>` setzen. Lange Texte (Hilfe) als Blöcke `<div data-lang="de">…</div><div data-lang="en" lang="en" hidden>…</div>`.
- Im Seiten-Script **zuerst** `Tools.i18n({ de: { … }, en: { … } })`: `en` enthält alle `data-i18n`-Schlüssel, `de` und `en` alle Texte, die das Script erzeugt (`Tools.t('key', { n: 3 })` mit Platzhaltern `{n}`). Beim Umschalten ohne Neuladen feuert `Tools.onLang(fn)` – dort neu rendern.
- Gemeinsame Texte (Fußzeile, „Daten sichern & übertragen“, „Anleitung & Hinweise“ = `help.summary`, Meldungen) übersetzt `common.js`.
- Gespeicherte Standardwerte nicht übersetzen, sondern beim Anzeigen ersetzen (Beispiel `dice-coin`: Münz-Beschriftung „Kopf“/„Zahl“, eingebaute Vorlagen mit `key`). Bestehende Speicherformate bleiben gleich.
- **Titel/Startseite/Manifest:** aus `tool:title-en`, `tool:description-en`, `tool:short-name-en` (Seitentitel, Name beim „Zum Home-Bildschirm“, Karten der Startseite, `name_localized` usw. im Manifest). Das Manifest wählt nach Browser-/Systemsprache (Chrome/Edge 148+), nicht nach dem Umschalter. Neue Kategorien/Funktionen brauchen einen Eintrag in `TAGS_EN` in `scripts/build.mjs`.
- **Tests:** `tests/i18n.spec.mjs` prüft jede übersetzte Seite automatisch auf fehlende englische Texte (`Tools.i18nMissing()`), Hilfe, Layout; `a11y.spec.mjs` prüft sie zusätzlich auf Englisch. Fachliche Tests auf Englisch mit `test.use({ locale: 'en-US' })`.

## WebMCP (Werkzeuge für KI-Agenten)

Apps können Funktionen als **WebMCP-Werkzeuge** anbieten, damit ein KI-Agent im Browser sie direkt aufruft (Issue #34). WebMCP ist ein Entwurf der W3C Web Machine Learning Community Group (`document.modelContext.registerTool`); ältere Entwürfe/Polyfills nutzen `navigator.modelContext`. Ohne Unterstützung passiert nichts. Alle Apps haben Werkzeuge (Liste je App in `tool:webmcp`).

- **Nur über `Tools.mcp.register({ name, title, description, inputSchema, execute, readOnly, label })`** – nie `registerTool` direkt: Die Zwischenschicht setzt den App-Präfix (`dice_coin_roll_dice`), prüft die Eingabe gegen das Schema, registriert mit `AbortSignal` und ohne `exposedTo` (nur diese Herkunft) und fängt Fehler ab. Ändert sich der Entwurf, wird nur `common.js` angepasst.
- **Englisch, unabhängig von der Oberflächensprache:** Name (snake_case), Titel, Beschreibung, Parameter, Fehlermeldungen, Schlüssel im Ergebnis. Zahlen als JSON-Zahlen. Die Beschreibung sagt, was passiert und was zurückkommt.
- **Schema:** `type: 'object'`, `additionalProperties: false`, Grenzen (`minimum`, `maximum`, `maxLength`, `enum`) wie in der Oberfläche. Unterstützt wird die Teilmenge, die `Tools.mcp.checkSchema` prüft.
- **Für Nutzer sichtbar:** Ergebnis erscheint in der App (Eingabefelder, Anzeige, Verlauf); `label` erzeugt den Hinweis „KI-Agent: …“ (übersetzte Seiten: Schlüssel für `Tools.t`, sonst der deutsche Text). `readOnly: true` nur für Werkzeuge, die nichts ändern; `untrusted: true`, wenn das Ergebnis fremde Inhalte enthält (PDF-Text, Transkripte, gescannte oder geteilte Inhalte).
- **Nur was der Nutzer schon gewählt hat:** Agenten können keine Dateien auswählen und keine Messung mit Berechtigungsabfrage starten – Werkzeuge arbeiten mit der gewählten Datei bzw. lesen eine laufende Messung. Passwörter (z. B. WLAN im QR-Verlauf) nie zurückgeben.
- **Nie als Werkzeug:** Daten löschen, Sicherung laden, Einstellungen zurücksetzen, Kamera/Mikrofon/Standort, Dateien öffnen, Daten an Server.
- **Angaben:** `<meta name="tool:webmcp" content="roll_dice, flip_coin">` (Namen ohne Präfix) und die Funktion `KI-Agent` in `tool:features` – `build.mjs` prüft, dass beides zusammen gesetzt ist. In der Hilfe kurz erklären.
- **Tests:** `tests/webmcp.spec.mjs` stellt ein nachgebautes `modelContext` bereit und prüft jede App automatisch (genau die Werkzeuge aus `tool:webmcp`, englisch, Schema, nur `signal`, nichts Zerstörerisches). Fachliche Tests der Werkzeuge dort ergänzen (Ergebnis unabhängig nachrechnen, falsche Eingaben, offline).

## Daten sichern (Standard für jede App)

Jede App bietet am Seitenende den einklappbaren Bereich **„Daten sichern & übertragen“** mit *Sicherung speichern*, *Teilen …* (nur wenn das Gerät Dateien teilen kann, z. B. iPhone/Android), *Sicherung laden* und *Alle Daten löschen*. Der Bereich kommt aus `scripts/partials/data.html` (Marker `<!-- data:start -->` / `<!-- data:end -->` vor der Hilfe), die Logik aus `assets/common.js` (`Tools.data`).

**Regeln für Apps**

- Alles, was dauerhaft gespeichert wird, liegt im `localStorage` unter einem eigenen Präfix, angegeben in `<meta name="tool:storage" content="<präfix>.">` (mehrere kommagetrennt). Für neue Tools: `<tool-name>.`. Kein IndexedDB/Cookies ohne Erweiterung dieses Standards.
- Die Tests schlagen fehl, wenn eine Seite einen Schlüssel außerhalb ihrer Präfixe schreibt – sonst fehlte er in der Sicherung.
- Ändert sich das Format gespeicherter Daten: Schlüssel-Version erhöhen (`…v2`) **und** beim Laden alte Versionen (`…v1`) übernehmen. So lassen sich auch ältere Sicherungen weiter laden.

**Dateiformat** (`<app>-sicherung-JJJJ-MM-TT.json`)

```json
{
  "format": "phanlipo-tools-backup",
  "formatVersion": 1,
  "app": "dice-coin",
  "title": "Würfel & Münze",
  "exportedAt": "2026-10-28T12:00:00.000Z",
  "data": { "wuerfelMuenze.config.v1": "{\"tab\":\"dice\", …}" }
}
```

- `app` ist der Ordnername. `data` enthält die Rohwerte aus `localStorage` (Strings) 1:1 – das Zurückschreiben ist damit verlustfrei.
- **Laden** prüft: Format-Kennung, `formatVersion` ≤ unterstützte Version, passende `app`, nur Schlüssel mit eigenem Präfix und nur String-Werte, Datei ≤ 5 MB. Erst nach Rückfrage werden die Daten der App **ersetzt** (nicht zusammengeführt); schlägt das Schreiben fehl, wird der vorherige Stand wiederhergestellt. Danach lädt die Seite neu.
- **Löschen** entfernt nach Rückfrage nur Schlüssel mit eigenem Präfix – andere Apps derselben Domain bleiben unberührt.
- Wird das Format grundlegend geändert: `formatVersion` erhöhen und in `Tools.data.validateBackup` ältere Versionen weiter annehmen.

## Prüfen vor dem Commit

`npm test` muss grün sein (einmalig vorher `npm install` und `npx playwright install chromium`). Die Tests prüfen das Folgende größtenteils automatisch:

- Seite lädt ohne JavaScript-Fehler.
- Bei 375 px und bei Desktop-Breite kein horizontales Scrollen.
- Hell und dunkel ansehen.
- `node scripts/build.mjs --check` meldet „Up to date“.
- Offline: Seite einmal laden, Netz trennen, neu laden – muss vollständig funktionieren.

## Git

- Änderungen über einen Pull Request auf `main`, Squash-Merge.
- **Mergen ohne Rückfrage:** Ist der Check **test** auf dem aktuellen Stand des PRs grün und gibt es keine Konflikte, wird der PR direkt gemergt – das gilt auch für Dependabot-PRs (vorher auf den aktuellen `main` bringen). Bei roten Tests: Ursache beheben, nie Tests abschwächen. `main` ist geschützt: Merge nur mit grünem Check **test**; direkte Pushes sind gesperrt.
- PR-Branches werden nach dem Merge automatisch gelöscht.
- Dependabot öffnet wöchentlich Update-PRs (Actions, Test-Werkzeuge); mergen, wenn die Tests grün sind.
- GitHub Pages veröffentlicht `main` direkt; ein Merge ist nach 1–2 Minuten live.
- Hook einmalig aktivieren: `git config core.hooksPath .githooks` (in Cloud-Sessions von Claude Code erledigt das `.claude/hooks/session-start.sh` automatisch)
