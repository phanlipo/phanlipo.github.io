# Murmel-Labyrinth – Aufbau

Kipp-Labyrinth für eine Person: Handy neigen, die Murmel rollt durch die Gänge ins Ziel, vorbei an Löchern. Spielprinzip wie ein Holzlabyrinth zum Kippen (verbreitetes Geduldspiel); Grafik und alle 30 Level sind eigene – sie entstehen beim Laden aus einem festen Startwert je Level. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Leiste mit Zeit und Stürzen, Labyrinth als Canvas, Karte für Start/Pause/Ziel mit Levelwahl, Einstellungen, Hilfe
engine.js    window.MarbleEngine: Level-Erzeugung, Physik mit festem Zeitschritt, Neigung aus dem Lagesensor – ohne DOM, auch in den Tests
app.js       Spielablauf (idle → play ⇄ paused → won), Sensor/Finger/Tasten, Zeichnen, Töne, Bestzeiten, WebMCP
```

## Level (engine.js)

- Raster `size(n)`: 5 × 8 Felder in Level 1, alle 3 Level eine Spalte mehr, höchstens 12 × 19 (hochkant wie ein Handy). Feld = 12 Einheiten, Wände auf den Feldgrenzen.
- Erzeugung mit eigenem Zufallsgenerator (mulberry32, Startwert aus der Levelnummer): perfektes Labyrinth per Tiefensuche, ab Level 4 einige zusätzliche Durchgänge (Schleifen), Start oben links, Ziel im Feld mit dem weitesten Weg vom Start.
- Löcher ab Level 3 (`holeCount`), je in einer Feldmitte, nie auf dem Start, daneben oder auf dem Ziel. Ein Loch bleibt nur, wenn danach noch ein Weg um **alle** Löcher herum zum Ziel führt (Breitensuche). Ein Loch sperrt sein Feld ganz: Neben ihm bleibt im 10 Einheiten breiten Gang kein Platz zum Vorbeirollen.
- **Level nie nachträglich ändern** (Generator, Startwerte, Größen, Zahlen): Gespeicherte Bestzeiten und Fortschritt gehören zu genau diesen Labyrinthen. Neue Level hinten anhängen.

## Physik (engine.js)

- Fester Schritt DT = 1/240 s, Murmel höchstens 180 E/s → 0,75 E je Schritt, weniger als Murmelradius (3,2) + Wandradius (1): kein Durchtunneln.
- Beschleunigung = 320 E/s² × Neigung (Sinus des Winkels, Betrag ≤ 1), Rollreibung e^(−0,55 t). Unter etwa 2° bleibt eine ruhende Murmel liegen.
- Wände sind Kapseln (zusammengefasste Strecken mit Radius 1); Abprall mit 35 % der Geschwindigkeit in die Wand; ab 45 E/s Ereignis `hit` (Ton, ab 90 E/s Vibration).
- Am Rand eines Lochs oder des Ziels zieht es die Murmel hinein. Mitte näher als 3,1 am Loch: `fall`, nach 0,6 s zurück auf den Start (`respawn`), die Zeit läuft weiter. Ziel: `goal`.

## Neigung (engine.js `down`, `tilt`; app.js)

- `deviceorientation` (beta, gamma) → Richtung der Schwerkraft im Gerät (`down`), daraus ihr Anteil entlang der Bildschirmrichtungen rechts/unten (`tilt`), gedreht nach `screen.orientation.angle`.
- Kalibrieren: Beim Start/Weiterspielen und mit „Neu ausrichten“ wird die aktuelle Schwerkraftrichtung zur Referenz; die Bildschirmachsen werden in die Ebene senkrecht dazu gedreht (Gram-Schmidt). Hochkant gehalten ist diese Ebene unbestimmt – dann wie flach gemessen.
- iPhone: `DeviceOrientationEvent.requestPermission()` direkt im Tippen auf „Spielen“ (bzw. beim Umschalten auf „Neigen“). Kommen 1,5 s nach dem Start keine Werte, Hinweis; der Finger steuert immer (Ziehen wie ein Joystick, 56 px = volle Finger-Neigung 0,45), am Computer auch Pfeiltasten/WASD.
- Querformat: Das hochkante Labyrinth wird um 90° gedreht gezeichnet (Brett-x zeigt nach oben); Finger/Sensor werden entsprechend umgerechnet. Im Vollbild (Android, Computer) wird die Ausrichtung festgehalten, damit sich der Bildschirm beim Kippen nicht dreht.

## Oberfläche (app.js)

- Gespeichert nur `marble-maze.settings.v1`: gewähltes Level, `done` (höchstes geschafftes Level; frei ist `done + 1`), Bestzeit je Level in Sekunden, Steuerung, Empfindlichkeit, Töne, Vibrieren, Vollbild – nicht das laufende Level.
- Verlassen der App und Ende des Vollbilds pausieren; während des Spiels bleibt der Bildschirm an (`Tools.wakeLock`), Kopfleiste ausgeblendet – wie `pinball`.
- Tests halten die Uhr an (`page.clock`), schicken `deviceorientation`- und Pointer-Events und lesen Lage, Neigung und Quelle aus der Diagnose.
