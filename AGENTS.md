# AGENTS.md

Hinweise für alle, die an diesem Repository arbeiten – Menschen wie KI-Agenten.

## Projekt

Statische Web-Tools auf GitHub Pages (https://phanlipo.github.io/). Kein Server, keine Paketverwaltung. Jede Seite ist eine einzelne `index.html` in einem eigenen Ordner, wird hauptsächlich **auf dem Handy** benutzt und ist als **PWA** installierbar und offline nutzbar.

```
index.html            Startseite – die Kartenliste ist generiert
assets/base.css       Design-Tokens, Dark Mode, Karten, Buttons, Toast, Hilfe-Bereich
assets/common.js      window.Tools: $, load, save, remove, toast, esc, copyText, fmt, parseNum; registriert den Service Worker
assets/vendor/        Fremdbibliotheken mit LICENSE + SOURCE.md je Ordner (generiert, nicht von Hand ändern)
template/             Vorlage für neue Seiten (wird nicht gelistet)
scripts/build.mjs     erzeugt Seitenliste, Fußzeile, <head>-Links, manifest.webmanifest + sw.js je App
scripts/build-icons.mjs  erzeugt icon.svg und PNG-Icons (180/192/512/maskable) je Seite (Tabler Icons)
scripts/vendor.mjs    lädt Bibliotheken aus scripts/vendor.json nach assets/vendor/, prüft auf Updates
scripts/partials/footer.html  Text der gemeinsamen Fußzeile
<tool-name>/          index.html + generiert: manifest.webmanifest, sw.js, icon-*
.githooks/pre-commit  ruft build.mjs vor jedem Commit auf
.github/workflows/build.yml         dasselbe bei jedem Push auf GitHub
.github/workflows/vendor-check.yml  prüft monatlich auf Bibliotheks-Updates und öffnet ein Issue
robots.txt            sperrt alle Crawler
```

## Neue Seite

1. `template/` nach `<tool-name>/` kopieren.
2. `<title>`, `<meta name="description">`, `tool:tags`, `tool:order` und `tool:short-name` (Name unter dem Home-Bildschirm-Icon, max. ca. 12 Zeichen) setzen. Aus diesen Angaben entstehen Karte, README-Eintrag und App-Manifest.
3. Icon wählen: `tool:icon` = Name eines [Tabler Icons](https://tabler.io/icons) (Outline), `tool:color` = Hintergrund- und Theme-Farbe. Dann `node scripts/build-icons.mjs <tool-name>` ausführen.
4. `node scripts/build.mjs` ausführen (macht auch der Git-Hook). Generierte Bereiche zwischen `<!-- tools/footer/head:start -->` und `…:end -->` sowie `manifest.webmanifest`, `sw.js` **nie von Hand** bearbeiten.

Seiten, die nicht gelistet werden sollen (z. B. Weiterleitungen), bekommen `<meta name="tool:hidden" content="true">`.

## Konventionen

- **Ordnernamen:** Englisch, klein, kebab-case, ohne Umlaute (`brew-calculator`). Die Oberfläche selbst ist **Deutsch**.
- **Umbenennen:** Sobald eine Seite geteilt wurde, im alten Ordner eine kleine Weiterleitungsseite lassen (`<meta http-equiv="refresh">` + `<meta name="tool:hidden" content="true">`), damit Links weiter funktionieren.
- **Gemeinsame Basis nutzen:** `../assets/base.css` zuerst einbinden, `../assets/common.js` vor dem Seiten-Script. Im Seiten-CSS nur seitenspezifische Regeln; eigene Akzentfarbe über `--accent` / `--accent-text` (hell und dunkel).
- **Gemeinsames ändern = alle Seiten prüfen.** Eine Änderung in `assets/` wirkt sofort auf jedes Tool.
- **Mobile-first:** muss bei 375 px Breite ohne seitliches Scrollen funktionieren. Touch-Ziele mindestens 44 px, Eingabefelder 16 px Schrift (sonst zoomt iOS).
- **Dark Mode:** nur Farben aus den Tokens verwenden, keine festen Farben für Flächen und Text.
- **Hilfe:** Anleitung als `<details class="help card">` am Ende der Seite, standardmäßig eingeklappt.
- **Fußzeile:** `<footer>` mit optionaler seitenspezifischer Zeile `<p>…</p>`, darunter die Marker `<!-- footer:start -->` / `<!-- footer:end -->`. Den gemeinsamen Text (inkl. Hinweis „KI-generiert“, ohne Namen eines bestimmten KI-Anbieters) nur in `scripts/partials/footer.html` ändern.
- **Icons:** nur frei lizenzierte Icons (aktuell Tabler Icons, MIT – Version und Lizenz in `assets/vendor/tabler-icons/`). Jede Seite hat eine eigene Farbe.
- **Speicher:** nur über `Tools.load` / `Tools.save` (fangen Fehler im privaten Modus ab). Schlüssel für neue Tools: `<tool-name>.<was>.v1`. **Bestehende Schlüssel nie umbenennen** – sonst sind Einstellungen und Verläufe der Nutzer weg (`scanCopySecurPharm.*`, `wuerfelMuenze.*`, `brauRechner.*`).
- **Externe Bibliotheken:** nie per CDN einbinden, sondern in `scripts/vendor.json` eintragen (npm-Paket, feste Version, Lizenz, Dateien) und `node scripts/vendor.mjs` ausführen. Eingebunden wird aus `../assets/vendor/<name>/`. Lädt eine Bibliothek selbst weitere Dateien nach (z. B. `.wasm`), den Pfad auf `assets/vendor` umbiegen. Nur Lizenzen, die Weitergabe erlauben (MIT, Apache-2.0, BSD …).
- **Bibliotheks-Updates:** Die Action „Vendor-Updates prüfen“ öffnet monatlich ein Issue. Aktualisieren mit `node scripts/vendor.mjs --update <name>`, dann die Seiten aus der Spalte „Zweck“ in `assets/vendor/README.md` testen. Bei 0.x- oder Major-Sprüngen das Changelog lesen.
- **PWA / Offline:** `sw.js` cacht die Seite, `assets/base.css`, `assets/common.js`, Icons und jede genutzte Vendor-Bibliothek komplett. Die Cache-Version ist ein Hash dieser Dateien – Updates kommen automatisch. Lädt eine Seite zur Laufzeit weitere eigene Dateien, müssen sie unter `assets/vendor/` liegen oder in `build.mjs` (`precacheList`) ergänzt werden. Nie Daten an fremde Server senden – offline gibt es keine.
- **iPhone:** Eine zum Home-Bildschirm hinzugefügte App hat **eigenen Speicher**, getrennt von Safari.
- **Datenschutz:** keine Tracker, keine Analytics, keine Daten an Server senden.
- **Zahlen:** deutsch formatieren (`Tools.fmt`), Eingaben mit Komma und Punkt akzeptieren (`Tools.parseNum`).

## Prüfen vor dem Commit

- Seite lädt ohne JavaScript-Fehler.
- Bei 375 px und bei Desktop-Breite kein horizontales Scrollen.
- Hell und dunkel ansehen.
- `node scripts/build.mjs --check` meldet „Up to date“.
- Offline: Seite einmal laden, Netz trennen, neu laden – muss vollständig funktionieren.

## Git

- Änderungen über einen Pull Request auf `main`, Squash-Merge.
- GitHub Pages veröffentlicht `main` direkt; ein Merge ist nach 1–2 Minuten live.
- Hook einmalig aktivieren: `git config core.hooksPath .githooks`
