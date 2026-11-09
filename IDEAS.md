# Ideen: geplant & verworfen

Ideen für neue Seiten oder Funktionen, die (noch) nicht umgesetzt sind – mit Begründung, damit dieselbe Frage nicht neu geklärt werden muss. Wird nicht veröffentlicht (`.md`).

Status: **geplant** (soll kommen), **zurückgestellt** (passt gerade nicht, später neu prüfen), **verworfen** (passt grundsätzlich nicht).

Neue Einträge oben; bei Umsetzung den Eintrag entfernen oder auf die App verweisen.

## Link-Kürzer – zurückgestellt (2026-11)

Kurze Links wie `phanlipo.github.io/go/abc`, die auf eine lange Adresse weiterleiten.

**Warum nicht jetzt:** GitHub Pages liefert nur statische Dateien aus und kann nichts speichern. Ein Kurzlink lässt sich deshalb nicht im Browser anlegen, jeder neue Link braucht einen Commit. Für eine Seite, die man auf dem Handy bedient, ist das zu umständlich.

**Geprüfte Wege:**

- **Feste Unterseiten (bester Weg):** Liste `go/links.json`, `build.mjs` erzeugt je Code `go/<code>/index.html` mit `<meta http-equiv="refresh" content="0; url=…">`, `noindex` und Link zum Antippen. Kommt ohne JavaScript aus und hat damit kein CSP-Problem. Meta-Refresh ist kein echtes HTTP 301, wegen `noindex` aber egal. Haken: neuer Link = Commit/PR.
- **URL-Parameter (`/go/?u=https://…`):** geht ohne Commit, macht den Link aber länger statt kürzer. Dazu ein offener Redirect: Fremde könnten Phishing hinter der eigenen Domain verstecken. Wenn überhaupt, dann nur mit Zwischenseite (Ziel anzeigen, Knopf *Weiter*, nur `http`/`https`). → verworfen.
- **Schreiben über die GitHub-API aus der Seite:** braucht einen Token mit Schreibrecht auf dem Gerät, eine `tool:connect`-Ausnahme und wegen des geschützten `main` einen PR. → verworfen.
- **Issue + GitHub Action:** Die App öffnet `github.com/…/issues/new?title=…&body=…`, eine Action prüft das Issue (nur vom Repo-Besitzer, nur `https`, Code frei), trägt den Link ein, mergt per PR und schließt das Issue. Kein Token auf dem Gerät, aber eine eigene Action mit Schreibrecht, und jeder Link braucht 2–3 Minuten.

**Neu prüfen, wenn:** Kurzlinks oft gebraucht werden (dann feste Unterseiten, ggf. mit Issue + Action) oder die Seite einen Speicher/Server bekommt.
