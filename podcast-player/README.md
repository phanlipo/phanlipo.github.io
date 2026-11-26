# Podcast-Player

Podcasts hören: ARD-Sendungen (ARD Audiothek / ARD Sounds) per Link oder beliebige RSS-Podcast-Feeds, Folgen abspielen und weiterhören, Skript (Transkript) mitlesen, eine Sendung als RSS-Feed speichern.

## Dateien

- `podcast.js` (`window.Podcast`) – ohne DOM-Zustand und ohne Netz: Eingaben erkennen (Link, URN, Feed), Abfragen an die ARD-Schnittstelle bauen, ARD-Antworten und RSS-Feeds in Folgen umwandeln, Transkripte lesen (ARD-JSON, WebVTT, SRT, Podcast-JSON, HTML, Text), RSS-Feed erzeugen.
- `index.html` – Oberfläche, Speicher, Abrufe, Player, Skript-Ansicht, WebMCP.

## ARD Audiothek

- GraphQL unter `https://api.ardaudiothek.de/graphql`, erreichbar per **GET** (`?query=…&variables=…`) – damit keine Preflight-Anfrage; die Schnittstelle erlaubt CORS für alle (`Access-Control-Allow-Origin: *`). Es braucht keinen Proxy und keinen eigenen Server (anders als das PHP-Skript [ARD-Audiothek-RSS](https://thmsnhl.de/projekte/ard-audiothek-rss/), dessen Aufgabe die App im Browser übernimmt).
- Sendung: `show(id)` mit URN (`urn:ard:show:…`) oder der alten Nummer; die neuesten 300 Folgen (`items(first:300)`). Ein Folgen-Link wird über `item(id){ showId }` zur Sendung aufgelöst.
- Audio: von `audios` bevorzugt MP3, sonst die erste https-Adresse. Folgen ohne Audio fehlen in der Liste.
- Skript: `transcript{ itemId }` zeigt nur, dass es eins gibt; der Text kommt beim Öffnen über `item(id){ transcript{ data } }` – eine Liste mit `start`/`end` („00:01:02.500“), `text` und `speaker.id` (Namen sind „unknown“, angezeigt als „Stimme n“). `data` kann trotz Eintrag leer sein → „kein Skript“.

## RSS-Feeds

Wie im RSS-Reader: direkt, und wenn der Browser es nicht darf (CORS) über den eigenen Proxy aus den Einstellungen (pro Podcast gemerkt, `viaProxy`). Transkripte aus `podcast:transcript` (bevorzugt VTT/SRT mit Zeiten) auf demselben Weg.

## Audio und CSP

Audio kommt von beliebigen https-Servern: `<meta name="tool:media" content="https:">` erweitert `media-src` (siehe `scripts/build.mjs`). `src` wird erst beim Tippen auf Abspielen gesetzt (`preload="none"`), nach einem Neuladen steht der Player mit gespeicherter Stelle bereit, ohne Anfrage. Der Service Worker lässt fremde Adressen durch (Bereichsanfragen beim Streamen).

## Speicher

Schlüssel und Formate stehen oben im Seiten-Skript (`podcast-player.*.v1`). Stelle je Folge alle 5 s, bei Pause, beim Verlassen und am Ende; höchstens 500 Folgen. Transkripte nur im Speicher der Seite.

## Tests

`tests/podcast-player.spec.mjs` mit den Stellvertretern aus `tests/podcast-mock.mjs` (ARD-Schnittstelle, Feeds, Proxy, Audio als stille WAV-Datei); WebMCP in `tests/webmcp.spec.mjs`.
