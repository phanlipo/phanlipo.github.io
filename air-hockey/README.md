# Airhockey – Aufbau

Airhockey für eine Person gegen den Computer oder zwei Personen an einem Gerät (Multitouch). Eigene Umsetzung des Spielprinzips; Tisch, Physik, Gegner und Grafik sind eigene. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Tisch als Canvas, Karte für Start/Pause/Ergebnis, Einstellungen, Hilfe
engine.js    window.HockeyEngine: Tisch, Physik mit festem Zeitschritt, Computer-Gegner – ohne DOM, auch in den Tests
app.js       Spielablauf (idle → play ⇄ paused → over), Finger-Zuordnung, Zeichnen, Töne, Bilanz, WebMCP
```

## Physik (engine.js)

- Tisch 100 × 170 Einheiten, y nach unten. Spieler 0 (Blau) unten, Spieler 1 (Rot/Computer) oben. Tor = Mitte des Pucks überquert die Torlinie in der Öffnung (36 breit); runde Ecken (Radius 16), damit der Puck nicht in einer Ecke festklemmt.
- Fester Schritt DT = 1/120 s (die Seite holt verpasste Schritte nach, höchstens 0,1 s je Bild). Puck höchstens 240 E/s → je Schritt < halber Puck-Radius, kein Durchtunneln.
- Schläger folgen dem Ziel (Finger) mit höchstens 420 E/s; ihre Geschwindigkeit ergibt sich aus der Bewegung je Schritt und geht in den Stoß ein: Relativgeschwindigkeit an der Normalen gespiegelt, Faktor 0,85. Banden 0,9, Luftreibung e^(−0,25 t).
- Ein Treffer zählt (Ereignis für Ton/Vibration) erst ab 15 E/s Annäherung – Schieben und Anliegen nicht.

## Computer (aiTarget)

Verteidigt auf einer Linie vor dem Tor an der vorhergesagten Stelle (`predictX`, mit Bandenabprall), greift an, wenn der Puck in seiner Hälfte liegt oder langsam ist: erst hinter den Puck (seitlich vorbei, nie auf das eigene Tor zu), dann ein Stoß zu einem festen Punkt (nicht hinterherlaufen – sonst schiebt er den Puck nur). Stärken unterscheiden sich in Tempo, Genauigkeit, Reaktionszeit und ob er bei einem Puck hinter sich auf die Torlinie zurückgeht. Zufall wird übergeben (Tests: feste Folge).

## Oberfläche (app.js)

- Multitouch über Pointer Events: Jeder Finger gehört dem Spieler, in dessen Hälfte er aufsetzt (`owners[i] = pointerId`, Pointer-Capture), auch wenn er später darüber hinausrutscht. Gegen den Computer steuert jeder Finger Blau, eine Maus auch ohne Drücken. `touch-action: none` auf dem Canvas.
- Breiter Bildschirm (Breite > 1,1 × Höhe): Tisch quer, Blau rechts. Texte auf dem Tisch zu zweit zum jeweiligen Spieler gedreht, gegen den Computer aufrecht.
- Gespeichert nur `air-hockey.settings.v1` (Spielart, Stärke, Tore bis zum Sieg, Töne, Vibrieren, Bilanz je Stärke) – nicht das laufende Spiel. Verlassen der App pausiert; während des Spiels bleibt der Bildschirm an (`Tools.wakeLock`).
- Tests halten die Uhr an (`page.clock`) und schicken Pointer-Events mit eigenen `pointerId`s; die Lage von Schlägern und Puck steht in der Diagnose.
- Nichts aus Versehen drücken: Während `play` trägt `<body>` die Klasse `playing` – die Kopfleiste ist ausgeblendet, Pause ist ein runder Knopf in der oberen linken Ecke (außerhalb der runden Tischecke). „Spielen“/„Weiterspielen“ schaltet per `Tools.fullscreen.enter()` ins Vollbild (Browser-Regel: nur direkt nach einem Tippen; abschaltbar). Endet das Vollbild während des Spiels (Zurück-Geste, Escape), pausiert es. Feature `Vollbild`: Die installierte App startet ohne Systemleisten.
