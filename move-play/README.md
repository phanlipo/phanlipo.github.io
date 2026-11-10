# MovePlay – Aufbau

Bewegungsspiele vor der Kamera. Vier Schichten, nur die unterste kennt MediaPipe:

| Datei | Aufgabe |
|---|---|
| `pose-worker.mjs` | Worker mit Netzsperre (nur eigene Dateien und die Modell-Datei): MediaPipe Pose Landmarker lite, 33 Körperpunkte je Bild. Modell im Cache `move-play-models`, Engine über den Service Worker (`vendor:mediapipe@…`, geteilt mit Kamera-Effekte). GPU zuerst; die ersten Bilder werden gestoppt, ist die GPU langsamer als die CPU (z. B. nur simuliert), nimmt er die CPU. **Zwei Spieler:** je Bildhälfte ein eigener Detektor – MediaPipes eigene Suche nach mehreren Personen (`numPoses: 2`) fand im Test mit echtem Modell nur eine oder keine. |
| `motion.js` | Bewegungs-Engine ohne DOM: glätten, kalibrieren (still stehen, Rumpflänge = Maßstab), Ereignisse `jump`, `duck`, `squat`, `armsUp`, `armLeft`, `armRight`, `clap`, `jumpingJack` und Zustände (Hände, Körper, `airborne`, `ducking`, `energy` = Bewegung der letzten 0,4 s, `pose` = Armwinkel und Beine). `Motion.matchPose` vergleicht mit einer Pose. Schwellen in `Motion.T`, `easy` senkt sie für kleine Kinder. |
| `engine.js` | Spiel-Engine ohne DOM: Countdown, Uhr (steht bei Pause), Punkte mit Serien-Bonus, Leben, Ende; Prüfung der Spiel-Beschreibung (`MoveEngine.SCHEMA`). Zwei Spieler = zwei Spiele mit demselben Zufalls-Startwert und `sync` (fester Takt, damit beide dieselben Befehle, Hindernisse, Posen und dieselbe Musik zur selben Zeit bekommen). |
| `mechanics.js` | Spielarten mit festem Vertrag (`schema`, `start`, `update`, `event`, optional `check`): `command` (Simon sagt), `count` (zählen), `dodge` (ausweichen), `targets` (Ziele treffen), `freeze` (Stopptanz), `pose` (Posen nachmachen). Mit `g.sync` darf eine Spielart den nächsten Schritt nicht von der Reaktion des Spielers abhängig machen. |
| `games/*.json` | Die Spiele selbst (Liste `BUILTIN` in `index.html`). |
| `index.html` | Kamera, Ablauf (Auswahl → Kalibrieren → Countdown → Spiel → Ergebnis), 1 oder 2 Spieler (Bildhälfte → Spieler), Zeichnen, Ton/Ansage/Musik, Einstellungen, WebMCP, Diagnose. |

## Neues Spiel

Eine JSON-Datei in `games/` anlegen und in `BUILTIN` eintragen – ohne Code, solange eine vorhandene Spielart passt:

```json
{
  "format": "moveplay-game", "version": 1, "id": "squat-race",
  "title": { "de": "Kniebeugen-Rennen", "en": "Squat Race" },
  "description": { "de": "…", "en": "…" },
  "emoji": "🏋️", "mechanic": "count", "needs": "full", "space": "small",
  "duration": 30, "lives": 0, "scoring": { "hit": 1 },
  "params": { "event": "squat" }
}
```

- `needs`: `full` (Kopf bis Fuß im Bild) oder `upper` (Kopf bis Hüfte). `space`: `small` blendet den Platz-Hinweis aus. `players` (optional, Standard 2): höchstens so viele Spieler.
- Posen (`pose`): `left`/`right` = Winkel des linken/rechten Arms des Spielers (0° hängt, 90° seitlich, 180° oben), `legs`: `any`, `together`, `apart`, `oneUp` (ein Knie hoch).
- `lives`: 0 = ohne Leben. `scoring.hit` Punkte je Treffer, `streakBonus` zusätzlich je Treffer in Folge, `penalty` Abzug bei Fehlern.
- `params` je Spielart: siehe `schema` in `mechanics.js`. Bereiche wie `window` / `interval` sind `[Anfang, Ende]` – das Spiel wird linear schneller.
- Neue Texte für Befehle (`cmd.<ereignis>`) und Rückmeldungen stehen in `index.html`.

Der Test „built-in games are valid“ in `tests/move-play.spec.mjs` prüft jede Datei.

## Neue Spielart / neue Bewegung

- Spielart: Eintrag in `mechanics.js` mit eigenem `schema`; verändert das Spiel nur über `g.hit()`, `g.miss()`, `g.say()` und `g.objects`. Neue Objektarten zeichnet `drawObject` in `index.html`.
- Bewegung: in `motion.js` erkennen, in `Motion.EVENTS` eintragen, Text `cmd.<name>` ergänzen, Test mit erzeugten Posen (`tests/move-play-poses.mjs`).

## Geplant

Siehe `IDEAS.md` („MovePlay“): eigene Spiele laden, Fernseher, Duell auf zwei Geräten.
