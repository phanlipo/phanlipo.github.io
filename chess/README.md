# Schach – Aufbau

Schach gegen den Computer (vier Stärken) oder zu zweit an einem Handy. Alles läuft im Browser, ohne Bibliothek.

## Dateien

| Datei | Inhalt |
|---|---|
| `engine.js` | Regeln, Notation und Computer **ohne DOM** (`window.Chess` bzw. `self.Chess` im Worker). Wird von der Seite und vom Worker geladen und in `tests/chess.spec.mjs` direkt in Node geprüft. |
| `ai-worker.js` | Startet die Suche im Hintergrund (`importScripts('engine.js')`), damit das Brett beim Rechnen bedienbar bleibt. Nachricht rein: `{ id, fen, moves, level }`, raus: `{ id, uci, depth, nodes, ms }` oder `{ id, error }`. |
| `index.html` | Oberfläche: Brett, Spielerleisten, Zugliste, Menü, Umwandlungsdialog, WebMCP. Die Figuren sind eigene SVG-Zeichnungen (`<symbol id="pc-…">`, Füllung/Kontur über `.pc.w`/`.pc.b`, Details mit `currentColor`) – keine Emoji, kein fremder Figurensatz. |

## Engine

- **Brett:** 0x88 (`Int8Array(128)`, a1 = 0, a8 = 112), Figuren als vorzeichenbehaftete Zahlen (1 Bauer … 6 König, positiv Weiß). Nach außen nur Feldnamen (`e4`), UCI (`e2e4`, `e7e8q`) und SAN.
- **Züge:** pseudo-legal erzeugen, nach `make` prüfen, ob der eigene König angegriffen ist; `unmake` aus einem Verlaufsstapel. Geprüft per Perft gegen die veröffentlichten Zahlen (Startstellung, „Kiwipete“, Stellungen 3–5).
- **En passant** wird nur gesetzt, wenn ein gegnerischer Bauer daneben steht – so stimmen Stellungswiederholungen.
- **`Game`:** Stellung mit Zugliste, SAN (mit Eindeutigmachung, `+`/`#`), Ergebnis: Matt, Patt, dreifache Wiederholung, 50-Züge-Regel (automatisch), zu wenig Material, Aufgeben, vereinbartes Remis. `pgn()` für den Export (immer englische Buchstaben).
- **Suche:** Negamax mit Alpha-Beta, iterativer Vertiefung, Ruhesuche (Schlagzüge, Umwandlungen), Schach-Verlängerung (begrenzt), Killerzügen und MVV-LVA-Sortierung; Wiederholungen in der Suche per Zobrist-Hash zählen als Remis. Bewertung: Material, Figur-Feld-Tabellen, König mit Übergang ins Endspiel, Läuferpaar, im Endspiel mit Vorsprung „König an den Rand“.
- **Stärken** (`LEVELS`): Leicht 1 Halbzug ohne Ruhesuche, ±180 Zufall; Mittel 2 + Ruhesuche, ±45; Stark 3, ±12; Profi so tief wie möglich in 2 s, ohne Zufall. Mit Zufall bekommt jeder Wurzelzug einen exakten Wert (volles Fenster). Matt in 1 findet jede Stufe.

## Seite

- **Speicher:** `chess.settings.v1` (Gegner, Farbe, Stärke, Namen, Zugpunkte, automatisches Drehen) und `chess.game.v1` (Modus beim Start, Startstellung, Züge in UCI, Aufgabe/Remis, gedreht). Beim Laden wird die Partie nachgespielt; was nicht passt, fällt weg.
- **Neue Partie** (auch durch Wechsel von Gegner oder Farbe) ohne Rückfrage, mit `Tools.undo` – die alte Partie samt Einstellungen kommt zurück. Aufgeben/Remis lassen sich mit „Zug zurücknehmen“ aufheben.
- **Computerzug:** `scheduleCpu()`; jede Rücknahme/neue Partie erhöht `gameVersion` und beendet den Worker, alte Antworten werden verworfen. Ohne Worker rechnet die Seite selbst.
- **Bedienung:** Tippen auf Figur, dann Ziel; Tastatur mit Pfeiltasten (ein Tab-Stopp fürs Brett). Jedes Feld nennt Feld und Figur.
- **WebMCP:** `get_game`, `make_move` (SAN oder UCI, der Computer antwortet im selben Aufruf), `new_game` (nur wenn keine Partie läuft).

## Icons

`chess-knight` (App), `bulb` (Tipp), `arrows-up-down` (Brett drehen), `arrow-back-up` (Zug zurücknehmen), `plus` (Neue Partie), `copy` (PGN), `scale` (Remis), `flag` (Aufgeben).

## Offene Ideen

- Zu zweit auf zwei Handys über `assets/shared/p2p-connect.js` (`P2PConnect.session`, Beispiel `sea-battle`).
- Schachuhr, Ziehen per Drag & Drop, Durchblättern der Zugliste, PGN/FEN laden.
