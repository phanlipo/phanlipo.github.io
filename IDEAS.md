# Ideen: geplant & verworfen

Ideen für neue Seiten oder Funktionen, die (noch) nicht umgesetzt sind – mit Begründung, damit dieselbe Frage nicht neu geklärt werden muss. Wird nicht veröffentlicht (`.md`).

Status: **geplant** (soll kommen), **zurückgestellt** (passt gerade nicht, später neu prüfen), **verworfen** (passt grundsätzlich nicht).

Neue Einträge oben; bei Umsetzung den Eintrag entfernen oder auf die App verweisen.

## Auf Fernseher streamen (Chromecast / Android TV) – teilweise umgesetzt (2026-11)

Ziel: Bild einer App live mit Musik auf Chromecast oder Android TV.

**Umgesetzt (`cast-demo`):** Übertragen wird mit der eingebauten Bildschirmübertragung des Handys (Android *Bildschirm übertragen* / *Smart View* / Google-Home-App; Chrome am Computer *Tab streamen*; iPhone nur AirPlay). Die App bereitet nur das Bild vor: Vollbild ohne Leisten, Querformat (`screen.orientation.lock`), Bildschirm bleibt an (Wake Lock), Leiste blendet sich aus. Ein Link `intent:#Intent;action=android.settings.CAST_SETTINGS;end` versucht, die Übertragungs-Einstellung direkt zu öffnen; öffnet Chrome sie nicht (Seite bleibt sichtbar), erscheint ein Hinweis. Baustein `cast-demo/tv.js` (`TvMode`) ohne eigenes DOM – nach erfolgreichem Test nach `assets/shared/` verschieben und in andere Apps einbauen (z. B. als Eintrag im Menü). Kein Code fürs Netz, keine Anmeldung, geht für jede App, wie sie ist.

**Grenzen:** Die Seite kann die Übertragung nicht selbst starten. Es wird der ganze Bildschirm gespiegelt (auch Benachrichtigungen). Verzögerung ca. 0,5–1 s. Ton erst ab Android 10. Ob der `intent:`-Link aus Chrome die Einstellungen öffnet, ist offen (Chrome lässt aus Webseiten nur bestimmte Intents zu) – auf dem Gerät testen.

**Geprüft und zurückgestellt: eigener Stream per Cast-SDK + WebRTC.** Die App zeichnet in ein `<canvas>`, Musik per Web Audio, beides als WebRTC-Stream direkt im WLAN an eine eigene Empfänger-Seite auf dem Fernseher (Cast „Custom Web Receiver“), Verbindungsaufbau über den Cast-Nachrichtenkanal. Prototyp im Verlauf des Branches `claude/cast-demo-architecture-xx50be` (Commit „WIP: Cast-Demo“). Gründe:
- Eigene Empfänger brauchen eine App-ID aus der Google Cast SDK Developer Console (5 US-Dollar), und solange sie nicht veröffentlicht ist, muss jedes Gerät per Seriennummer eingetragen werden.
- Sender- und Empfänger-SDK müssen von `www.gstatic.com` geladen werden (nicht als Vendor-Bibliothek möglich) – Ausnahme von CSP und „keine fremden Server“.
- Chrome auf Android kann den Bildschirm nicht aufnehmen (`getDisplayMedia` fehlt) – nur Apps, die ihr Bild in ein Canvas zeichnen, wären streambar, DOM-Apps nicht.
- Ungewiss: WebRTC-Verbindung im WLAN mit mDNS-Kandidaten auf dem Chromecast, Tonqualität (Opus-Stereo per SDP).

**Weitere geprüfte Wege:** *Remote Playback API* (`video.remote.prompt()`, Chrome Android, ohne Anmeldung) spielt nur eine Datei-URL auf dem Fernseher ab – kein Live-Bild. *Presentation API* mit `https:`-Adresse rendert nur Chrome am Computer selbst und spiegelt sie; auf Android nur mit Cast-App-ID.

**Neu prüfen, wenn:** eine App ein **anderes** Bild auf dem Fernseher als auf dem Handy braucht (z. B. Spiel mit Fernseher als Spielbrett, Handy als Controller) – dann lohnt der eigene Empfänger.

## Link-Kürzer – zurückgestellt (2026-11)

Kurze Links wie `phanlipo.github.io/go/abc`, die auf eine lange Adresse weiterleiten.

**Warum nicht jetzt:** GitHub Pages liefert nur statische Dateien aus und kann nichts speichern. Ein Kurzlink lässt sich deshalb nicht im Browser anlegen, jeder neue Link braucht einen Commit. Für eine Seite, die man auf dem Handy bedient, ist das zu umständlich.

**Geprüfte Wege:**

- **Feste Unterseiten (bester Weg):** Liste `go/links.json`, `build.mjs` erzeugt je Code `go/<code>/index.html` mit `<meta http-equiv="refresh" content="0; url=…">`, `noindex` und Link zum Antippen. Kommt ohne JavaScript aus und hat damit kein CSP-Problem. Meta-Refresh ist kein echtes HTTP 301, wegen `noindex` aber egal. Haken: neuer Link = Commit/PR.
- **URL-Parameter (`/go/?u=https://…`):** geht ohne Commit, macht den Link aber länger statt kürzer. Dazu ein offener Redirect: Fremde könnten Phishing hinter der eigenen Domain verstecken. Wenn überhaupt, dann nur mit Zwischenseite (Ziel anzeigen, Knopf *Weiter*, nur `http`/`https`). → verworfen.
- **Schreiben über die GitHub-API aus der Seite:** braucht einen Token mit Schreibrecht auf dem Gerät, eine `tool:connect`-Ausnahme und wegen des geschützten `main` einen PR. → verworfen.
- **Issue + GitHub Action:** Die App öffnet `github.com/…/issues/new?title=…&body=…`, eine Action prüft das Issue (nur vom Repo-Besitzer, nur `https`, Code frei), trägt den Link ein, mergt per PR und schließt das Issue. Kein Token auf dem Gerät, aber eine eigene Action mit Schreibrecht, und jeder Link braucht 2–3 Minuten.

**Neu prüfen, wenn:** Kurzlinks oft gebraucht werden (dann feste Unterseiten, ggf. mit Issue + Action) oder die Seite einen Speicher/Server bekommt.
