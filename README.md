# phanlipo.github.io

Sammlung kleiner Web-Tools, veröffentlicht über GitHub Pages: **https://phanlipo.github.io/**

Alles läuft im Browser, ohne Server und ohne Build-Schritt. Daten bleiben im `localStorage` des jeweiligen Browsers.

## Seiten

<!-- Automatisch erzeugt von scripts/build-index.mjs – nicht von Hand bearbeiten -->
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
assets/common.js      gemeinsame Helfer (window.Tools: load/save, toast, copyText, fmt …)
template/             Vorlage für neue Seiten
scripts/              build-index.mjs (Seitenliste + Fußzeile), build-icons.mjs (Favicons)
<tool-name>/          je Tool ein Ordner mit index.html (englischer Name, kebab-case)
.githooks/pre-commit  aktualisiert die Seitenliste vor jedem Commit
AGENTS.md             Konventionen für Mitwirkende und KI-Agenten
```

## Neue Seite hinzufügen

1. `template/` kopieren und englisch benennen, z. B. `unit-converter/`.
2. In der `index.html` Titel, `description`, `tool:tags`, `tool:order`, `tool:icon` und `tool:color` anpassen.
3. `node scripts/build-icons.mjs <ordner>` erzeugt das Favicon.
4. `node scripts/build-index.mjs` aktualisiert Seitenliste und Fußzeile (passiert per Git-Hook bzw. GitHub Action auch automatisch).

Die Seite ist dann unter `https://phanlipo.github.io/<ordner>/` erreichbar.

## Generierte Teile

Die Seitenliste (Startseite und README) wird aus den Metadaten der Tool-Seiten erzeugt, die gemeinsame Fußzeile aus `scripts/partials/footer.html`:

- **Lokal vor jedem Commit:** einmalig `git config core.hooksPath .githooks` ausführen.
- **Auf GitHub:** die Action `.github/workflows/tool-index.yml` baut die Liste bei jedem Push neu und committet Änderungen.
- **Prüfen ohne zu schreiben:** `node scripts/build-index.mjs --check`

Icons: [Tabler Icons](https://tabler.io/icons), MIT-Lizenz (`assets/LICENSE-tabler-icons.txt`).
