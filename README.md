# phanlipo.github.io

Sammlung kleiner Web-Tools, veröffentlicht über GitHub Pages: **https://phanlipo.github.io/**

Alles läuft im Browser, ohne Server und ohne Build-Schritt. Daten bleiben im `localStorage` des jeweiligen Browsers.

## Seiten

<!-- Automatisch erzeugt von scripts/build.mjs – nicht von Hand bearbeiten -->
<!-- tools:start -->
| Seite | Ordner | Beschreibung |
|---|---|---|
| [Scan-Copy-SecurPharm](https://phanlipo.github.io/securpharm-scanner/) | `securpharm-scanner/` | securPharm-DataMatrix von Arzneimittel-/Impfstoffpackungen scannen und einzelne Werte (PZN, Charge, Verfall, Seriennummer …) per Klick kopieren. Mit lokalem Verlauf. |
| [Würfel & Münze](https://phanlipo.github.io/dice-coin/) | `dice-coin/` | Würfel und Münzwurf für Spiele: Anzahl und Seiten frei wählbar, alle gleichzeitig oder einzeln würfeln, Würfel halten, Vorlagen. Einstellungen werden im Browser gespeichert. |
| [Brau-Rechner](https://phanlipo.github.io/brew-calculator/) | `brew-calculator/` | Rechner fürs Hobbybrauen: Volumen im zylindrischen Topf, Temperaturkorrektur der Stammwürze (Spindel) und Zuckermenge für die Nachgärung – jeweils mit Formeln und Rechenweg. |
<!-- tools:end -->

## Struktur

```
index.html            Startseite (Kartenliste wird automatisch erzeugt)
assets/base.css       gemeinsame Farben, Dark Mode, Karten, Buttons, Hilfe-Bereich
assets/common.js      gemeinsame Helfer (window.Tools) + Registrierung des Service Workers
assets/vendor/        Fremdbibliotheken mit Lizenz und Herkunft (siehe assets/vendor/README.md)
template/             Vorlage für neue Seiten
scripts/              build.mjs, build-icons.mjs, vendor.mjs (+ vendor.json)
<tool-name>/          je Tool ein Ordner (englischer Name, kebab-case) – installierbar als PWA
AGENTS.md             Konventionen für Mitwirkende und KI-Agenten
```

## Als App installieren (PWA)

Jedes Tool lässt sich einzeln installieren und funktioniert danach offline:

- **Android / Chrome:** Menü → „App installieren“ (oder der Hinweis in der Adressleiste).
- **iPhone / Safari:** Teilen → „Zum Home-Bildschirm“. Achtung: Die installierte App hat eigenen Speicher, getrennt von Safari.

Updates kommen automatisch: Nach einer Änderung lädt die App die neue Version im Hintergrund und zeigt sie beim nächsten Öffnen.

## Neue Seite hinzufügen

1. `template/` kopieren und englisch benennen, z. B. `unit-converter/`.
2. In der `index.html` Titel, `description`, `tool:tags`, `tool:order`, `tool:short-name`, `tool:icon` und `tool:color` anpassen.
3. `node scripts/build-icons.mjs <ordner>` erzeugt die Icons.
4. `node scripts/build.mjs` aktualisiert Seitenliste, Fußzeile, `<head>`-Links, Manifest und Service Worker (passiert per Git-Hook bzw. GitHub Action auch automatisch).

Die Seite ist dann unter `https://phanlipo.github.io/<ordner>/` erreichbar.

## Automatisierung

- **Vor jedem Commit:** einmalig `git config core.hooksPath .githooks` ausführen – dann läuft `build.mjs` automatisch.
- **Bei jedem Push:** die Action `.github/workflows/build.yml` führt `build.mjs` aus und committet Änderungen.
- **Monatlich:** die Action `.github/workflows/vendor-check.yml` prüft, ob es neuere Versionen der Bibliotheken gibt, und öffnet dann ein Issue.
- **Prüfen ohne zu schreiben:** `node scripts/build.mjs --check`

## Fremdbibliotheken und Lizenzen

Alle Bibliotheken liegen lokal in `assets/vendor/` (kein CDN), jeweils mit Original-Lizenz und Herkunftsangabe. Übersicht: [`assets/vendor/README.md`](assets/vendor/README.md). Icons: [Tabler Icons](https://tabler.io/icons), MIT.
