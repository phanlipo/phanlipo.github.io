# Quartett – Aufbau

Supertrumpf (Autoquartett) gegen den Computer oder mit mehreren Handys über WebRTC. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche und Ablauf: Startseite, Runde (Gastgeber), Einladen/Beitreten, Spieltisch, WebMCP
game.js      window.Quartet: Regeln, Computer, Sicht je Platz, Zahlen-Format – ohne DOM, Zustand ist reines JSON
images.js    window.QuartetImages: eigene Bilder – ZIP lesen (DecompressionStream, keine Bibliothek), JSON-Linkliste, Zuordnung, Verkleinern, Tools.keep
decks.js     window.QuartetDecks: 17 Kartensätze – generiert von scripts/quartet-decks.mjs, nie von Hand ändern
../assets/shared/p2p.js   Verbindung ohne Server (QR-Codes, WebRTC, Scanner), wie in card-games
```

## Eigene Bilder

Die App liefert keine Kartenbilder aus (Lizenzen, Größe – siehe `IDEAS.md`). Wer Bilder möchte, bringt sie im Menü (☰ → „Eigene Bilder“) selbst mit; sie bleiben nur auf dem Gerät.

- **ZIP:** Bilddateien, benannt nach Kartennummer (`A1.jpg`), Kartenname oder Dateiname (klein, `♀→f`, `♂→m`, alles außer `a-z 0-9 _ -` → `_`). Ein Ordner mit der Deck-Kennung im Pfad (`dinosaurs/images/…`) legt das Deck fest, sonst gilt das gewählte. Gelesen wird nur das zentrale Verzeichnis, Einträge `stored`/`deflate`, kein ZIP64, keine Verschlüsselung, höchstens 300 MB.
- **JSON-Linkliste** (einfügen, Datei oder `https`-Link auf eine JSON-Datei): `{"<deck>": {"<Karte>": "https://…" | {"url", "credit"}}}` oder für das gewählte Deck nur das innere Objekt. Nur `https`, Abruf erst auf Knopfdruck, `credentials: 'omit'`, ohne Referrer; dafür `tool:connect` = `https:`. Server ohne CORS-Freigabe scheitern (in der Meldung genannt).
- **Ablage:** `Tools.keep` – `img/<deck>/<Kartennummer>` (WebP, sonst JPEG, höchstens 480 px) und `images.json` (Bildnachweis, Herkunft). Nicht in der Sicherungsdatei, *Alle Daten löschen* entfernt sie. Im Mehrspieler-Spiel zeigt jedes Handy seine eigenen Bilder.

## Kartensätze aktualisieren

```bash
node scripts/quartet-decks.mjs <Ordner mit den Deck-JSON-Dateien>
```

Übernommen werden Name, Gruppe, Kartennummer (Gruppe + laufende Nummer, wie auf den gedruckten Karten), die Kategorien mit Zahlen – 4 bis 6 je Karte (Text-Kategorien wie Hauptstadt fallen weg; Decks mit weniger als 4 Zahlen-Kategorien – Arzneimittel, Gewerkschaften, Biblische Persönlichkeiten – werden nicht übernommen, mehr als 6 auf die ersten 6 gekürzt) und der kurze deutsche Kartentext. Länder bekommen ihren ISO-Code (`f`, aus der Flaggen-Adresse der Quelle); die Flagge kommt aus dem Vendor-Paket `flag-icons` (`precache: false`: lädt beim ersten Ansehen, bleibt dann offline). Sonst noch keine Bilder (Größe, Lizenzen der Wikipedia-Bilder) – jedes Deck hat ein Emoji. Im Skript stehen: Auswahl und Reihenfolge der Decks, englische Titel, Kategorie- und Einheitennamen, Kategorien, in denen der kleinere Wert gewinnt (`LOW`), und Jahres-Kategorien (`YEAR`, ohne Tausenderpunkt). Neue Kategorie ohne englischen Namen → das Skript bricht ab.

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

- Mitgelieferte Kartenbilder – zurückgestellt (`IDEAS.md`, „Quartett: Kartenbilder“); eigene Bilder gehen schon (siehe oben).
- Eine fertige JSON-Linkliste je Deck erzeugen (Wikimedia-Links mit Bildnachweis).
- Eigene Kartensätze laden (JSON im Format der Quelldaten).
- Englische Kartennamen und Gruppen.
- Wiederverbinden nach Abbruch (heute übernimmt der Computer).
