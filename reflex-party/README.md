# Reflex-Party – Aufbau

Partyspiel für 1–4 Personen an einem Gerät: Jede Person hat eine farbige Taste am Rand, in der Mitte läuft ein Minispiel. Wer im richtigen Moment zuerst drückt, bekommt einen Punkt. Die Spielidee (Reaktions-Minispiele auf geteiltem Bildschirm) stammt aus dem Genre der „Reactor“-Partyspiele. Minispiele, Texte und Grafik sind eigene.

## Dateien

- `games.js` (`window.ReflexGames`, ohne DOM): die Minispiele. Jedes hat `make(rnd, want, diff)`, das ein Bild als reines JSON erzeugt, und `ok(state)`, das sagt, ob man jetzt drücken muss. `make()` (exportiert) prüft, dass `ok(state) === want`, und würfelt neu, wenn das Bild genauso aussähe wie das vorige. Dazu `wantAt()` (wann ein Treffer-Bild kommt) und `countdownPlan()` (Zeiten des Blind-Countdowns).
- `index.html`: Zeichnen der Bilder (SVG/Text), Tasten, Ablauf von Partie und Runde, Einstellungen, WebMCP.

## Ablauf

- **Partie:** `idle` (Auswahl) → `play` → `over` (Ergebnis) → `play` (Nochmal) oder `idle`.
- **Auswahl vor dem Start:** Mitspieler, Schwierigkeit, Minispiele (Chips; „Alle“, „Ohne Lesen“ = `NO_READING`), Punkteziel, Vorlesen. Im Menü nur Töne, Vibration, Bestwerte.
- **Runde:** zufälliges Minispiel aus den gewählten, nie zweimal hintereinander. `intro` (1,4 s, bei Kindern 2,2 s, nur die Aufgabe, Drücken zählt nicht; mit Vorlesen zusätzlich bis die Stimme fertig ist, höchstens 5 s) → `run` (alle `STEP[diff]` ms ein neues Bild) → `result` (1,3 s Banner) → nächste Runde.
- **Treffer-Bilder:** nie das erste Bild einer Runde, danach mit 28 % Wahrscheinlichkeit, spätestens jedes 6. Bild. Laufen zwei Treffer-Bilder ohne Drücken vorbei, endet die Runde ohne Punkt.
- **Drücken:** bei einem Treffer-Bild +1 und Rundenende (es zählt das erste `pointerdown`). Sonst −1 (nicht unter 0) und die Taste ist bis zur nächsten Runde gesperrt. Sind alle gesperrt, endet die Runde.
- **Blind-Countdown:** zeigt 3, 2, 1 im Takt `tick`, aber nur die ersten `visible` Zahlen. Ab `zero` (3 × `tick`) zählt Drücken `window` ms lang als Treffer, vorher als Fehler.
- **Allein:** wie oben, zusätzlich werden verpasste Treffer-Bilder gezählt. Die beste mittlere Reaktionszeit (vom Erscheinen des Treffer-Bilds bzw. von 0 bis zum Drücken) wird je Schwierigkeit und Punkteziel gespeichert.

## Kinder & Vorlesen

- Schwierigkeit `kids`: 2,2 s pro Bild, einfache Bilder (kleine Zahlen, 3 Formen, volle Stunden, große Unterschiede), Countdown mit sichtbaren Zahlen und 0, zu frühes Drücken sperrt nur (kein −1). Wer in der Oberfläche „Kinder“ wählt, bekommt die Spiele aus `NO_READING`.
- Vorlesen über die Web Speech API (`speechSynthesis`, Stimme des Geräts): die Aufgabe jeder Runde und der Sieger. Ohne die API ist die Option gesperrt und erklärt.

## Tasten

Unten Spieler 1 (und 2). Oben, um 180° gedreht: Spieler 2 bei zwei Personen, Spieler 3 (und 4) bei drei oder vier. Die Aufgabe steht zusätzlich gedreht oben, sobald jemand gegenüber sitzt. Tastatur: `1`–`4`.

## Tests

`tests/reflex-party.spec.mjs` liest das aktuelle Bild aus `#stim[data-state]` und prüft es mit eigenen Regeln (nicht aus `games.js`). Die Uhr wird gesteuert (`page.clock`). WebMCP in `tests/webmcp.spec.mjs`.

## Offene Ideen

- Weitere Minispiele (z. B. Flaggen/Hauptstädte bräuchten Datensätze, Bewegungsspiele wie „Kreise berühren sich“).
- Spielernamen statt „Spieler 1–4“.
