# Kartenspiele – Aufbau

Mau Mau, Durak, Skat, Rommé, Poker (Texas Hold’em) und Solitaire (Klondike, allein), gegen den Computer oder mit mehreren Handys über WebRTC. Weitere Spiele kommen als eigene Datei dazu, ohne die Seite umzubauen. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche und Ablauf: Startseite, Runde (Gastgeber), Einladen/Beitreten, Spieltisch, WebMCP
cards.js     window.CardGames: Karten ("H10" = Herz 10, "X*" = Joker), Namen de/en, Zufall mit Startwert, Register der Spiele
mau-mau.js   Regeln, Computer-Spieler und Tisch von Mau Mau
durak.js     … von Durak
skat.js      … von Skat (Reizen, Skat drücken, Farb-/Grand-/Nullspiel, Abrechnung)
rommee.js    … von Rommé (2 × 52 Karten + 6 Joker, Auslegen ab 40 Punkten)
poker.js     … von Texas Hold’em als Turnier (Blinds, Nebentöpfe, Handbewertung, Computer per Simulation)
solitaire.js … von Klondike-Solitaire (1 Spieler, Rückgängig)
../assets/shared/p2p.js   Verbindung ohne Server (QR-Codes, WebRTC, Scanner) – auch für andere Apps gedacht
```

## Ablauf

- **Der Gastgeber rechnet.** Das Spiel (`state`) liegt nur auf dem Gerät, das die Runde eröffnet hat (oder allein gegen den Computer). Jeder Zug – eigener, vom Computer, von einem anderen Handy – geht durch `act(seat, move)` und wird mit `CardGames.legal()` gegen `game.moves()` geprüft. Unerlaubte oder veraltete Züge werden verworfen (das Handy bekommt den aktuellen Stand neu).
- **Jedes Handy sieht nur seine Sicht.** Nach jeder Änderung schickt der Gastgeber jedem Mitspieler `viewFor(seat)`: `game.view(state, seat)` (eigene Karten, Kartenzahl der anderen, Tisch) plus `you`, `players`, `active`, `moves` (eigene erlaubte Züge), `over`, `ver`, `round`. Die Oberfläche rendert nur diese Sicht – beim Gastgeber genauso wie beim Gast.
- **Computer** sind Plätze mit `kind: 'bot'`; `scheduleBots()` lässt nach der eingestellten Pause den ersten Computer ziehen, der etwas tun kann. `game.bot()` darf `null` liefern („warte“), solange ein anderer am Zug ist. Bricht ein Handy ab, übernimmt ein Computer seinen Platz.

### Nachrichten (JSON über den Datenkanal)

| Von → an | Nachricht |
|---|---|
| Gast → Gastgeber | `{t:'hello', app:'card-games', v:1, name}` · `{t:'move', m, ver}` · `{t:'bye'}` |
| Gastgeber → Gast | `{t:'room', game, players, you, host}` · `{t:'state', v}` · `{t:'bye'}` |

Mehrere Gäste: Der Gastgeber hat je Gast eine eigene Verbindung (Stern); jedes Handy wird einzeln eingeladen (Angebot → Antwort).

## Ein Spiel hinzufügen

1. Neue Datei `<spiel>.js` nach dem Muster von `mau-mau.js`, am Ende `CardGames.register(game)`.
2. In `index.html` per `<script src="<spiel>.js">` einbinden und die id in `ORDER` sowie das Kürzel in `gTitle`/`gDesc` eintragen (Texte `<kürzel>.title`, `<kürzel>.desc`).
3. Tests in `tests/card-games.spec.mjs`: Regeln an selbst gebauten Ständen, und das Spiel in die Simulation „computer games run to the end …“ aufnehmen (Karten gehen nie verloren, jedes Spiel endet).

### Vertrag eines Spiels

Regeln ohne DOM (alles außer `ui`), der Zustand ist reines JSON. Zufall nur über `CardGames.next/int/shuffle(state, …)` – der Startwert liegt in `state.rs`, so lässt sich jedes Spiel nachspielen.

| Feld | Aufgabe |
|---|---|
| `id`, `players: {min, max}` | Name des Ordners/Spiels, erlaubte Spielerzahl |
| `strings: {de, en}` | eigene Texte (Präfix z. B. `mm.`), werden mit den Seitentexten an `Tools.i18n` gegeben |
| `setup(n, seed)` | neuer Zustand für `n` Spieler (`players.max` 1 = Einzelspiel: kein Gegner, keine Runde mit Handys) |
| `moves(state, seat)` | erlaubte Züge dieses Platzes, z. B. `{a:'play', c:'H7'}`; leer = nicht dran. Mehrere Plätze dürfen gleichzeitig Züge haben (Durak: Nachlegen) |
| `allowed(state, seat, move)` | optional: prüft Züge selbst, wenn sie sich nicht alle auflisten lassen (Rommé: welche Karten ausgelegt werden). `moves` liefert dann nur eine Auswahl (für Agenten und Computer) |
| `apply(state, seat, move)` | Zug ausführen (nur mit erlaubten Zügen aufgerufen); setzt `state.last` für die Anzeige |
| `view(state, seat)` | was dieser Platz sehen darf – **nie** fremde Karten; braucht `hand` und `counts`. Nicht verwenden (setzt `index.html`): `game`, `you`, `players`, `active`, `moves`, `over`, `ver`, `round`, `mode`, `tally`, `games` |
| `result(state)` | `null` oder das Ergebnis (geht als `over` in die Sicht); mit `scores` (Zahl je Platz) zählt die Seite einen Stand über mehrere Spiele mit |
| `bot(state, seat)` | Zug des Computers oder `null` (warten) |
| `describe(move, view)` | englischer Text des Zugs für KI-Agenten |
| `summary(view)` | englische Zusammenfassung des Tisches für KI-Agenten |
| `ui.sort(hand, view)` | Reihenfolge der eigenen Karten |
| `ui.table(view, x)` | DOM des Tisches (Mitte) |
| `ui.status(view, x)`, `ui.last(view, x)`, `ui.badge(view, seat, x)` | Hinweis für den eigenen Platz, letzter Zug, Rolle eines Platzes |
| `ui.label(move, view, x)` | Beschriftung von Knöpfen ohne Karte (ziehen, aufnehmen …) und von Auswahl-Knöpfen, wenn eine Karte mehrere Züge hat (Bube: Wunschfarbe, Durak: welche Karte schlagen) |
| `ui.over(view, x)`, `ui.won(result, seat)` | Ergebnis-Text, gewonnen ja/nein (Statistik) |
| optional | `ui.hand: false` (keine Hand, Solitaire), `ui.handPlain` (Handkarten nicht ausgrauen, auch als Funktion der Sicht), `ui.multi` + `ui.selMoves(view, cards)` (Karten auswählen, Knöpfe passend zur Auswahl – Rommé), `ui.pick(moves, view)` (eindeutiges Ziel ohne Auswahl), `ui.primary(move)`, `ui.confirm(move, view, x)` (Rückfrage-Text), `ui.seat(view, seat, x)` (Zusatz am Platz, Poker: Chips), `ui.tallyText` (Textschlüssel für den Stand) |

`x` (von `index.html`): `t`, `lang`, `you`, `name(seat)` („Du“, Name, „Computer 1“), `card(c)`, `cardBtn(c)` (Karte auf dem Tisch, antippbar wenn ein Zug mit ihr beginnt), `back()`, `el(tag, cls, text)`, `cardName(c)`, `fmt(n)`, `move(m)`, `sel` (ausgewählte Karten).

Rang und Farbe auf den Karten zeichnet CSS (`content: attr(data-t)`), der Name steht nur im `aria-label` – sonst passen sichtbare Kürzel („B ♦“) nicht zum gesprochenen Namen (axe).

Die Oberfläche ist allgemein: Karten in der Hand sind antippbar, wenn ein Zug mit `c` = diese Karte existiert; Züge ohne Karte werden Knöpfe.

## Mögliche Erweiterungen

- Varianten als Optionen in `setup` (z. B. Mau Mau: Ass = nochmal, Punkte zählen; Durak: Weiterschieben „Perevodnoy“).
- Weitere Spiele: Schwimmen (31), Ablegespiele mit Sonderkarten (Mau-Mau-Varianten), Elfer raus, Doppelkopf.
- Skat: Ramsch, Kontra/Re, angesagter Schneider/Schwarz, Skat zu viert. Rommé: Joker austauschen, Hand-Rommé doppelt. Solitaire: drei Karten aufdecken.
- Wiederverbinden nach Abbruch (heute übernimmt der Computer).
- `sea-battle` und `rock-paper-scissors` könnten ihre eingebaute Verbindung durch `assets/shared/p2p.js` ersetzen (gleiches Code-Format).
