# Einheitenrechner (`unit-converter`)

Einheiten umrechnen, nach Größen geordnet – erst die SI-Einheiten (mit Präfixen), dann bekannte andere Einheiten
(angloamerikanisch, älter, CGS). Aufbau nach dem Werkzeugkasten-Standard (`UI-KONZEPT.md` 4b).

## Aufbau

- `units.js` – Daten und Umrechnung ohne DOM (`window.Units`): 34 Größen in 5 Gruppen, je Größe eine Bezugseinheit
  (die SI-Einheit, wo es eine gibt). Lineare Einheiten: `ref = (Wert + o) · f` (Offset `o` nur bei Temperaturen),
  umgekehrte Einheiten: `ref = inv / Wert` (Verbrauch: km/l, mpg ↔ l/100 km). `si: true` kennzeichnet SI-Einheiten
  und SI-Einheiten mit Präfix (plus Einheiten, die mit dem SI benutzt werden: t, l, min, h, ha …).
- `index.html` – Übersicht (Kacheln je Gruppe, Suche nach Größe, Einheitenname oder Zeichen), Tab-Leiste nur mit den
  Größen der offenen Gruppe (`data-group`, `assets/shared/toolbox.js`), je Größe eine Karte: Wert, Von, Nach,
  Ergebnis, Umrechnungsfaktor und Tabelle aller Einheiten. Dazu die Karte „SI-Präfixe“ (Quetta bis Quekto).
  Overview, Tabs und Karten werden aus den Daten erzeugt.
- Gespeichert (`unit-converter.state.v1`): offene Größe, je Größe Wert und Einheiten, die Sprache, in der die Zahlen
  geschrieben sind (damit „1,000“ nach einem Sprachwechsel tausend bleibt).

## Entscheidungen

- Faktoren sind die festgelegten Werte (Zoll, Pfund, Gallone, psi, PS, kcal thermochemisch, BTU (IT) …); Näherungen
  (Hefnerkerze) tragen `approx` und erscheinen mit „≈“.
- Anzeige mit 10 gültigen Stellen (gegen Rundungsreste wie 211,99999999999994), ab 10¹⁵ und unter 10⁻⁶ als
  Zehnerpotenz. Kopieren ohne Tausendertrennzeichen, mit E-Schreibweise für sehr große/kleine Zahlen.
- Kein Umrechnen zwischen Größen (z. B. l/100 km ↔ kWh/100 km), keine Schuh- oder Kleidergrößen (Tabellen, keine Faktoren).

## Offene Erweiterungen

- Weitere Alltagsgrößen: Datenrate (Mbit/s ↔ MB/s), Kochen (Gramm ↔ Tassen je Zutat), Schuhgrößen.
- Zahlensysteme (binär, hex) – eher eigener Rechner.
