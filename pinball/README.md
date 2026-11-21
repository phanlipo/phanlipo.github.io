# Flipper – Aufbau

Flipper für eine Person mit mehreren Tischen. Eigene Tische (Grundriss, Regeln, Grafik), kein Nachbau eines bestimmten Geräts – Anregungen von echten Flippern nur als Spielidee (Bauteile, Abläufe). (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Punkteleiste, Tisch als Canvas, Karte für Start/Pause/Ergebnis mit Tischwahl, Einstellungen, Hilfe
tables.js    window.PinballTables: die Tische als Daten (Wände, Flipper, Bumper, Ziele, Bahnen, Rampen …) und Bauhelfer
engine.js    window.PinballEngine: Physik mit festem Zeitschritt und Regeln für jeden Tisch – ohne DOM, auch in den Tests
app.js       Spielablauf (idle → play ⇄ paused → over), Tischwahl, Finger/Tasten, Zeichnen, Töne, Bestwerte, WebMCP
```

## Tische (tables.js)

- Ein Tisch ist ein Objekt mit Listen von Bauteilen; das Format steht oben in `tables.js`. Gemeinsam sind Gehäuse mit runder Oberseite, Abschussbahn rechts (x 91…100) und meist der untere Teil (`lower`: Innen-/Außenbahnen, Schleudern, Flipper).
- **Komet** (Einstieg): drei Bumper, Bahnen oben, Fallziele rechts (geben Ballsicherung).
- **Tiefsee** (mittel): Rampe links (zweite Ebene) in die linke Innenbahn, Orbit mit Spinner rechts, Kugelfang in der Mitte, Fallziele schalten den Kickback links an; jede zweite Rampe schaltet den Multiball frei, im Kugelfang startet er (2 Kugeln), Rampen geben dann den Jackpot.
- **Uhrwerk** (schwer): zwei gespiegelte U-Rampen (`uRamp`) in beide Innenbahnen, Spinner an der rechten Mündung, dazwischen ein unten offener Turm mit Fallzielen links, drittem Flipper rechts (rechte Taste) und Kugelfang „Uhr“ oben; Missionskette (`missions`, `missionsDone`) startet einen Multiball mit 3 Kugeln; die Bahnen oben schalten auch den Kickback an.
- Neuer Tisch: Funktion in `tables.js` anlegen, in `list` eintragen, Farben in `index.html` (`.table[data-table=…]`, hell und dunkel), Texte `desc_<id>` in `app.js`, Hilfe. Den Zufalls-Test in `tests/pinball.spec.mjs` laufen lassen: er findet Mulden (Kugel bleibt liegen) und zu enge Durchlässe.

## Physik (engine.js)

- Tisch 100 × 180 Einheiten, y nach unten (zum Spieler). Spielfeld x 0…91, rechts die Abschussbahn (91…100) mit Feder; oben ein Halbkreis (Radius 50). Symmetrisch um x = 45,5.
- Alles, woran die Kugel abprallt, ist eine **Kapsel** (Strecke mit Radius): Wände, Pfosten, Schleudern, Ziele, Flipper. Bumper sind Kreise. Abprall: Normalanteil der Relativgeschwindigkeit gespiegelt (Wände 0,45, Flipper 0,25); bei Flippern zählt die Geschwindigkeit des Berührpunkts (`flipperVel`, ω × r).
- Fester Schritt DT = 1/240 s, Kugel höchstens 300 E/s → je Schritt < halber Kugelradius, kein Durchtunneln. Schwerkraft 190 E/s², Rollreibung e^(−0,12 t).
- Flipper drehen mit 20 rad/s zwischen +0,5 (Ruhe) und −0,42 rad (oben); Abstand der Spitzen in Ruhe > Kugeldurchmesser (die Kugel kann durch die Mitte fallen).
- Bumper stoßen mit mindestens 150 E/s weg, Schleudern geben 120 E/s dazu (nur ab 20 E/s Aufprall).
- Feder: halten spannt (0…1 in 0,9 s), loslassen schießt mit 228…300 E/s. Schon ohne Spannen erreicht die Kugel das Spielfeld; die schräge Einwegklappe oben an der Bahn lässt sie nicht zurück. Fällt sie trotzdem in die Bahn, liegt sie wieder auf der Feder.
- **Ebenen:** Kugeln haben `layer` 0 (Spielfeld) oder 1 (Rampe). Wände gelten für eine Ebene oder beide (`layer` 2). Sensorlinien (Rampenmündung/-ende, Kickback) zählen das Überqueren mit Richtung (`crossed`); über die Mündung nach oben geht's auf die Rampe, zurück oder über das Ende wieder aufs Spielfeld.
- **Multiball:** `g.live` sind die Kugeln auf dem Tisch, `g.queue` die, die noch automatisch abgeschossen werden (Multiball, Ballsicherung während eines Multiballs). Kugeln stoßen sich ab (Faktor 0,9). Erst wenn die letzte Kugel weg ist, ist die Kugel verloren.
- Fallziele stehen nach einer vollen Reihe erst nach 0,4 s wieder auf und nie unter einer Kugel (sonst würde die Kugel durch die Wand dahinter gedrückt).
- Keine Mulden: Jede Fläche, auf der die Kugel liegen bleiben könnte, ist schräg; geprüft mit langen Spielen eines Zufalls-Spielers (Test). Liegt die Kugel trotzdem 3 s still (nicht auf einem gehaltenen Flipper), bekommt sie einen Stoß (`nudge`).

## Regeln (engine.js, Werte in tables.js)

Für alle Tische: Bahnen oben (Spurwechsel per Flipper, alle → Punkte und eine Wirkung, z. B. Multiplikator bis ×5), Fallziel-Reihen (alle → Punkte × Multiplikator und eine Wirkung: Ballsicherung oder Kickback), Bonus (+100 je neue Bahn, Ziel, Rampe, Kugelfang) × Multiplikator beim Verlust der Kugel, Ballsicherung 8 s nach dem ersten Abschuss jeder Kugel, 3 oder 5 Kugeln. Rampen zählen; jede `lockEvery`-te schaltet den Multiball frei, ein Kugelfang startet ihn, Rampen geben dann den Jackpot. Missionen (`progress`): eine Kette von Aufgaben, die über alle Kugeln eines Spiels weiterläuft; nach der letzten Punkte und eine Wirkung (z. B. Multiball), dann von vorn.

## Oberfläche (app.js)

- Linke Bildschirmhälfte = linker Flipper, rechte = rechter; jeder Finger hält, solange er liegt (Pointer Events, Pointer-Capture, mehrere Finger). Wartet die Kugel auf der Feder, spannt die rechte Hälfte stattdessen die Feder. Tasten: Pfeile/Shift/Z/M, Feder Leertaste/Enter/Pfeil runter, Pause P/Escape.
- Gespeichert nur `pinball.settings.v2` (Tisch, Kugeln je Spiel, Töne, Vollbild, Vibrieren, Bestwerte je Tisch und Kugelzahl; `v1` ohne Tisch wird beim Laden als Komet übernommen) – nicht das laufende Spiel. Verlassen der App pausiert; während des Spiels bleibt der Bildschirm an (`Tools.wakeLock`), Kopfleiste ausgeblendet, „Spielen“ schaltet ins Vollbild (abschaltbar), wie bei `air-hockey`.
- Farben je Tisch: `.table[data-table=…]` setzt die Farb-Tokens, das Canvas liest sie dort.
- Tests halten die Uhr an (`page.clock`) und schicken Pointer-Events; Lage der Kugel, Flipper und Feder stehen in der Diagnose.
