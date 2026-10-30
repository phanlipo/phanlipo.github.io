# phanlipo.github.io

Sammlung kleiner Web-Tools, veröffentlicht über GitHub Pages: **https://phanlipo.github.io/**

Alles läuft im Browser, ohne Server und ohne Build-Schritt. Daten bleiben im `localStorage` des jeweiligen Browsers.

## Seiten

<!-- Automatisch erzeugt von scripts/build.mjs – nicht von Hand bearbeiten -->
<!-- tools:start -->
| Seite | Ordner | Beschreibung |
|---|---|---|
| [Brau-Rechner](https://phanlipo.github.io/brew-calculator/) | `brew-calculator/` | Rechner fürs Hobbybrauen: Volumen im zylindrischen Topf, Temperaturkorrektur der Stammwürze (Spindel) und Zuckermenge für die Nachgärung – jeweils mit Formeln und Erklärung. |
| [Countdown – wie lange noch?](https://phanlipo.github.io/countdown/) | `countdown/` | Tage, Stunden, Minuten oder Sekunden bis zu einem Datum mit Uhrzeit – live ab jetzt oder ab einem eigenen Startdatum. |
| [Datensammler – Messwerte erfassen & auswerten](https://phanlipo.github.io/data-logger/) | `data-logger/` | Eigene Profile mit Messwerten und Einheiten anlegen, Werte mit Zeitpunkt erfassen und als Kurven auswerten – Export als Bild, JSON oder CSV. |
| [Dokumentenscanner](https://phanlipo.github.io/doc-scanner/) | `doc-scanner/` | Dokumente mit der Kamera oder aus Fotos scannen – Fotos auch aus der Galerie hierher teilen (Android): Ecken zuschneiden, Seiten sortieren, Schatten entfernen, als PDF speichern. |
| [Erinnerungen](https://phanlipo.github.io/reminders/) | `reminders/` | Eigene Erinnerungen mit Zeitpunkt und Text – zur Zeit kommt eine Benachrichtigung, im Verlauf lassen sie sich anpassen. |
| [Furzkissen](https://phanlipo.github.io/whoopee-cushion/) | `whoopee-cushion/` | Drauftippen und pupsen lassen – sieben Geräusche, Zeitzünder für Streiche und Vibration. |
| [Handy-Sensoren](https://phanlipo.github.io/sensors/) | `sensors/` | Kompass, Wasserwaage, Beschleunigung, Vibrometer, Schallpegel, Stimmgerät, Tacho, Schrittzähler, Tongenerator, Taschenlampe mit Morse, Puls und Klatsch-Stoppuhr – mit den Sensoren des Handys. |
| [KI-Chat](https://phanlipo.github.io/ai-chat/) | `ai-chat/` | Mit Googles Sprachmodell Gemma chatten – es läuft direkt auf dem Gerät, auch offline. Kein Konto, keine Cloud: Die Unterhaltung verlässt das Gerät nicht. |
| [PDF zu Word](https://phanlipo.github.io/pdf2word/) | `pdf2word/` | PDF-Dokumente direkt im Browser in eine bearbeitbare Word-Datei (.docx, auch für LibreOffice) umwandeln – mit Bildern und Texterkennung für gescannte Seiten, ohne Upload: Die Datei verlässt das Gerät nicht. |
| [QR-Code-Generator](https://phanlipo.github.io/qr-code/) | `qr-code/` | QR-Codes für Links, Text und WLAN erzeugen – Links direkt aus anderen Apps hierher teilen (Android), mit Verlauf. |
| [Scan-Copy-SecurPharm](https://phanlipo.github.io/securpharm-scanner/) | `securpharm-scanner/` | securPharm-DataMatrix von Arzneimittel-/Impfstoffpackungen scannen und einzelne Werte (PZN, Charge, Verfall, Seriennummer …) per Klick kopieren. Mit lokalem Verlauf. |
| [Schere, Stein, Papier](https://phanlipo.github.io/rock-paper-scissors/) | `rock-paper-scissors/` | Spiel gegen den Computer – klassisch, mit Brunnen oder mit Echse und Spock. |
| [Sprache zu Text](https://phanlipo.github.io/voice-transcriber/) | `voice-transcriber/` | Sprachnachrichten (z. B. WhatsApp-Opus-Dateien) direkt im Browser in Text umwandeln – mit dem Whisper-Modell, ohne Upload: Das Audio verlässt das Gerät nicht. |
| [Würfel & Münze](https://phanlipo.github.io/dice-coin/) | `dice-coin/` | Würfel und Münzwurf für Spiele: Anzahl und Seiten frei wählbar, alle gleichzeitig oder einzeln würfeln, Würfel halten, Vorlagen. Einstellungen werden im Browser gespeichert. |
<!-- tools:end -->

## Struktur

```
index.html            Startseite (Kartenliste wird automatisch erzeugt)
assets/base.css       gemeinsame Farben, Dark Mode, Karten, Buttons, Hilfe-Bereich
assets/common.js      gemeinsame Helfer (window.Tools) + Registrierung des Service Workers
assets/vendor/        Fremdbibliotheken mit Lizenz und Herkunft (Übersicht in NOTICE.md)
template/             Vorlage für neue Seiten
scripts/              build.mjs, build-icons.mjs, vendor.mjs (+ vendor.json)
<tool-name>/          je Tool ein Ordner (englischer Name, kebab-case) – installierbar als PWA
tests/                Browser-Tests (Playwright) – siehe tests/README.md
AGENTS.md             Konventionen für Mitwirkende und KI-Agenten
```

## Als App installieren (PWA)

Jedes Tool lässt sich einzeln installieren und funktioniert danach offline:

- **Android / Chrome:** Menü → „App installieren“ (oder der Hinweis in der Adressleiste).
- **iPhone / Safari:** Teilen → „Zum Home-Bildschirm“. Achtung: Die installierte App hat eigenen Speicher, getrennt von Safari.

Updates kommen automatisch: Nach einer Änderung lädt die App die neue Version im Hintergrund und zeigt sie beim nächsten Öffnen.

## Daten sichern & übertragen

Jede App hat am Seitenende den Bereich **„Daten sichern & übertragen“**: Einstellungen, Verläufe und Vorlagen als JSON-Datei speichern oder teilen, wieder laden oder löschen. So lassen sich Daten z. B. von Safari in die installierte iPhone-App oder auf ein neues Gerät mitnehmen. Format und Regeln: `AGENTS.md`, Abschnitt „Daten sichern“.

## Neue Seite hinzufügen

1. `template/` kopieren und englisch benennen, z. B. `unit-converter/`.
2. In der `index.html` Titel, `description`, `tool:tags`, `tool:short-name`, `tool:icon` und `tool:color` anpassen.
3. `node scripts/build-icons.mjs <ordner>` erzeugt die Icons.
4. `node scripts/build.mjs` aktualisiert Seitenliste, Fußzeile, `<head>`-Links, Manifest und Service Worker (passiert per Git-Hook bzw. GitHub Action auch automatisch).

Die Seite ist dann unter `https://phanlipo.github.io/<ordner>/` erreichbar.

## Automatisierung

- **Vor jedem Commit:** einmalig `git config core.hooksPath .githooks` ausführen – dann läuft `build.mjs` automatisch.
- **Bei jedem Push:** die Action `.github/workflows/build.yml` führt `build.mjs` aus und committet Änderungen.
- **Bei jedem Push auf main:** die Action `.github/workflows/pages.yml` veröffentlicht die Seiten auf GitHub Pages; danach testet `.github/workflows/live-test.yml` die Live-Seite (auch auf Knopfdruck; lokal: `npm run test:live`).
- **Bei jedem PR und Push auf main:** die Action `.github/workflows/test.yml` führt alle Tests aus (lokal: `npm install`, `npx playwright install chromium`, `npm test`).
- **Wöchentlich:** Dependabot öffnet Update-PRs für GitHub Actions und die Test-Werkzeuge.
- **Monatlich:** die Action `.github/workflows/vendor-check.yml` prüft, ob es neuere Versionen der Bibliotheken gibt, und öffnet dann ein Issue.
- **Prüfen ohne zu schreiben:** `node scripts/build.mjs --check`

## Sichtbarkeit und Sicherheit

- Die Seiten sind **nicht für Suchmaschinen gedacht**: Jede Seite trägt `noindex`; `robots.txt` erlaubt das Crawlen der Seiten bewusst, damit Suchmaschinen diesen Hinweis sehen. Die übrigen Repo-Dateien (`README.md`, `scripts/`, `tests/` …) werden gar nicht veröffentlicht – die Action `.github/workflows/pages.yml` lädt nur die Seiten und `assets/` hoch (`scripts/site.mjs`). Wer den Link hat, kann die Seiten trotzdem öffnen.
- Eine strenge **Content Security Policy** erlaubt nur eigene Dateien – keine fremden Skripte, Tracker oder CDNs.
- Die Fußzeile jeder App zeigt die **Version** (= Offline-Cache-Version), um Updates auf installierten Apps prüfen zu können.

## Fremdbibliotheken und Lizenzen

Alle Bibliotheken liegen lokal in `assets/vendor/` (kein CDN), jeweils mit Original-Lizenz und Herkunftsangabe. Version, Lizenz und Zweck jeder Bibliothek: [`NOTICE.md`](NOTICE.md).
