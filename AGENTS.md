# AGENTS.md

Hinweise für alle, die an diesem Repository arbeiten – Menschen wie KI-Agenten. Hier steht nur, was sich nicht aus dem Code ablesen lässt: Regeln, Verbote und ihre Gründe. Details stehen in den Kommentaren von `scripts/build.mjs`, `assets/common.js`, `template/index.html`, `tests/README.md` und den README-Dateien der größeren Apps.

## Projekt

Statische Web-Tools auf GitHub Pages (https://phanlipo.github.io/), ohne Server und ohne Pakete zur Laufzeit (`package.json` nur für Tests). Jede App ist ein Ordner `<tool-name>/` mit `index.html`, wird hauptsächlich **auf dem Handy** benutzt und ist als **PWA** installierbar und offline nutzbar.

- `assets/base.css`, `assets/common.js` (`window.Tools`): gemeinsame Basis aller Seiten. **Änderungen dort wirken auf jede App.**
- `assets/shared/`: Skripte, die mehrere Apps nutzen (TTS, WebRTC `p2p.js`, HEIC, Lieder, Cast …).
- `assets/vendor/`: Fremdbibliotheken – generiert aus `scripts/vendor.json`, nie von Hand ändern.
- `scripts/build.mjs`: erzeugt Startseite, `<head>` (CSP, noindex, Icons), Fußzeile, `manifest.webmanifest` und `sw.js` je App, `NOTICE.md`, `sbom.cdx.json`. Läuft im Git-Hook (`git config core.hooksPath .githooks`; Cloud-Sessions erledigen das per `.claude/hooks/session-start.sh`).
- `UI-KONZEPT.md`: Bedienelemente, Icon-Lexikon, Menüaufbau (Regeln kurz unter „Bedienelemente & Icons“).
- `IDEAS.md`: geplante und verworfene Ideen mit Begründung – **vor neuen Apps lesen**; Ideen, die nicht passen (z. B. brauchen Server), dort eintragen statt umsetzen.

**Generiert, nie von Hand bearbeiten:** Bereiche zwischen `<!-- tools/head/footer/data:start -->` und `…:end -->`, `manifest.webmanifest`, `sw.js`, Icons (auch `assets/icons.svg`), `NOTICE.md`, `sbom.cdx.json`, `assets/vendor/`, `quartet/decks.js`, `laser-mirrors/levels.js`.

## Neue App

1. `template/` nach `<tool-name>/` kopieren (Ordnername englisch, kebab-case). Die Vorlage zeigt alle Muster (Meta-Angaben, Zweisprachigkeit, Hilfe, Fehlersuche, Bühne).
2. Meta-Angaben setzen: `<title>` (nur Kurzname, max. 24 Zeichen), Beschreibung, `tool:tags` (erste = `Alltag`/`Arbeit`/`Freizeit`, dann 1–2 Themen), optional `tool:features` (nur Werte aus `FEATURES` in `build.mjs`), `tool:short-name` (≤ 12), englische Fassungen `tool:title-en`/`-description-en`/`-short-name-en` (Pflicht), `tool:storage`, `tool:icon` (Tabler-Icon, Outline), `tool:color`. `build.mjs` prüft das meiste und bricht bei Fehlern ab.
3. `node scripts/build-icons.mjs <tool-name>`, dann `node scripts/build.mjs`.
4. Fachliche Tests in `tests/<tool-name>.spec.mjs` (allgemeine Prüfungen greifen automatisch).

Nicht gelistete Seiten (z. B. Weiterleitungen): `<meta name="tool:hidden" content="true">`. **Umbenennen** einer geteilten App: im alten Ordner eine Weiterleitung lassen.

## Grundsätze

- **Datenschutz:** keine Tracker, keine Analytics, keine Daten an fremde Server. Die Tests schlagen bei jeder Anfrage an eine fremde Domain fehl. Ausnahmen nur über `tool:connect` (Apps, deren Zweck Anfragen an vom Nutzer eingetragene Server sind: nur nach Knopfdruck, nie per KI-Agent, `credentials: 'omit'`, in der Hilfe erklärt) und für Modelle (z. B. Hugging Face): erst bei Bedarf laden, nie Nutzerdaten mitschicken, in der Hilfe erklären. Bibliotheken, die selbst Statistik senden, laufen in einem Worker mit Netzsperre (Beispiel `camera-effects/vision-worker.mjs`).
- **Offline:** Alles, was eine App braucht, muss im `sw.js` landen. `build.mjs` findet es nur, wenn Pfade **wörtlich** als `'../assets/vendor/<name>/…'` bzw. `'../assets/shared/<datei>.js'` dastehen (nie zusammensetzen). Worker immer aus einer Datei im App-Ordner starten, nie direkt aus `assets/vendor/`. Lädt eine Funktion erst bei Gebrauch etwas nach, braucht sie einen eigenen Offline-Test (online benutzen, Netz trennen, neu laden, nochmal benutzen).
- **CSP:** nur eigene Dateien, Inline-Skripte per Prüfsumme – nach jeder Änderung an einem `<script>` `build.mjs` ausführen. Keine Inline-Handler (`onclick=`), kein `eval` auf Seiten (`code-runner` nur im gesperrten Worker, siehe `IDEAS.md`).
- **CORS-Proxy** (für Server ohne CORS-Freigabe, Beispiel `rss-reader`): nur als Einstellung, die der Nutzer selbst einträgt (`{url}` = Zieladresse kodiert), nie voreingestellt; in der Hilfe sagen, dass der Proxy die Anfragen sieht. Kein Proxy-SDK/-Skript einbinden. Corsfix funktioniert ohne Domain-Registrierung nur in der Form seines SDK: `https://proxy.corsfix.com/?sdk=1&url={url}` (`?{url}` kodiert → 400 `invalid_url`, unkodiert → 403 `domain_not_registered`). Fehler meldet Corsfix mit Header `x-corsfix-status` und JSON (`corsfix_error`, `message`, `if_you_are_user`) – Text anzeigen, in der Diagnose nur den Code.
- **Externe Bibliotheken:** nie per CDN, sondern in `scripts/vendor.json` (feste Version, Lizenz mit Weitergabe-Erlaubnis) und `node scripts/vendor.mjs`. Optionen (`precache`, `wasm`, `blobWorker`, `versionFrom`, `licenseFallback`, `licenseFile`, `maintenanceException`) sind in `vendor.mjs`/`build.mjs` beschrieben. Updates: `node scripts/vendor.mjs --update <name>` (frühestens 7 Tage nach Release), danach Tests der betroffenen Apps.
- **Nicht auffindbar:** Jede Seite trägt `noindex`; `robots.txt` darf kein `Disallow: /` enthalten. Veröffentlicht wird nur, was `isPublished` in `scripts/lib.mjs` erlaubt (keine `.md`, `scripts/`, `tests/` …) – der Test-Server liefert nach derselben Regel aus.
- **Mobile-first:** 375 px ohne seitliches Scrollen, Touch-Ziele ≥ 44 px, Eingabefelder 16 px Schrift. Neue Browser-Funktionen immer mit Ausweichweg (`'x' in window`) – Safari/iPhone und Firefox werden mitgetestet.
- **Dark Mode:** nur Farben aus den Tokens. Akzent `--accent` (hell) ist genau `tool:color`, dunkel ein hellerer Ton derselben Farbe.
- **Barrierefreiheit:** WCAG 2.1 AA (axe, hell/dunkel/Englisch). Zugängliche Namen enthalten den sichtbaren Text.
- **Formatierung:** Zahlen mit `Tools.fmt`, Eingaben mit `Tools.parseNum` (Komma und Punkt), Datum mit `toLocaleString(Tools.locale())`.

## Aufbau einer App

- **Basis:** `../assets/base.css` zuerst, `../assets/common.js` vor dem Seiten-Script. Seiten-CSS nur für Seitenspezifisches.
- **Kopfleiste:** App-Icon, Titel, Schnellaktionen und ☰ (setzt `common.js`). Selten Gebrauchtes (Einstellungen, Verlauf) mit `data-menu` ins Menü, ständig Gebrauchtes bleibt auf der Seite. Menü-Aktionen, die zur App zurückführen, rufen `Tools.menu.close()`.
- **Layout: Karten oder Bühne.** Standard: Karten untereinander, die Seite scrollt. Apps, die den ganzen Bildschirm brauchen (Malen, Chat, Spiele, Kamera), nutzen `<body class="stage">` (Hinweise in `template/`); Schnellaktionen in der Kopfleiste nach Bedarf (siehe „Bedienelemente & Icons“), Bedienelemente unten (Daumen).
- **Vollbild & ausblendende Leisten** (Feature `Vollbild`, Beispiel `pdf-viewer`): für Apps zum Lesen/Anzeigen. Eigene Leisten gleiten weg und kommen per Tippen zurück; `Tools.fullscreen.enter()` nur direkt nach einem Tippen (Browser-Regel); installiert startet die App im Manifest-Modus `fullscreen`.
- **Einrichtung vs. Inhalt:** Braucht eine App erst eine Eingabe (Feed, Playlist, Konfiguration), zeigt sie beim ersten Start nur dieses Formular. Danach steht der Inhalt im Vordergrund: Verwalten (Liste, Bearbeiten, Löschen) mit `data-menu` ins Menü, „Weitere … hinzufügen“ dort hinter einem Knopf; nach dem Hinzufügen Menü schließen und das Neue zeigen. Beispiele `rss-reader`, `playlist-player`.
- **Formulare:** Felder mit `.form-field` aus `base.css` (kleine Beschriftung über dem Feld, volle Breite, ≥ 44 px), Knöpfe dahinter in `.row`, Meldungen in `.form-error`. Kein eigenes Feld-CSS.
- **Hilfe:** `<details class="help card">` am Seitenende (landet im Menü), mit dem Block *Fehlersuche* aus der Vorlage. App-Infos (was gespeichert wird, Bibliotheken) gehören in die Hilfe, nicht in die Fußzeile; Fußzeilentext nur in `scripts/partials/footer.html`.
- **Fehlersuche:** wichtige Schritte, Berechtigungen, Geräte-APIs, Downloads, Worker mit `Tools.diag.log(…)`, Zustand mit `Tools.diag.info(() => ({…}))`. **Nie Nutzerinhalte** protokollieren (Texte, Passwörter, Dateien, Standorte). Bestehende Apps ohne Block bekommen ihn erst, wenn sie erweitert werden.
- **Größere Apps aufteilen:** Logik ohne DOM in eigene Skripte im App-Ordner, Architektur in `<app>/README.md` (Beispiele `treasure-hunt`, `card-games`, `quartet`, `laser-mirrors`, `move-play`).
- **Mehrere Geräte:** immer über `assets/shared/p2p.js`. Das Code-Format (`O1~…`/`A1~…`) nie ändern, ohne alte Codes weiter anzunehmen.
- **YouTube (`playlist-player`):** Player nur als iframe von `www.youtube-nocookie.com` (`tool:youtube`, CSP `frame-src`; `www.youtube.com` nur mit der Einstellung „Mit YouTube-Konto abspielen“ für Premium), Werbung nie überspringen/blockieren, gesteuert per postMessage – **kein YouTube-Skript in der Seite**. Iframe und oEmbed-Titel (`tool:connect`) erst nach Tippen bzw. Teilen/Einfügen eines Links, nie per KI-Agent. Tests nur mit `tests/fake-youtube.mjs`.
- **Cast (`cast-demo`, im Test):** Adresse der Empfängerseite `assets/shared/cast-receiver.html` nie ändern (bei Google registriert). Das Cast-SDK von `www.gstatic.com` ist die einzige erlaubte fremde Skriptquelle (`tool:cast`).
- **Fotos lesen:** HEIC über `assets/shared/heic.js` + `heic-worker.js` im App-Ordner, `accept="image/*,.heic,.heif"` (Beispiel `image-converter`).
- **Dateien teilen/öffnen:** `tool:share-target` (Dateien; Endungen müssen in `FILE_TYPES` stehen) bzw. `tool:share-text` (Links/Text), in der Seite `Tools.takeSharedFile(s)()`/`Tools.takeSharedText()`. Zurückspeichern per File System Access API nur mit Ausweichweg (Beispiel `markdown-editor`). iPhone kann beides nicht – in der Hilfe erklären.
- **Benachrichtigungen:** nur per `registration.showNotification()`, kein Push (kein Server); Beispiel und Begründung der Android-Sonderwege in `reminders`.

## Bedienelemente & Icons

Gleiche Handlungen sehen in jeder App gleich aus. Begründung, Lexikon und Bausteine stehen in `UI-KONZEPT.md`.

- **Icons nur aus dem Sprite** `assets/icons.svg` (Tabler Outline): `<svg class="ic" aria-hidden="true"><use href="../assets/icons.svg#download"/></svg>`, im Script `Tools.icon('download')`. Namen **wörtlich** schreiben (auch in Datenlisten als `icon: 'name'`), sonst fehlen sie im Sprite. Neuer Name → `node scripts/build-icons.mjs --sprite`; `build.mjs --check` schlägt fehl, solange das Sprite nicht passt. Keine kopierten SVG-Pfade.
- **Ein Wort, ein Icon:** Bedeutung → Icon nach dem Lexikon in `UI-KONZEPT.md` (Abschnitt 3); Icon-Knöpfe ohne Text werden in `tests/ui.spec.mjs` dagegen geprüft.
- **Keine Emoji in der Oberfläche** – weder als Symbol noch als Bild oder Spielinhalt. Stattdessen Tabler-Icon, eigene SVG-Zeichnung oder nur Text. Ausnahmen: Nutzereingaben und Datensätze, deren Zweck Emoji sind (Element mit `data-emoji-content`).
- **Bausteine aus `base.css`** statt eigenem CSS: `.btn` mit Icon, `.btn.block` (Hauptaktion), `.btn.icon`, `.seg` (2–4 Optionen), `.chips` (viele Optionen/Ansichten), `.tiles` (Optionen mit Bild), `.toolbar` (Werkzeuge unten), `.dropzone` (Datei wählen), `.empty-state`, `.step`, `.notice`, `.stat-box`, `.menu-list`. Auswahl immer per `aria-pressed`/`aria-selected` bzw. Radio.
- **Beschriftung, wenn Platz ist:** Knöpfe, Umschalter, Kacheln, Menüzeilen immer mit Text. `.toolbar` zeigt das Wort ab 64 px je Eintrag, sonst nur das Icon (macht `base.css`); Kopfleiste nur Icons mit `aria-label` und `title`.
- **Schnellaktionen nach Bedarf:** was während der Hauptaufgabe ständig gebraucht wird. Bei 375 px mit sichtbarem ↻ darf der Titel nicht abgeschnitten werden (Test); was nicht passt, kommt ins Menü.
- **Pro Ansicht eine Hauptaktion** (`.btn.primary`, auf dem Handy volle Breite). Gesperrte Knöpfe sind grau; daneben steht, was fehlt.
- **Menü:** Aktionen als `<div class="menu-list" data-menu>` (Gefährliches am Ende, `danger`), Bereiche mit `data-icon`, große Bereiche (lange Einstellungen, Listen zum Verwalten) als Unterseite `<details class="card" data-menu data-menu-page data-icon="…">`. `Tools.menu.open('id')` öffnet direkt eine Unterseite.

## Speicher & „Daten sichern“

- Dauerhaft nur über `Tools.load`/`Tools.save` in `localStorage`, unter dem Präfix aus `tool:storage` (neue Apps: `<tool-name>.<was>.v1`). Kein IndexedDB/Cookies. Die Tests schlagen fehl, wenn eine App außerhalb ihres Präfixes schreibt. `tools.` ist reserviert (nur `tools.lang.v1`).
- **Bestehende Schlüssel nie umbenennen** (`scanCopySecurPharm.*`, `wuerfelMuenze.*`, `brauRechner.*` …) – sonst sind Nutzerdaten weg. Neues Format: Version erhöhen (`…v2`) **und** `…v1` beim Laden übernehmen, damit alte Sicherungen weiter laden.
- **Dateien** (geöffnete PDFs, Fotos, Audio) überleben ein Neuladen über `Tools.keep` (Cache Storage `file:<app>`): beim Start zuerst behaltene Arbeit, dann geteilte Dateien; Knopf zum Verwerfen; beschädigte Datei verwerfen statt immer wieder zu scheitern; Passwörter nie ablegen; Test „survives a reload“. Beispiele `pdf-viewer`, `doc-scanner`, `audio-studio`.
- Der Bereich „Daten sichern & übertragen“ (Sicherung speichern/teilen/laden, alles löschen) kommt automatisch aus `scripts/partials/data.html` und `Tools.data`. Das Dateiformat (`format: "phanlipo-tools-backup"`, `formatVersion`, `app`, `data` = Rohwerte als Strings) ist in `common.js` beschrieben; bei grundlegender Änderung `formatVersion` erhöhen und alte Versionen in `validateBackup` weiter annehmen.

## Sprachen

Deutsch ist Standard (im HTML), Englisch zweite Sprache; jede App ist zweisprachig (Muster in `template/`).

- Feste Texte mit `data-i18n` / `data-i18n-html` / `data-i18n-attr`, lange Texte als `<div data-lang="de">`/`<div data-lang="en" lang="en" hidden>`. Im Script **zuerst** `Tools.i18n({ de, en })`, Texte mit `Tools.t()`, bei Sprachwechsel neu rendern über `Tools.onLang`.
- Gespeicherte Standardwerte nicht übersetzen, sondern beim Anzeigen ersetzen; Speicherformate bleiben gleich.
- Exporte für andere Programme (Feldnamen, JSON) bleiben in jeder Sprache gleich. Tabellen-CSV folgt der Sprache (de: `;` und Dezimalkomma).
- Meldungen aus Workern als Codes liefern und auf der Seite übersetzen.
- Neue Tags/Features brauchen einen Eintrag in `TAGS_EN` in `build.mjs`.

## WebMCP (Werkzeuge für KI-Agenten)

Jede App bietet Funktionen als WebMCP-Werkzeuge an – **nur über `Tools.mcp.register(…)`**, nie `registerTool` direkt (die Zwischenschicht kapselt den sich ändernden W3C-Entwurf).

- Name, Beschreibung, Parameter, Ergebnis und Fehler **englisch**, unabhängig von der Oberfläche. Schema mit `additionalProperties: false` und denselben Grenzen wie die Oberfläche.
- Ergebnis sichtbar in der App; `readOnly` nur, wenn nichts geändert wird; `untrusted`, wenn das Ergebnis fremde Inhalte enthält.
- Werkzeuge arbeiten nur mit dem, was der Nutzer schon gewählt hat. **Nie als Werkzeug:** Daten löschen, Sicherung laden, Einstellungen zurücksetzen, Kamera/Mikrofon/Standort, Dateien öffnen, Daten an Server, Passwörter zurückgeben.
- `tool:webmcp` (Namen ohne Präfix) und Feature `KI-Agent` gehören zusammen (prüft `build.mjs`). Fachliche Tests in `tests/webmcp.spec.mjs`.

## Bibliotheken: Pflege & Sicherheit

Ziel: keine ungepflegte oder verwundbare Bibliothek ausliefern. Einzige von Hand gepflegte Liste ist `scripts/vendor.json`; SBOM, `NOTICE.md` und Prüfungen werden daraus erzeugt.

- Regeln in `assessHealth` (`scripts/lib.mjs`): **Fehler** bei deprecated, archiviertem Repo oder > 24 Monaten ohne Release **und** > 12 Monaten ohne Commit; **Warnung** ab 12 Monaten ohne Release. Schwachstellen über OSV.
- Ein PR, der eine Bibliothek neu aufnimmt oder ändert, scheitert bei Fehler oder hoher/kritischer Schwachstelle – dann andere Bibliothek oder Version wählen, **nicht die Regeln aufweichen**. Ausnahme nur begründet und befristet (`maintenanceException` mit `until`).
- Actions immer auf Commit-SHA festlegen, minimale `permissions`, `persist-credentials: false` (außer beim Pushen), `npm ci --ignore-scripts`. „Workflows prüfen“ (zizmor) muss grün sein.

## Tests

- **Fehler nie durch Abschwächen, Überspringen oder Löschen eines Tests „beheben“.** Erwartete Werte unabhängig nachrechnen.
- In CI ein zweiter Versuch je Test; wer erst dann grün wird, ist **wackelig** und wird wie ein roter Test behandelt: Ursache beheben (auf Zustände statt feste Zeiten warten, Zufall festlegen), nie Retries oder Timeouts erhöhen.
- Helfer aus `tests/helpers.mjs` nutzen: `openMenu`/`closeMenu`, `switchLang`, `clipboardText` (nie die echte Zwischenablage), `mockLaunchQueue`. Englische Tests mit `test.use({ locale: 'en-US' })`. Externe Dienste werden blockiert bzw. per Route simuliert; echte Downloads nur in `tests/manual/`.

**Vor dem Commit** (die volle Suite läuft in CI, lokal > 10 Minuten):

- Immer: `npm run lint` und `node scripts/build.mjs --check` („Up to date“). ESLint-Meldungen beheben statt Regeln abzuschalten.
- App geändert: `npm run test:app -- <ordner>` (fachliche + alle allgemeinen Prüfungen für diese App).
- Gemeinsames geändert (`assets/`, `scripts/`, Test-Helfer): direkt betroffene Testdateien plus `test:app` für ein, zwei typische Apps.

## Git

- Änderungen per Pull Request auf `main`, Squash-Merge. `main` ist geschützt.
- **Mergen ohne Rückfrage**, wenn die Checks **test**, **Bibliotheken prüfen** und **Workflows prüfen** auf dem aktuellen Stand grün sind und es keine Konflikte gibt – auch Dependabot-PRs (vorher auf aktuellen `main` bringen).
- Nach dem Merge testet „Live-Seite testen“ die veröffentlichte Seite; ist sie rot, die Ursache beheben.
- `overrides.minimatch` in `package.json` (GHSA-g3hv-75wg-m249 über ESLint) entfernen, sobald ESLint selbst `minimatch` ≥ 11.0.1 verlangt.
