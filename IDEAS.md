# Ideen: geplant & verworfen

Ideen für neue Seiten oder Funktionen, die (noch) nicht umgesetzt sind – mit Begründung, damit dieselbe Frage nicht neu geklärt werden muss. Wird nicht veröffentlicht (`.md`).

Status: **geplant** (soll kommen), **zurückgestellt** (passt gerade nicht, später neu prüfen), **verworfen** (passt grundsätzlich nicht).

Neue Einträge oben; bei Umsetzung den Eintrag entfernen oder auf die App verweisen.

## Auf Fernseher streamen (Chromecast / Android TV) – im Test (2026-11)

Ziel: Bild einer App live mit Musik auf Chromecast oder Android TV. `cast-demo` bietet zwei Wege zum Vergleich; danach entscheiden, was in andere Apps kommt.

**1. Bildschirm übertragen (für jede App):** eingebaute Übertragung des Handys (Android *Bildschirm übertragen* / *Smart View* / Google-Home-App; Chrome am Computer *Tab streamen*; iPhone nur AirPlay). Die App bereitet nur das Bild vor: Vollbild, Querformat (`screen.orientation.lock`), Bildschirm bleibt an, Leiste blendet sich aus – Baustein `cast-demo/tv.js` (`TvMode`). Ein Link `intent:#Intent;action=android.settings.CAST_SETTINGS;end` versucht, die Einstellung direkt zu öffnen, sonst Hinweis. Grenzen: Seite kann die Übertragung nicht selbst starten, spiegelt alles (auch Benachrichtigungen), Ton erst ab Android 10. Offen: ob Chrome den `intent:`-Link öffnet.

**2. Direkt streamen (nur Apps mit Canvas-Bild):** `assets/shared/cast.js` (`CastStream`). Die App zeichnet in ein `<canvas>`, Musik per Web Audio; beides als WebRTC-Stream direkt im WLAN an die Empfänger-Seite `assets/shared/cast-receiver.html` auf dem Fernseher. Die Empfänger-App ist in der Google Cast SDK Developer Console registriert („phanlipo.github.io“, App-ID `B72055BC`, Custom Receiver mit dieser Adresse); solange sie nicht veröffentlicht ist, nur auf dort eingetragenen Geräten. Der Cast-Nachrichtenkanal trägt nur Angebot/Antwort (ohne Trickle-ICE) und Status. Opus-Stereo mit Musik-Bitrate per SDP. Vorteile: ein Tippen, Fernseher zeigt nur das App-Bild, Handy frei für Bedienung.
- Ausnahme von den Regeln: Sender- und Empfänger-SDK nur von `www.gstatic.com` (nicht als Vendor-Bibliothek). Die App lädt es erst beim Tippen auf *Direkt streamen*; `<meta name="tool:cast" content="true">` erlaubt es in der CSP (`build.mjs`). Optional STUN-Server von Google (Schalter, aus).
- Chrome auf Android kann den Bildschirm nicht aufnehmen (`getDisplayMedia` fehlt) – DOM-Apps lassen sich so nicht streamen, nur was ins Canvas gezeichnet wird.
- Offen bis zum Gerätetest: WebRTC im WLAN mit mDNS-Kandidaten auf dem Chromecast, Tonqualität, Verzögerung.
- Lohnt sich besonders, wenn der Fernseher ein **anderes** Bild zeigen soll als das Handy (Spiel mit Fernseher als Spielbrett, Handy als Controller).

**Weitere geprüfte Wege:** *Remote Playback API* (`video.remote.prompt()`, Chrome Android, ohne Anmeldung) spielt nur eine Datei-URL auf dem Fernseher ab – kein Live-Bild. *Presentation API* mit `https:`-Adresse rendert nur Chrome am Computer selbst und spiegelt sie; auf Android nur mit Cast-App-ID.

## Link-Kürzer – zurückgestellt (2026-11)

Kurze Links wie `phanlipo.github.io/go/abc`, die auf eine lange Adresse weiterleiten.

**Warum nicht jetzt:** GitHub Pages liefert nur statische Dateien aus und kann nichts speichern. Ein Kurzlink lässt sich deshalb nicht im Browser anlegen, jeder neue Link braucht einen Commit. Für eine Seite, die man auf dem Handy bedient, ist das zu umständlich.

**Geprüfte Wege:**

- **Feste Unterseiten (bester Weg):** Liste `go/links.json`, `build.mjs` erzeugt je Code `go/<code>/index.html` mit `<meta http-equiv="refresh" content="0; url=…">`, `noindex` und Link zum Antippen. Kommt ohne JavaScript aus und hat damit kein CSP-Problem. Meta-Refresh ist kein echtes HTTP 301, wegen `noindex` aber egal. Haken: neuer Link = Commit/PR.
- **URL-Parameter (`/go/?u=https://…`):** geht ohne Commit, macht den Link aber länger statt kürzer. Dazu ein offener Redirect: Fremde könnten Phishing hinter der eigenen Domain verstecken. Wenn überhaupt, dann nur mit Zwischenseite (Ziel anzeigen, Knopf *Weiter*, nur `http`/`https`). → verworfen.
- **Schreiben über die GitHub-API aus der Seite:** braucht einen Token mit Schreibrecht auf dem Gerät, eine `tool:connect`-Ausnahme und wegen des geschützten `main` einen PR. → verworfen.
- **Issue + GitHub Action:** Die App öffnet `github.com/…/issues/new?title=…&body=…`, eine Action prüft das Issue (nur vom Repo-Besitzer, nur `https`, Code frei), trägt den Link ein, mergt per PR und schließt das Issue. Kein Token auf dem Gerät, aber eine eigene Action mit Schreibrecht, und jeder Link braucht 2–3 Minuten.

**Neu prüfen, wenn:** Kurzlinks oft gebraucht werden (dann feste Unterseiten, ggf. mit Issue + Action) oder die Seite einen Speicher/Server bekommt.
