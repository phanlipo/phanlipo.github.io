# Quartett – Aufbau

Supertrumpf (Autoquartett) gegen den Computer oder mit mehreren Handys über WebRTC. Die Kartensätze stammen aus dem Repository [supertrumpf-creator](https://github.com/phanlipo/supertrumpf-creator), das dieselben Karten als druckbare PDFs erzeugt. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche und Ablauf: Startseite, Runde (Gastgeber), Einladen/Beitreten, Spieltisch, WebMCP
game.js      window.Quartet: Regeln, Computer, Sicht je Platz, Zahlen-Format – ohne DOM, Zustand ist reines JSON
decks.js     window.QuartetDecks: 20 Kartensätze – generiert von scripts/quartet-decks.mjs, nie von Hand ändern
../assets/shared/p2p.js   Verbindung ohne Server (QR-Codes, WebRTC, Scanner), wie in card-games
```

## Kartensätze aktualisieren

```bash
node scripts/quartet-decks.mjs ../supertrumpf-creator/cards_data
```

Übernommen werden Name, Gruppe, Kartennummer (Gruppe + laufende Nummer, wie auf den gedruckten Karten), alle Kategorien mit Zahlen (Text-Kategorien wie Hauptstadt fallen weg, mindestens 3 müssen bleiben) und der kurze deutsche Kartentext. Keine Bilder (Größe, Lizenzen der Wikipedia-Bilder) – jedes Deck hat ein Emoji. Im Skript stehen: Auswahl und Reihenfolge der Decks, englische Titel, Kategorie- und Einheitennamen, Kategorien, in denen der kleinere Wert gewinnt (`LOW`), und Jahres-Kategorien (`YEAR`, ohne Tausenderpunkt). Neue Kategorie ohne englischen Namen → das Skript bricht ab.

## Ablauf

- **Der Gastgeber rechnet** – wie in `card-games`: Der Zustand liegt nur auf dem Gerät, das die Runde eröffnet hat (oder allein gegen den Computer). Jeder Zug geht durch `act(seat, move)` und wird mit `Quartet.legal()` gegen `Quartet.moves()` geprüft.
- **Jedes Handy sieht nur seine Sicht:** `Quartet.view(state, seat)` enthält die eigene oberste Karte, die Kartenzahl jedes Platzes, den Topf und den letzten Vergleich (die dort aufgedeckten Karten sehen alle) – nie die verdeckten Karten der anderen. Dazu die Deck-Beschreibung (Kategorien, Gruppen), damit Gäste auch mit anderem App-Stand richtig anzeigen.
- **Züge:** `{a:'pick', k}` (Kategorie k, nur wer dran ist, Phase `choose`) und `{a:'next'}` (nach dem Vergleich, Phase `shown`, jeder Platz). Computer wählen nur Kategorien; „Weiter“ tippen die Menschen am Tisch.
- **Gleichstand:** Karten in den Topf, derselbe Spieler wählt noch einmal; hat er keine Karte mehr, der nächste mit Karten.
- **Ende:** einer hat alle Karten (`why:'all'`), alle Rundenlimit (`short` 25, `normal` 60, `long` 500 als Notbremse; `why:'rounds'`, die meisten Karten gewinnen) oder die letzten Spieler haben gleichzeitig keine Karten mehr (`why:'tie'`).
- **Computer:** `easy` zufällig, `normal` stärkste Kategorie mit etwas Zufall, `hard` stärkste Kategorie – Stärke = Anteil des Decks, den die Karte in dieser Kategorie schlägt (`Quartet.strength`).

### Nachrichten (JSON über den Datenkanal)

| Von → an | Nachricht |
|---|---|
| Gast → Gastgeber | `{t:'hello', app:'quartet', v:1, name}` · `{t:'move', m, ver}` · `{t:'bye'}` |
| Gastgeber → Gast | `{t:'room', deck:{id, emoji, de, en}, players, you, host}` · `{t:'state', v}` · `{t:'bye'}` |

## Mögliche Erweiterungen

- Bilder der Karten aus supertrumpf-creator (verkleinert, mit Bildnachweis je Karte).
- Eigene Kartensätze laden (JSON im Format von supertrumpf-creator).
- Englische Kartennamen und Gruppen.
- Wiederverbinden nach Abbruch (heute übernimmt der Computer).
