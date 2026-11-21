# Tischtennis – Aufbau

Tischtennis von oben für eine Person gegen den Computer oder zwei Personen an einem Gerät (Multitouch). Eigene Umsetzung des Spielprinzips; Platte, Ballflug, Gegner und Grafik sind eigene. Aufbau wie `air-hockey/`. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Raum mit Platte als Canvas, Karte für Start/Pause/Ergebnis, Einstellungen, Hilfe
engine.js    window.PingEngine: Platte, Ballflug mit Höhe, Regeln, Computer-Gegner – ohne DOM, auch in den Tests
app.js       Spielablauf (idle → play ⇄ paused → over), Finger-Zuordnung, Zeichnen, Töne, Bilanz, WebMCP
```

## Ballflug und Regeln (engine.js)

- Raum 100 × 200 Einheiten, y nach unten, Platte 76 × 136 in der Mitte (Seitenverhältnis einer echten Platte), Netz bei y = 100 (Höhe 6, steht 5 über die Seiten). Spieler 0 (Blau) unten, Spieler 1 (Rot/Computer) oben. Der Ball hat eine Höhe z: Schwerkraft 150 E/s², auf der Platte springt er mit 0,8 der Fallgeschwindigkeit zurück; neben der Platte landet er auf dem Boden.
- Fester Schritt DT = 1/120 s (die Seite holt verpasste Schritte nach, höchstens 0,1 s je Bild).
- Schläger (Kreis, Radius 9) folgen dem Ziel (Finger) mit höchstens 420 E/s, überall auf der eigenen Netzseite, auch neben/hinter der Platte.
- **Schlag** (`shot`): nur nachdem der Ball auf der eigenen Seite aufgesprungen ist (Aufschlag: der schwebende Ball, Schläger muss sich bewegen). Schwung = Geschwindigkeit des Schlägers zum Gegner; mit k = 1 − e^(−Schwung/160) fliegt der Ball 80 + 120 k E/s schnell und landet 26 + 43 k hinter dem Netz (die Hälfte ist 68 tief; auch mit dem Höchsttempo des Schlägers, 420 E/s, bleibt die Länge knapp drin – ins Aus geht ein Ball über die Seite oder wenn er fürs Netz höher fliegen muss). Seitlich: Trefferpunkt auf dem Schläger (Rand = ±1) · 30 + 0,15 · seitliche Schlägergeschwindigkeit + 0,2 · seitliche Ballgeschwindigkeit. Die Höhe wird so gewählt, dass der Ball an der Stelle landet; reicht das nicht übers Netz, fliegt er höher (und weiter).
- **Punkte:** Aufspringen auf der eigenen Seite (nach dem Netz) oder Landen neben/hinter der Platte, ohne drüben aufgesprungen zu sein → Punkt für den Gegner („out“/„net“). Drüben aufgesprungen und nicht zurückgeschlagen (Boden oder zweites Aufspringen) → Punkt für den Schläger („miss“). Bis `pointsToWin` mit 2 Punkten Vorsprung; Aufschlag wechselt alle 2 Punkte, wenn beide einen Punkt vor dem Ende sind nach jedem.
- `fly` (ein Schritt Ballflug ohne Schläger) nutzen `step` und `predict` (Vorhersage für den Computer und die Tests).

## Computer (aiTarget)

Plant je Schlag des Gegners einmal: Mit `predict` die Stelle kurz nach dem Aufspringen auf seiner Seite (innerhalb seiner Reichweite), dazu Schwung und Ziel (zufällige Stelle mit Abstand vom Rand, stärker oft weg vom anderen Schläger) samt Treffpunkt auf dem Schläger, der dorthin lenkt – plus Zielfehler. Der Schläger folgt einem Punkt, der mit dem Schwungtempo durch den Treffpunkt läuft. Stärken unterscheiden sich in Tempo, Reaktionszeit, Schwung, Zielfehler und Randabstand. Zufall wird übergeben (Tests: feste Folge).

## Oberfläche (app.js)

Wie `air-hockey/README.md`: Finger gehören der Netzseite, auf der sie aufsetzen (Pointer-Capture); gegen den Computer steuert jeder Finger Blau, eine Maus auch ohne Drücken. Breiter Bildschirm: Platte quer, Blau rechts. Kopfleiste während des Spiels ausgeblendet, Pause oben links, Vollbild nach „Spielen“. Gespeichert nur `table-tennis.settings.v1` (Spielart, Stärke, Punkte bis zum Sieg, Töne, Vollbild, Vibrieren, Bilanz je Stärke). Gezeichnet: Schatten des Balls um die Höhe versetzt, der Ball selbst mit der Höhe größer.
