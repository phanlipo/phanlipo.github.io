# Planeten – Aufbau

Sonnensystem von oben für ein Datum zwischen 1800 und 2050 und die Frage, welche Planeten in der Nacht wann, wo und warum zu sehen sind. Alles wird im Browser gerechnet, ohne Bibliothek und ohne Netz. (`.md` wird nicht veröffentlicht.)

```
index.html     Oberfläche: Bühne (Canvas), Zeitleiste, Karte des gewählten Planeten mit „Warum?“, Liste der Nacht, Ort, WebMCP
ephemeris.js   window.PlanetEphemeris: Rechnung ohne DOM – Bahnen, Positionen, Helligkeit, Auf-/Untergang, Sichtbarkeit, Ereignisse
```

## Rechnung (ephemeris.js)

- **Bahnen:** Bahnelemente mit Änderung je Jahrhundert aus E. M. Standish (JPL), *Keplerian Elements for Approximate Positions of the Major Planets*, Tabelle 1 (1800–2050, Ekliptik J2000). Kepler-Gleichung per Newton-Verfahren, Erde = Schwerpunkt Erde–Mond. Außerhalb von 1800–2050 sperrt die Oberfläche (in der Zeitzone des Geräts); die Tabelle 2a für längere Zeiträume ist bewusst nicht eingebaut.
- **Vom Erdmittelpunkt aus:** Lichtlaufzeit (zwei Durchgänge), Präzession nur in der Länge (1,397°/Jh.), mittlere Schiefe der Ekliptik des Datums. Ohne Nutation und Aberration (≤ 20″). Genauigkeit gegen astronomy-engine (1800–2050): Richtung ≤ 2′, Jupiter/Saturn ≤ 13′ (Grenze der Tabelle), Aufgänge ≤ 1 min.
- **Helligkeit:** Formeln des *Astronomical Almanac* (Hilton 2005) mit Phasenwinkel; Saturn zusätzlich mit Neigung der Ringe (Meeus, Kap. 45).
- **Sichtbar:** Planet ≥ 5° hoch, Sonne < −6° (`MIN_ALT`, `DARK`), in Schritten von 10 Minuten über die Nacht, die den Zeitpunkt enthält (sonst die nächste). Arten: `evening`, `morning`, `allNight`, `night`, `eveningMorning`, sonst `nearSun` (Elongation < 20°), `belowHorizon`, `noNight`. Heller als 5 mag = bloßes Auge, sonst „nur mit Fernglas“.
- **Ereignisse:** tageweise Suche nach Vorzeichenwechsel der Längendifferenz zur Sonne (Konjunktion, Opposition) bzw. lokalen Extremen (größte Elongation, größte Helligkeit der Venus), dann Bisektion/Ternärsuche auf etwa eine Minute.

## Oberfläche (index.html)

- **Ansichten:** „Bis zum Mars“ maßstabsgetreu (1,75 AE bis zum Rand), „Alle Planeten“ mit gestauchtem Abstand (√r). Linie Erde → gewählter Planet, gestrichelt Erde → Sonne, dazwischen der Winkel (Elongation). Namen werden an die erste freie von vier Stellen um den Punkt gesetzt.
- **Texte „Warum?“** entstehen in `explain()` aus Elongation, Seite (Ost = Abend, West = Morgen), Entfernung, Phase, Helligkeit und dem nächsten Höhepunkt (größte Helligkeit/Opposition innerhalb ±75 Tagen). `ctx(lang)` liefert die Formatierung: auf der Seite in der eingestellten Sprache, für WebMCP immer englisch.
- **Gespeichert** (`planets.settings.v1`): `{ lat, lon, view: 'inner'|'all', speed: 'day'|'week'|'month'|'year', planet }`. Der Zeitpunkt wird nicht gespeichert (Start = jetzt). Der Standort wird nur auf Knopfdruck abgefragt, auf 0,1° gerundet und nie protokolliert oder an Agenten gegeben.
- **WebMCP:** `set_time`, `get_sky` (nur lesen), `explain_planet`.

## Tests

`tests/planets.spec.mjs` prüft die Rechnung gegen veröffentlichte Almanach-Daten (Oppositionen, Konjunktionen, größte Elongationen, Perihel/Aphel, Ringkantenstellung Saturn 2025, Sonnenaufgang Berlin, Mitternachtssonne), dazu die Oberfläche; WebMCP in `tests/webmcp.spec.mjs`.
