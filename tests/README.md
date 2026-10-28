# Tests

Browser-Tests mit [Playwright](https://playwright.dev/) – sie laufen automatisch bei jedem Pull Request
und jedem Push auf `main` (`.github/workflows/test.yml`).

## Lokal ausführen

```sh
npm install                          # einmalig: Playwright + bwip-js
npx playwright install chromium      # einmalig: Browser
npm test                             # alle Tests
npx playwright test tests/dice-coin.spec.mjs   # nur eine Datei
npx playwright test -g "offline"     # nur Tests, deren Name passt
```

Ein kleiner Webserver (`tests/server.mjs`) startet automatisch und liefert das Repository wie GitHub Pages aus.

## Aufbau

| Datei | Prüft |
|---|---|
| `site.spec.mjs` | **jede Seite automatisch**: lädt ohne Fehler, kein seitliches Scrollen (375 px / 1280 px), Dark Mode, Hilfe eingeklappt, Fußzeile, PWA installierbar und offline nutzbar, Daten-Sicherung (Export, Import, Ablehnung falscher Dateien, Löschen nur eigener Daten); Startseite listet alle Tools |
| `securpharm-scanner.spec.mjs` | GS1- und IFA-Codes, Trennzeichen-Varianten, Prüfziffern, abgelaufene Packungen, Verlauf; Bild-Erkennung mit beiden Decodern (Test-DataMatrix wird mit `bwip-js` erzeugt) |
| `brew-calculator.spec.mjs` | alle drei Rechner gegen eine unabhängige Nachrechnung der Formeln, Formelsatz, Speichern der Eingaben |
| `dice-coin.spec.mjs` | Wertebereiche, Bonus, Halten, Einzelmodus, gemischte Würfel, Münzen, Vorlagen, Speichern, grobe Gleichverteilung |
| `helpers.mjs` | gemeinsame Helfer; der `page`-Fixture lässt jeden Test bei JS-Fehlern, Konsolenfehlern, **Anfragen an fremde Server** oder **localStorage-Schlüsseln außerhalb von `tool:storage`** scheitern |

## Neue Seite

`site.spec.mjs` deckt eine neue Seite ohne weitere Arbeit ab. Für die Fachlogik eine Datei
`tests/<tool-name>.spec.mjs` anlegen – die vorhandenen Dateien dienen als Beispiel.
Erwartete Werte möglichst **unabhängig nachrechnen** (siehe `brew-calculator.spec.mjs`), statt Ausgaben der Seite abzuschreiben.
