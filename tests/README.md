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

## Aufbau

| Datei | Prüft |
|---|---|
| `site.spec.mjs` | **jede Seite automatisch**: noindex, strenge CSP, Versionsanzeige = Cache-Version, lädt ohne Fehler, kein seitliches Scrollen (375 px / 1280 px), Dark Mode, Hilfe eingeklappt, Fußzeile, PWA installierbar und offline nutzbar, Daten-Sicherung (Export, Import, Ablehnung falscher Dateien, Löschen nur eigener Daten); Startseite listet alle Tools |
| `a11y.spec.mjs` | **Barrierefreiheit** jeder Seite (WCAG 2.1 A/AA, axe-core), hell und dunkel, mit geöffneten Klapp-Bereichen |
| `securpharm-scanner.spec.mjs` | GS1- und IFA-Codes, Trennzeichen-Varianten, Prüfziffern, abgelaufene Packungen, Verlauf; Bild-Erkennung mit beiden Decodern (Test-DataMatrix wird mit `bwip-js` erzeugt) |
| `brew-calculator.spec.mjs` | alle drei Rechner gegen eine unabhängige Nachrechnung der Formeln, Formelsatz, Speichern der Eingaben |
| `dice-coin.spec.mjs` | Wertebereiche, Bonus, Halten, Einzelmodus, gemischte Würfel, Münzen, Vorlagen, Speichern, grobe Gleichverteilung |
| `rock-paper-scissors.spec.mjs` | Regeln aller drei Varianten (unabhängig nachgeprüft), Computer wählt unabhängig von der Spielerwahl, „Schlau“ lernt aus dem Verlauf, Pfeil-Bilder in der Hilfe, Punktestand je Variante |
| `voice-transcriber.spec.mjs` | Audio dekodieren (Browser + Opus-Ersatz-Decoder), Fehler bei Nicht-Audio, verständliche Meldung wenn das Modell nicht ladbar ist, Teilen-Ziel (Android), Verlauf |
| `helpers.mjs` | gemeinsame Helfer; der `page`-Fixture lässt jeden Test bei JS-Fehlern, Konsolenfehlern, **Anfragen an fremde Server** oder **localStorage-Schlüsseln außerhalb von `tool:storage`** scheitern |

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
