# Turnier (`tournament/`)

Kleine Turniere (Kicker, Tischtennis, Darts …): Mitspieler eintragen, Teams auslosen, Spielplan erzeugen, Ergebnisse eintragen, Tabelle.

## Aufbau

- `tournament.js` – Regeln ohne DOM (`window.Tournament`): Teams auslosen (`makeTeams`, Zufall mit festem Seed), Spielpläne, Ergebnisse, Tabelle, Sieger.
- `index.html` – Oberfläche: Einrichtung (Mitspieler → Teams → Modus) oder laufendes Turnier (nächstes Spiel, Spielplan, Tabelle); Teams als Menü-Unterseite.

## Spielpläne

Der Spielplan hängt nur von Modus und Teamzahl ab und wird nicht gespeichert, sondern bei Bedarf berechnet (`schedule(mode, n)`); gespeichert sind nur Teams und Ergebnisse je Spielnummer.

- **Jeder gegen jeden** (`rr`) / **Hin- und Rückspiel** (`rr2`): Kreismethode – ein Team bleibt, die anderen rotieren; bei ungerader Zahl hat je Runde ein Team spielfrei. Die Rückrunde wiederholt die Hinrunde mit getauschten Seiten.
- **K.-o.** (`ko`): Turnierbaum mit der nächsten Zweierpotenz; Freilose nur in Runde 1, nach Setzliste (1 gegen letzte), daher nie zwei Freilose gegeneinander. Spiele ab Runde 2 verweisen per `fromA`/`fromB` auf die Spiele, deren Sieger sie bestreiten. Ändert sich ein Sieger, werden die Ergebnisse der davon abhängigen Spiele gelöscht.

Die Reihenfolge der Teams (= Setzliste im K.-o.) ist die ausgeloste Reihenfolge.

## Speicher

- `tournament.setup.v1`: `{ players: [Name], size: 1–4, random, seed, mode }`
- `tournament.current.v1`: `{ v: 1, mode, teams: [{ members: [Name] }], results: { "<Spielnummer>": [ToreA, ToreB] }, seed, created, view }` – ungültige Daten werden verworfen (`valid`).
