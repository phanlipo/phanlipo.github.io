# Auf Fernseher streamen – im Test

Ziel: Bild einer App live mit Musik auf Chromecast oder Android TV. `cast-demo` bietet zwei Wege zum Vergleich; danach entscheiden, was in andere Apps kommt.

## 1. Bildschirm übertragen (für jede App)

Eingebaute Übertragung des Handys (Android *Bildschirm übertragen* / *Smart View* / Google-Home-App; Chrome am Computer *Tab streamen*; iPhone nur AirPlay). Die App bereitet nur das Bild vor: Vollbild, Querformat (`screen.orientation.lock`), Bildschirm bleibt an, Leiste blendet sich aus – Baustein `tv.js` (`TvMode`). Ein Link `intent:#Intent;action=android.settings.CAST_SETTINGS;end` versucht, die Einstellung direkt zu öffnen, sonst Hinweis.

Grenzen: Die Seite kann die Übertragung nicht selbst starten, spiegelt alles (auch Benachrichtigungen), Ton erst ab Android 10. Offen: ob Chrome den `intent:`-Link öffnet.

## 2. Direkt streamen (nur Apps mit Canvas-Bild)

`assets/shared/cast.js` (`CastStream`): Die App zeichnet in ein `<canvas>`, Musik per Web Audio; beides als WebRTC-Stream direkt im WLAN an `assets/shared/cast-receiver.html` auf dem Fernseher. Die Empfänger-App ist in der Google Cast SDK Developer Console registriert („phanlipo.github.io“, App-ID `B72055BC`, Custom Receiver mit dieser Adresse); solange sie nicht veröffentlicht ist, nur auf dort eingetragenen Geräten. Der Cast-Nachrichtenkanal trägt nur Angebot/Antwort (ohne Trickle-ICE) und Status. Opus-Stereo mit Musik-Bitrate per SDP. Vorteile: ein Tippen, Fernseher zeigt nur das App-Bild, Handy frei für Bedienung.

- Ausnahme von den Regeln: Sender- und Empfänger-SDK nur von `www.gstatic.com` (nicht als Vendor-Bibliothek), erst beim Tippen auf *Direkt streamen* geladen; `<meta name="tool:cast" content="true">` erlaubt es in der CSP (`build.mjs`). Optional STUN-Server von Google (Schalter, aus).
- Chrome auf Android kann den Bildschirm nicht aufnehmen (`getDisplayMedia` fehlt) – DOM-Apps lassen sich so nicht streamen, nur was ins Canvas gezeichnet wird.
- Offen bis zum Gerätetest: WebRTC im WLAN mit mDNS-Kandidaten auf dem Chromecast, Tonqualität, Verzögerung.
- Lohnt sich besonders, wenn der Fernseher ein **anderes** Bild zeigen soll als das Handy (Fernseher als Spielbrett, Handy als Controller).

## Geprüft und nicht geeignet

- *Remote Playback API* (`video.remote.prompt()`, Chrome Android): spielt nur eine Datei-URL auf dem Fernseher ab – kein Live-Bild.
- *Presentation API* mit `https:`-Adresse: rendert nur Chrome am Computer selbst und spiegelt sie; auf Android nur mit Cast-App-ID.
