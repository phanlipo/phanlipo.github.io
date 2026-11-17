# Ideen: zurückgestellt & verworfen

Ideen für **neue Seiten** und Ideen, die **nicht zur Architektur passen** (statisch, ohne Server, offline, strenge CSP) – mit Begründung, damit dieselbe Frage nicht neu geklärt werden muss. Wird nicht veröffentlicht (`.md`).

Status: **geplant** (soll kommen), **zurückgestellt** (passt gerade nicht, später neu prüfen), **verworfen** (passt grundsätzlich nicht).

Neue Einträge oben. Umgesetzte Ideen hier entfernen; Stand, Entscheidungen und offene Erweiterungen einer bestehenden App stehen in `<app>/README.md`.

## Link-Kürzer – zurückgestellt (2026-11)

Kurze Links wie `phanlipo.github.io/go/abc`, die auf eine lange Adresse weiterleiten.

**Warum nicht jetzt:** GitHub Pages kann nichts speichern – ein Kurzlink lässt sich nicht im Browser anlegen, jeder neue Link braucht einen Commit. Für eine Handy-Seite zu umständlich.

**Geprüfte Wege:**

- **Feste Unterseiten (bester Weg):** `go/links.json`, `build.mjs` erzeugt je Code `go/<code>/index.html` mit Meta-Refresh, `noindex` und Link zum Antippen – ohne JavaScript, kein CSP-Problem. Haken: neuer Link = Commit/PR.
- **Issue + GitHub Action:** App öffnet `github.com/…/issues/new?…`, eine Action prüft (nur Repo-Besitzer, nur `https`), trägt ein, mergt per PR. Kein Token auf dem Gerät, aber eine Action mit Schreibrecht und 2–3 Minuten je Link.
- **URL-Parameter (`/go/?u=…`) – verworfen:** macht den Link länger und ist ein offener Redirect (Phishing hinter der eigenen Domain).
- **GitHub-API aus der Seite – verworfen:** Token mit Schreibrecht auf dem Gerät, `tool:connect`-Ausnahme, wegen geschütztem `main` trotzdem ein PR.

**Neu prüfen, wenn:** Kurzlinks oft gebraucht werden (dann feste Unterseiten, ggf. mit Issue + Action) oder die Seite einen Speicher/Server bekommt.
