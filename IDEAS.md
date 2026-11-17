# Ideen: zurückgestellt & verworfen

Ideen für **neue Seiten** und Ideen, die **nicht zur Architektur passen** (statisch, ohne Server, offline, strenge CSP) – mit Begründung, damit dieselbe Frage nicht neu geklärt werden muss. Wird nicht veröffentlicht (`.md`).

Status: **geplant** (soll kommen), **zurückgestellt** (passt gerade nicht, später neu prüfen), **verworfen** (passt grundsätzlich nicht).

Neue Einträge oben. Umgesetzte Ideen hier entfernen; Stand, Entscheidungen und offene Erweiterungen einer bestehenden App stehen in `<app>/README.md`.

## Quartett: mitgelieferte Kartenbilder – zurückgestellt (2026-11)

Bilder auf den Karten von `quartet` wie auf gedruckten Karten, von der Seite selbst ausgeliefert. (Flaggen und eigene Bilder des Nutzers gibt es schon, siehe `quartet/README.md`.)

**Warum nicht jetzt:**

- **Lizenzen:** Die Fotos in den Quelldaten sind die Hauptbilder der Wikipedia-Artikel – Urheber und Lizenz sind nicht gespeichert, meist ist Namensnennung Pflicht (CC BY-SA). Frei verwendbar wären nur selbst erzeugte Bilder (KI-Bilder, selbst gerenderte Karten/Farben).
- **Größe:** Alles im App-Ordner landet beim ersten Öffnen im Offline-Cache; rund 900 Bilder (je ca. 15 KB WebP) wären über 10 MB auf einmal.

**Weg, wenn es kommt:** Skript verkleinert die Bilder nach `quartet/img/<deck>/<Nr>.webp` mit `credits.json` (Urheber, Lizenz, Quelle; einmalig von Wikimedia Commons `extmetadata` – Datenabruf nur auf ausdrücklichen Wunsch, nur freie Lizenzen); `build.mjs` cacht `<app>/img/` erst bei Gebrauch (wie `precache: false`); Karte mit Bildnachweis-Zeile, Liste in der Hilfe.

**Neu prüfen, wenn:** die Lizenzdaten vorliegen oder zuerst nur die selbst erzeugten Bilder übernommen werden sollen.

## Code ausführen: Grenzen von `code-runner` (2026-11)

- **Bash/Shell – verworfen:** Echtes Bash gibt es im Browser nur mit einem ganzen Linux (v86, WebVM/CheerpX: viele MB Disk-Image, teils von fremden Servern, CheerpX nicht frei lizenziert) oder WASI-Laufzeiten mit eigenem Paket-Server. Eine nachgebaute Shell wäre kein Bash.
- **Sandbox per `<iframe sandbox>` – verworfen:** wäre dichter (`connect-src 'none'`), aber ein Frame ohne eigene Herkunft wird nicht vom Service Worker bedient (offline kaputt), und der Code läuft im Thread der Seite (Endlosschleife friert ein, kein *Stopp*).
- **`input()` mittendrin, `KeyboardInterrupt` – zurückgestellt:** braucht `SharedArrayBuffer`, also COOP/COEP-Header, die GitHub Pages nicht setzen kann. Deshalb Eingaben vorab.
- **Python-Pakete (numpy, pandas, matplotlib) – zurückgestellt:** Pyodide lädt sie von `cdn.jsdelivr.net` (fremder Server); möglich wären einzelne Wheels als eigene Vendor-Einträge (numpy allein ca. 3 MB) – erst bei Bedarf.

## Link-Kürzer – zurückgestellt (2026-11)

Kurze Links wie `phanlipo.github.io/go/abc`, die auf eine lange Adresse weiterleiten.

**Warum nicht jetzt:** GitHub Pages kann nichts speichern – ein Kurzlink lässt sich nicht im Browser anlegen, jeder neue Link braucht einen Commit. Für eine Handy-Seite zu umständlich.

**Geprüfte Wege:**

- **Feste Unterseiten (bester Weg):** `go/links.json`, `build.mjs` erzeugt je Code `go/<code>/index.html` mit Meta-Refresh, `noindex` und Link zum Antippen – ohne JavaScript, kein CSP-Problem. Haken: neuer Link = Commit/PR.
- **Issue + GitHub Action:** App öffnet `github.com/…/issues/new?…`, eine Action prüft (nur Repo-Besitzer, nur `https`), trägt ein, mergt per PR. Kein Token auf dem Gerät, aber eine Action mit Schreibrecht und 2–3 Minuten je Link.
- **URL-Parameter (`/go/?u=…`) – verworfen:** macht den Link länger und ist ein offener Redirect (Phishing hinter der eigenen Domain).
- **GitHub-API aus der Seite – verworfen:** Token mit Schreibrecht auf dem Gerät, `tool:connect`-Ausnahme, wegen geschütztem `main` trotzdem ein PR.

**Neu prüfen, wenn:** Kurzlinks oft gebraucht werden (dann feste Unterseiten, ggf. mit Issue + Action) oder die Seite einen Speicher/Server bekommt.
