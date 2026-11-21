# Flipper – Aufbau

Flipper für eine Person. Eigener Tisch (Grundriss, Regeln, Grafik), kein Nachbau eines bestimmten Geräts. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Punkteleiste, Tisch als Canvas, Karte für Start/Pause/Ergebnis, Einstellungen, Hilfe
engine.js    window.PinballEngine: Tisch, Physik mit festem Zeitschritt, Regeln – ohne DOM, auch in den Tests
app.js       Spielablauf (idle → play ⇄ paused → over), Finger/Tasten, Zeichnen, Töne, Bestwerte, WebMCP
```

## Tisch und Physik (engine.js)

- Tisch 100 × 180 Einheiten, y nach unten (zum Spieler). Spielfeld x 0…91, rechts die Abschussbahn (91…100) mit Feder; oben ein Halbkreis (Radius 50). Symmetrisch um x = 45,5.
- Alles, woran die Kugel abprallt, ist eine **Kapsel** (Strecke mit Radius): Wände, Pfosten, Schleudern, Ziele, Flipper. Bumper sind Kreise. Abprall: Normalanteil der Relativgeschwindigkeit gespiegelt (Wände 0,45, Flipper 0,25); bei Flippern zählt die Geschwindigkeit des Berührpunkts (`flipperVel`, ω × r).
- Fester Schritt DT = 1/240 s, Kugel höchstens 300 E/s → je Schritt < halber Kugelradius, kein Durchtunneln. Schwerkraft 190 E/s², Rollreibung e^(−0,12 t).
- Flipper drehen mit 20 rad/s zwischen +0,5 (Ruhe) und −0,42 rad (oben); Abstand der Spitzen in Ruhe > Kugeldurchmesser (die Kugel kann durch die Mitte fallen).
- Bumper stoßen mit mindestens 150 E/s weg, Schleudern geben 120 E/s dazu (nur ab 20 E/s Aufprall).
- Feder: halten spannt (0…1 in 0,9 s), loslassen schießt mit 228…300 E/s. Schon ohne Spannen erreicht die Kugel das Spielfeld; die schräge Einwegklappe oben an der Bahn lässt sie nicht zurück. Fällt sie trotzdem in die Bahn, liegt sie wieder auf der Feder.
- Keine Mulden: Jede Fläche, auf der die Kugel liegen bleiben könnte, ist schräg; geprüft mit langen Spielen eines Zufalls-Spielers (Test). Liegt die Kugel trotzdem 3 s still (nicht auf einem gehaltenen Flipper), bekommt sie einen Stoß (`nudge`).

## Regeln

Bahnen oben (Spurwechsel per Flipper, alle drei → +2.000 und Multiplikator bis ×5), drei Fallziele rechts (alle → 3.000 × Multiplikator, kurze Ballsicherung), Bonus (+100 je neue Bahn/Ziel) × Multiplikator beim Verlust der Kugel. Ballsicherung 8 s nach dem ersten Abschuss jeder Kugel. 3 oder 5 Kugeln.

## Oberfläche (app.js)

- Linke Bildschirmhälfte = linker Flipper, rechte = rechter; jeder Finger hält, solange er liegt (Pointer Events, Pointer-Capture, mehrere Finger). Wartet die Kugel auf der Feder, spannt die rechte Hälfte stattdessen die Feder. Tasten: Pfeile/Shift/Z/M, Feder Leertaste/Enter/Pfeil runter, Pause P/Escape.
- Gespeichert nur `pinball.settings.v1` (Kugeln je Spiel, Töne, Vollbild, Vibrieren, Bestwert je Kugelzahl) – nicht das laufende Spiel. Verlassen der App pausiert; während des Spiels bleibt der Bildschirm an (`Tools.wakeLock`), Kopfleiste ausgeblendet, „Spielen“ schaltet ins Vollbild (abschaltbar), wie bei `air-hockey`.
- Tests halten die Uhr an (`page.clock`) und schicken Pointer-Events; Lage der Kugel, Flipper und Feder stehen in der Diagnose.
