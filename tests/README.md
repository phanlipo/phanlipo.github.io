# Tests

Browser-Tests mit [Playwright](https://playwright.dev/) – sie laufen automatisch bei jedem Pull Request
und jedem Push auf `main` (`.github/workflows/test.yml`).

## Lokal ausführen

```sh
npm install                          # einmalig: Playwright, axe-core, bwip-js
npx playwright install chromium      # einmalig: Browser
npm test                             # alle Tests
npx playwright test tests/dice-coin.spec.mjs   # nur eine Datei
npx playwright test -g "offline"     # nur Tests, deren Name passt
```

Ein kleiner Webserver (`tests/server.mjs`) startet automatisch und liefert das Repository wie GitHub Pages aus.

Passt der installierte Browser nicht zur Playwright-Version (z. B. in vorkonfigurierten Umgebungen), lässt sich ein vorhandener Chromium angeben: `PW_CHROMIUM_PATH=/pfad/zu/chrome-headless-shell npm test`. Die GitHub Action braucht das nicht. In Cloud-Sessions von Claude Code setzt `.claude/hooks/session-start.sh` die Variable automatisch, wenn der passende Browser fehlt und sich nicht herunterladen lässt; `scripts/build-icons.mjs` nutzt sie ebenfalls.

## Aufbau

| Datei | Prüft |
|---|---|
| `site.spec.mjs` | **jede Seite automatisch**: noindex, strenge CSP, Versionsanzeige = Cache-Version, lädt ohne Fehler, kein seitliches Scrollen (375 px / 1280 px), Dark Mode, Hilfe eingeklappt, Fußzeile, PWA installierbar und offline nutzbar, Daten-Sicherung (Export, Import, Ablehnung falscher Dateien, Löschen nur eigener Daten); Startseite listet alle Tools |
| `a11y.spec.mjs` | **Barrierefreiheit** jeder Seite (WCAG 2.1 A/AA, axe-core), hell und dunkel, mit geöffneten Klapp-Bereichen; übersetzte Seiten zusätzlich auf Englisch |
| `webmcp.spec.mjs` | **WebMCP** (Werkzeuge für KI-Agenten) mit nachgebautem `document.modelContext`: jede App registriert genau die Werkzeuge aus `tool:webmcp` (englisch, Schema, nur für diese Herkunft, nichts Zerstörerisches), `navigator.modelContext` als Rückfall, ohne WebMCP keine Fehler; Werkzeuge jeder App fachlich: Würfel/Münze, Brau-Rechner (unabhängig nachgerechnet), QR-Code (WLAN-Passwort nie im Verlauf), Schere-Stein-Papier (Regeln unabhängig), SecurPharm (Zerlegung, Prüfziffer, Suche), Sensoren (Schritte, Kompass nur während er läuft), PDF zu Word (gewählte Datei umwandeln, Text), Sprache zu Text (Transkript, Verlauf), Erinnerungen (anlegen, ändern, auflisten, Ortszeit, falsche Zeiten); Anzeige in der App, falsche Eingaben, offline, gleich in jeder Sprache |
| `i18n.spec.mjs` | **Deutsch/Englisch**: Startseite auf Englisch (Karten, Filter), jede übersetzte Seite ohne fehlende englische Texte, Hilfe nur in einer Sprache, nicht übersetzte Seiten bleiben deutsch, Sprachwahl gilt für alle Apps und bleibt nach Neuladen, `?lang=`, nicht in App-Sicherungen, englische Namen im Manifest |
| `securpharm-scanner.spec.mjs` | GS1- und IFA-Codes, Trennzeichen-Varianten, Prüfziffern, abgelaufene Packungen, Verlauf; Bild-Erkennung mit beiden Decodern (Test-DataMatrix wird mit `bwip-js` erzeugt) |
| `brew-calculator.spec.mjs` | alle drei Rechner gegen eine unabhängige Nachrechnung der Formeln, Formelsatz, Speichern der Eingaben |
| `dice-coin.spec.mjs` | Wertebereiche, Bonus, Halten, Einzelmodus, gemischte Würfel, Münzen, Vorlagen, Speichern, grobe Gleichverteilung; Englisch (Texte, Zahlenformat, Verlauf, Münz-Beschriftung, Vorlagen, Umschalten ohne Neuladen) |
| `rock-paper-scissors.spec.mjs` | Regeln aller drei Varianten (unabhängig nachgeprüft), Computer wählt unabhängig von der Spielerwahl, „Schlau“ lernt aus dem Verlauf, Pfeil-Bilder in der Hilfe, Punktestand je Variante |
| `voice-transcriber.spec.mjs` | Audio dekodieren (Browser + Opus-Ersatz-Decoder), Fehler bei Nicht-Audio, verständliche Meldung wenn das Modell nicht ladbar ist, Teilen-Ziel (Android), Verlauf |
| `pdf2word.spec.mjs` | PDF zu Word: Absätze, hängender Einzug, Silbentrennung, Spalten (Tabulator), zentrierte Zeilen, Seitenumbrüche, Seitenzahl in der Fußzeile, Ränder – geprüft in der erzeugten .docx gegen die Geometrie einer selbst gebauten PDF (`pdf-tools.mjs`, Courier = feste Zeichenbreite); Bilder (Position, Größe, gespiegelt/gedreht, Hintergrundbild übersprungen), Texterkennung gescannter Seiten (Text und Schriftgrößen; ausgeschaltet oder nicht ladbar → Seite als Bild; offline nach dem ersten Mal), Nicht-PDF, PDF ohne Inhalt, Teilen-Ziel, offline |
| `sensors.spec.mjs` | Sensorwerte per künstlicher Ereignisse und simulierter Geräte, Erwartungen unabhängig nachgerechnet: Kompass (Android/iPhone, geografisch Nord, Peilung), Wasserwaage (liegend/stehend, Libellen, Nullpunkt, Winkel zwischen Flächen, Halten, Ton), Beschleunigung und Drehrate, Vibrometer (Effektivwert, Spitze, Frequenz, CSV-Aufzeichnung), Schall (Pegel, Kalibrierung, dB(A) bei 100 Hz, Hauptfrequenz, Lärmprotokoll als CSV), Stimmgerät (Ton, Cent, Gitarrensaiten), Tacho (Großkreis-Distanz, Geschwindigkeit, Schnitt, ungenaue Positionen, Koordinaten in Dezimalgrad und Grad/Min/Sek, Kopieren, Karten-Link), Schrittzähler, Tongenerator, Taschenlampe/Morse (SOS = 9 Blitze, Bildschirm-Ersatz), Puls (pulsierendes Kamerabild 72/min), Klatsch-Stoppuhr; Übersicht/Icon-Leiste und Zurück-Taste, Auto-Start, Pause im Hintergrund, Berechtigungen, alle Reiter barrierefrei |
| `reminders.spec.mjs` | Erinnerungen mit gesteuerter Uhr (Playwright `clock`) und nachgebauter Notifications-API: Benachrichtigung genau zur Zeit (nicht vorher, nur einmal, auch nach Neuladen), Reihenfolge, Schnellauswahl, falsche Eingaben, Bearbeiten und erneut Planen aus dem Verlauf, verpasste Erinnerung beim Öffnen als „verspätet“, blockierte Berechtigung (nur in der App), Abfrage sofort abgelehnt oder abgelaufen (Hinweise, Android-Pfad), Speichern fragt nicht nach, Android fragt über ein Push-Abo und kündigt es sofort, fehlende Notifications-API, Erlauben + Test, Löschen, anderer Tab, Englisch |
| `qr-code.spec.mjs` | QR-Codes für Links, Umlaute/Emoji und WLAN (Sonderzeichen-Escaping) – gelesen mit einem unabhängigen Decoder (ZXing-JS); Fehlerkorrektur, Größengrenze, gespeichertes PNG, Teilen-Ziel für Links (Android), Link zum Generator mit Inhalt (auch WLAN), Verlauf |
| `build.spec.mjs` | `build.mjs --check` ist sauber; `NOTICE.md` nennt jede Bibliothek mit Version und funktionierendem Lizenz-Link; die Prüfung der Vendor-Pfade erkennt zusammengesetzte Pfade und Worker, die direkt aus `assets/vendor/` starten (beides bricht offline) |
| `helpers.mjs` | gemeinsame Helfer; der `page`-Fixture lässt jeden Test bei JS-Fehlern, Konsolenfehlern, **Anfragen an fremde Server** oder **localStorage-Schlüsseln außerhalb von `tool:storage`** scheitern (Ausnahme: die gemeinsame Sprachwahl `tools.lang.v1`) |

## Live-Seite

`tests/live/` prüft die **veröffentlichte** Seite (https://phanlipo.github.io/) statt des lokalen Servers – eigene Konfiguration `playwright.live.config.mjs`, nicht Teil von `npm test`:

```sh
node scripts/build.mjs && npm run test:live      # auf dem aktuellen main
LIVE_WAIT=600 npm run test:live                  # bis zu 10 Minuten warten, bis die Veröffentlichung sichtbar ist
LIVE_URL=https://example.org npm run test:live   # andere Adresse
```

| Prüft | |
|---|---|
| Stand | **jede veröffentlichte Datei** (`publishedFiles` in `scripts/lib.mjs`) ist erreichbar und byte-gleich mit dem Repository |
| Nicht veröffentlicht | `README.md`, `AGENTS.md`, `NOTICE.md`, `scripts/`, `tests/`, `template/`, `package.json`, Dotfiles … liefern 404 |
| Auslieferung | HTTPS, passende Content-Types |
| Jede App | lädt ohne Fehler und fremde Anfragen auf dem Handy, noindex, CSP, Fußzeile zeigt die aktuelle Version, installierbar, offline nutzbar (echter Service Worker über HTTPS) |

Verglichen wird mit dem lokalen Stand – auf einem Branch mit Änderungen schlagen die Vergleiche deshalb erwartungsgemäß fehl. Die Action `.github/workflows/live-test.yml` läuft nach jeder Veröffentlichung (aus `pages.yml`) und auf Knopfdruck (Actions → „Live-Seite testen“ → Run workflow). Schlägt sie fehl, schickt GitHub eine E-Mail.

## Manuelle Tests

`tests/manual/` enthält Prüfungen, die bewusst **nicht** in `npm test` laufen, weil sie große Downloads oder private Dateien brauchen:

```sh
node tests/manual/whisper-e2e.mjs ~/sprachnachricht.opus                       # Whisper base
node tests/manual/whisper-e2e.mjs ~/sprachnachricht.opus onnx-community/whisper-small
```

Testdateien in `tests/fixtures/` sind künstlich erzeugt (siehe dortige README) – keine echten Aufnahmen ins Repo.

## Neue Seite

`site.spec.mjs` deckt eine neue Seite ohne weitere Arbeit ab. Für die Fachlogik eine Datei
`tests/<tool-name>.spec.mjs` anlegen – die vorhandenen Dateien dienen als Beispiel.
Erwartete Werte möglichst **unabhängig nachrechnen** (siehe `brew-calculator.spec.mjs`), statt Ausgaben der Seite abzuschreiben.
