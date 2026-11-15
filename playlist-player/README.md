# Playlist-Player

YouTube-Playlists wie ein Hörbuch hören: Teil für Teil, Weiterhören an der letzten Stelle, Häkchen mit Datum, Verlauf.

## Aufbau

- `index.html` – Oberfläche, Speicher, Verlauf, Schlaf-Timer, Wake Lock, Media Session, WebMCP.
- `logic.js` (`window.PlaylistLogic`) – ohne DOM: Playlist-ID aus Links/geteiltem Text, Abgleich der Teile mit der Reihenfolge des Players, „gehört“-Regel (Ende oder < 10 s / 2 % übrig), Weiterhör-Punkt, Verlaufsabschnitte (≥ 10 s, Fortsetzungen werden zusammengefasst).
- `yt.js` (`window.YtEmbed`) – YouTube-Player als iframe (`www.youtube-nocookie.com/embed/…?enablejsapi=1&origin=…`), gesteuert über das postMessage-Protokoll der offiziellen IFrame-API (`listening` → `initialDelivery`/`onReady`, `command`, `infoDelivery`, `onStateChange`/`onError`/`onPlaybackRateChange` nach `addEventListener`). So läuft kein Skript von YouTube in der Seite und die CSP bleibt bei eigenen Skripten. Mit der Einstellung „Mit YouTube-Konto abspielen“ (`settings.account`) kommt der Player von `www.youtube.com`, damit die Anmeldung im Browser (Premium: keine Werbung) gilt; oEmbed bleibt bei `youtube-nocookie.com`. Werbung wird nie übersprungen oder blockiert.

## Daten

`playlist-player.data.v1` (Playlists mit Teilen: ID, Titel, Kanal, Länge, Position, gehört + Datum, zuletzt gehört), `playlist-player.settings.v1` (Tempo, Bildschirm anlassen, mit YouTube-Konto), `playlist-player.history.v1` (max. 300 Abschnitte).

## Grenzen

- Der Player meldet nur die Video-IDs der Playlist; Titel kommen per oEmbed (`youtube-nocookie.com/oembed`, CORS erlaubt), die Länge erst beim Abspielen.
- Hintergrund-/Sperrbildschirm-Wiedergabe bestimmen YouTube und der Browser.
- YouTube verlangt von Rechenzentrums-IPs (CI, Cloud) oft eine Anmeldung (`videoData.errorCode: "auth"`) – echte Wiedergabe lässt sich dort nicht testen, deshalb `tests/fake-youtube.mjs`.
