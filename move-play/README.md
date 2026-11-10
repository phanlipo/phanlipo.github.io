# MovePlay – Aufbau

Bewegungsspiele vor der Kamera. Vier Schichten, nur die unterste kennt MediaPipe:

| Datei | Aufgabe |
|---|---|
| `pose-worker.mjs` | Worker mit Netzsperre (nur eigene Dateien und die Modell-Datei): MediaPipe Pose Landmarker lite, 33 Körperpunkte je Bild. Modell im Cache `move-play-models`, Engine über den Service Worker (`vendor:mediapipe@…`, geteilt mit Kamera-Effekte). |
| `motion.js` | Bewegungs-Engine ohne DOM: glätten, kalibrieren (still stehen, Rumpflänge = Maßstab), Ereignisse `jump`, `duck`, `squat`, `armsUp`, `armLeft`, `armRight`, `clap`, `jumpingJack` und Zustände (Hände, Körper, `airborne`, `ducking` …). Schwellen in `Motion.T`. |
| `engine.js` | Spiel-Engine ohne DOM: Countdown, Uhr (steht bei Pause), Punkte mit Serien-Bonus, Leben, Ende; Prüfung der Spiel-Beschreibung (`MoveEngine.SCHEMA`). |
| `mechanics.js` | Spielarten mit festem Vertrag (`schema`, `start`, `update`, `event`, optional `check`): `command` (Simon sagt), `count` (zählen), `dodge` (ausweichen), `targets` (Ziele treffen). |
| `games/*.json` | Die Spiele selbst (Liste `BUILTIN` in `index.html`). |
| `index.html` | Kamera, Ablauf (Auswahl → Kalibrieren → Countdown → Spiel → Ergebnis), Zeichnen, Ton/Ansage, Einstellungen, WebMCP, Diagnose. |

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

- `needs`: `full` (Kopf bis Fuß im Bild) oder `upper` (Kopf bis Hüfte). `space`: `small` blendet den Platz-Hinweis aus.
- `lives`: 0 = ohne Leben. `scoring.hit` Punkte je Treffer, `streakBonus` zusätzlich je Treffer in Folge, `penalty` Abzug bei Fehlern.
- `params` je Spielart: siehe `schema` in `mechanics.js`. Bereiche wie `window` / `interval` sind `[Anfang, Ende]` – das Spiel wird linear schneller.
- Neue Texte für Befehle (`cmd.<ereignis>`) und Rückmeldungen stehen in `index.html`.

Der Test „built-in games are valid“ in `tests/move-play.spec.mjs` prüft jede Datei.

## Neue Spielart / neue Bewegung

- Spielart: Eintrag in `mechanics.js` mit eigenem `schema`; verändert das Spiel nur über `g.hit()`, `g.miss()`, `g.say()` und `g.objects`. Neue Objektarten zeichnet `drawObject` in `index.html`.
- Bewegung: in `motion.js` erkennen, in `Motion.EVENTS` eintragen, Text `cmd.<name>` ergänzen, Test mit erzeugten Posen (`tests/move-play-poses.mjs`).

## Geplant

Siehe `IDEAS.md` („MovePlay“): Stopptanz, Posen nachmachen, zwei Spieler, eigene Spiele laden, Fernseher.
