# AGENTS.md

Hinweise für alle, die an diesem Repository arbeiten – Menschen wie KI-Agenten.

## Projekt

Statische Web-Tools auf GitHub Pages (https://phanlipo.github.io/). Kein Server; die veröffentlichten Seiten brauchen keine Pakete (`package.json` gibt es nur für die Tests). Jede Seite ist eine einzelne `index.html` in einem eigenen Ordner, wird hauptsächlich **auf dem Handy** benutzt und ist als **PWA** installierbar und offline nutzbar.

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
scripts/partials/data.html    Bereich „Daten sichern & übertragen“ (in jede App eingesetzt)
tests/                Playwright-Tests (siehe tests/README.md)
<tool-name>/          index.html + generiert: manifest.webmanifest, sw.js, icon-*
.githooks/pre-commit  ruft build.mjs vor jedem Commit auf
.github/workflows/build.yml         dasselbe bei jedem Push auf GitHub
.github/workflows/vendor-check.yml  prüft monatlich auf Bibliotheks-Updates und öffnet ein Issue
.github/workflows/test.yml          führt die Tests bei jedem PR und Push auf main aus
robots.txt            sperrt alle Crawler
```

## Neue Seite

1. `template/` nach `<tool-name>/` kopieren.
2. `<title>`, `<meta name="description">`, `tool:tags`, `tool:order`, `tool:short-name` (Name unter dem Home-Bildschirm-Icon, max. ca. 12 Zeichen) und `tool:storage` (Präfix der Speicher-Schlüssel, siehe „Daten sichern“) setzen. Aus diesen Angaben entstehen Karte, README-Eintrag und App-Manifest.
3. Icon wählen: `tool:icon` = Name eines [Tabler Icons](https://tabler.io/icons) (Outline), `tool:color` = Hintergrund- und Theme-Farbe. Dann `node scripts/build-icons.mjs <tool-name>` ausführen.
4. `node scripts/build.mjs` ausführen (macht auch der Git-Hook). Generierte Bereiche zwischen `<!-- tools/footer/head/data:start -->` und `…:end -->` sowie `manifest.webmanifest`, `sw.js` **nie von Hand** bearbeiten.

5. Fachliche Tests in `tests/<tool-name>.spec.mjs` anlegen. Die allgemeinen Prüfungen (Fehler, Layout, PWA, offline) greifen automatisch.

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
- **Bibliotheks-Updates:** Die Action „Vendor-Updates prüfen“ öffnet monatlich ein Issue. Aktualisieren mit `node scripts/vendor.mjs --update <name>`, bei Tabler danach `node scripts/build-icons.mjs`, dann `npm test`. Bei 0.x- oder Major-Sprüngen das Changelog lesen.
- **PWA / Offline:** `sw.js` cacht die Seite, `assets/base.css`, `assets/common.js`, Icons und jede genutzte Vendor-Bibliothek komplett. Die Cache-Version ist ein Hash dieser Dateien – Updates kommen automatisch. Lädt eine Seite zur Laufzeit weitere eigene Dateien, müssen sie unter `assets/vendor/` liegen oder in `build.mjs` (`precacheList`) ergänzt werden. Nie Daten an fremde Server senden – offline gibt es keine.
- **iPhone:** Eine zum Home-Bildschirm hinzugefügte App hat **eigenen Speicher**, getrennt von Safari.
- **Datenschutz:** keine Tracker, keine Analytics, keine Daten an Server senden (die Tests schlagen bei jeder Anfrage an eine fremde Domain fehl).
- **Tests:** Fehler nie durch Abschwächen, Überspringen oder Löschen eines Tests „beheben“. Erwartete Werte unabhängig nachrechnen.
- **Zahlen:** deutsch formatieren (`Tools.fmt`), Eingaben mit Komma und Punkt akzeptieren (`Tools.parseNum`).

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
- GitHub Pages veröffentlicht `main` direkt; ein Merge ist nach 1–2 Minuten live.
- Hook einmalig aktivieren: `git config core.hooksPath .githooks`
