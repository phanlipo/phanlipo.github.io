# AGENTS.md

Hinweise für alle, die an diesem Repository arbeiten – Menschen wie KI-Agenten.

## Projekt

Statische Web-Tools auf GitHub Pages (https://phanlipo.github.io/). Kein Server, kein Build-Schritt, keine Paketverwaltung. Jede Seite ist eine einzelne `index.html` in einem eigenen Ordner und wird hauptsächlich **auf dem Handy** benutzt.

```
index.html            Startseite – die Kartenliste ist generiert
assets/base.css       Design-Tokens, Dark Mode, Karten, Buttons, Toast, Hilfe-Bereich
assets/common.js      window.Tools: $, load, save, remove, toast, esc, copyText, fmt, parseNum
template/             Vorlage für neue Seiten (wird nicht gelistet)
scripts/build-index.mjs  erzeugt Seitenliste (index.html, README.md) und gemeinsame Fußzeile
scripts/build-icons.mjs  erzeugt icon.svg + icon-180.png je Seite (Tabler Icons)
scripts/partials/footer.html  Text der gemeinsamen Fußzeile
<tool-name>/index.html   ein Tool
.githooks/pre-commit  ruft build-index.mjs vor jedem Commit auf
.github/workflows/tool-index.yml  dasselbe bei jedem Push auf GitHub
robots.txt            sperrt alle Crawler
```

## Neue Seite

1. `template/` nach `<tool-name>/` kopieren.
2. `<title>`, `<meta name="description">`, `tool:tags` und `tool:order` setzen. Aus diesen Angaben entstehen Karte und README-Eintrag.
3. Icon wählen: `tool:icon` = Name eines [Tabler Icons](https://tabler.io/icons) (Outline), `tool:color` = Hintergrundfarbe. Dann `node scripts/build-icons.mjs <tool-name>` ausführen.
4. `node scripts/build-index.mjs` ausführen (macht auch der Git-Hook). Generierte Bereiche zwischen `<!-- tools:start/end -->` und `<!-- footer:start/end -->` **nie von Hand** bearbeiten.

Seiten, die nicht gelistet werden sollen (z. B. Weiterleitungen), bekommen `<meta name="tool:hidden" content="true">`.

## Konventionen

- **Ordnernamen:** Englisch, klein, kebab-case, ohne Umlaute (`brew-calculator`). Die Oberfläche selbst ist **Deutsch**.
- **Umbenennen:** Im alten Ordner eine Weiterleitungsseite lassen (siehe `Wuerfel-Muenze/index.html`), damit Lesezeichen weiter funktionieren.
- **Gemeinsame Basis nutzen:** `../assets/base.css` zuerst einbinden, `../assets/common.js` vor dem Seiten-Script. Im Seiten-CSS nur seitenspezifische Regeln; eigene Akzentfarbe über `--accent` / `--accent-text` (hell und dunkel).
- **Gemeinsames ändern = alle Seiten prüfen.** Eine Änderung in `assets/` wirkt sofort auf jedes Tool.
- **Mobile-first:** muss bei 375 px Breite ohne seitliches Scrollen funktionieren. Touch-Ziele mindestens 44 px, Eingabefelder 16 px Schrift (sonst zoomt iOS).
- **Dark Mode:** nur Farben aus den Tokens verwenden, keine festen Farben für Flächen und Text.
- **Hilfe:** Anleitung als `<details class="help card">` am Ende der Seite, standardmäßig eingeklappt.
- **Fußzeile:** `<footer>` mit optionaler seitenspezifischer Zeile `<p>…</p>`, darunter die Marker `<!-- footer:start -->` / `<!-- footer:end -->`. Den gemeinsamen Text (inkl. Hinweis „KI-generiert“) nur in `scripts/partials/footer.html` ändern.
- **Icons:** nur frei lizenzierte Icons (aktuell Tabler Icons, MIT – Lizenz in `assets/LICENSE-tabler-icons.txt`). Jede Seite hat eine eigene Farbe.
- **Speicher:** nur über `Tools.load` / `Tools.save` (fangen Fehler im privaten Modus ab). Schlüssel für neue Tools: `<tool-name>.<was>.v1`. **Bestehende Schlüssel nie umbenennen** – sonst sind Einstellungen und Verläufe der Nutzer weg (`scanCopySecurPharm.*`, `wuerfelMuenze.*`, `brauRechner.*`).
- **Externe Bibliotheken:** nur mit fester Version von cdnjs oder jsdelivr. Die Seite soll ohne die Bibliothek wenigstens teilweise nutzbar bleiben.
- **Datenschutz:** keine Tracker, keine Analytics, keine Daten an Server senden.
- **Zahlen:** deutsch formatieren (`Tools.fmt`), Eingaben mit Komma und Punkt akzeptieren (`Tools.parseNum`).

## Prüfen vor dem Commit

- Seite lädt ohne JavaScript-Fehler.
- Bei 375 px und bei Desktop-Breite kein horizontales Scrollen.
- Hell und dunkel ansehen.
- `node scripts/build-index.mjs --check` meldet „up to date“.

## Git

- Änderungen über einen Pull Request auf `main`, Squash-Merge.
- GitHub Pages veröffentlicht `main` direkt; ein Merge ist nach 1–2 Minuten live.
- Hook einmalig aktivieren: `git config core.hooksPath .githooks`
