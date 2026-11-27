# Planeten – Aufbau

Sonnensystem von oben für ein Datum zwischen 1800 und 2050 und die Frage, welche Planeten und welcher Mond in der Nacht wann, wo und warum zu sehen sind. Alles wird im Browser gerechnet, ohne Bibliothek und ohne Netz. (`.md` wird nicht veröffentlicht.)

```
index.html     Oberfläche: Bühne (Canvas), Zeitleiste, Karte des gewählten Planeten mit „Warum?“, Liste der Nacht, Ort, WebMCP
ephemeris.js   window.PlanetEphemeris: Rechnung ohne DOM – Bahnen, Positionen, Mond, Jupitermonde, Helligkeit, Auf-/Untergang, Sichtbarkeit, Ereignisse
```

## Rechnung (ephemeris.js)

- **Bahnen:** Bahnelemente mit Änderung je Jahrhundert aus E. M. Standish (JPL), *Keplerian Elements for Approximate Positions of the Major Planets*, Tabelle 1 (1800–2050, Ekliptik J2000). Kepler-Gleichung per Newton-Verfahren, Erde = Schwerpunkt Erde–Mond. Außerhalb von 1800–2050 sperrt die Oberfläche (in der Zeitzone des Geräts); die Tabelle 2a für längere Zeiträume ist bewusst nicht eingebaut.
- **Vom Erdmittelpunkt aus:** Lichtlaufzeit (zwei Durchgänge), Präzession nur in der Länge (1,397°/Jh.), mittlere Schiefe der Ekliptik des Datums. Ohne Nutation und Aberration (≤ 20″). Genauigkeit gegen astronomy-engine (1800–2050): Richtung ≤ 2′, Jupiter/Saturn ≤ 13′ (Grenze der Tabelle), Aufgänge ≤ 1 min.
- **Helligkeit:** Formeln des *Astronomical Almanac* (Hilton 2005) mit Phasenwinkel; Saturn zusätzlich mit Neigung der Ringe (Meeus, Kap. 45).
- **Sichtbar:** Planet ≥ 5° hoch, Sonne < −6° (`MIN_ALT`, `DARK`), in Schritten von 10 Minuten über die Nacht, die den Zeitpunkt enthält (sonst die nächste). Arten: `evening`, `morning`, `allNight`, `night`, `eveningMorning`, sonst `nearSun` (Elongation < 20°), `belowHorizon`, `noNight`. Heller als 5 mag = bloßes Auge, sonst „nur mit Fernglas“.
- **Mond:** Meeus, *Astronomical Algorithms*, Kap. 47, die größeren periodischen Glieder (24 für Länge/Entfernung, 13 für Breite), Länge auf J2000 umgerechnet wie bei den Planeten. Gegen astronomy-engine 1850–2050: ≤ 2′, Entfernung ≤ 100 km, Mondphasen ≤ 3 min. `geo('moon')` liefert zusätzlich `km`, `age` (Winkel östlich der Sonne, 0–360°), `phase` (acht Namen) und `parallax`; Auf-/Untergang mit h0 = 0,7275·Parallaxe − 0,567°. `events('moon', …)` gibt die vier Hauptphasen.
- **Jupitermonde:** Meeus Kap. 44, einfache Methode: `jupiterMoons(time)` → `x` (Jupiterradien, positiv nach Westen, entlang des Jupiteräquators), `y` (nach Norden), `behind`. Gegen astronomy-engine im Median 0,1 (Io) bis 0,6 (Kallisto) Jupiterradien.
- **Ereignisse:** tageweise Suche nach Vorzeichenwechsel der Längendifferenz zur Sonne (Konjunktion, Opposition) bzw. lokalen Extremen (größte Elongation, größte Helligkeit der Venus), dann Bisektion/Ternärsuche auf etwa eine Minute.

## Oberfläche (index.html)

- **Ansichten:** „Bis zum Mars“ maßstabsgetreu (1,75 AE bis zum Rand), „Alle Planeten“ mit gestauchtem Abstand (√r). Linie Erde → gewählter Planet, gestrichelt Erde → Sonne, dazwischen der Winkel (Elongation). Namen werden an die erste freie von vier Stellen um den Punkt gesetzt.
- **Texte „Warum?“** entstehen in `explain()` aus Elongation, Seite (Ost = Abend, West = Morgen), Entfernung, Phase, Helligkeit und dem nächsten Höhepunkt (größte Helligkeit/Opposition innerhalb ±75 Tagen). `ctx(lang)` liefert die Formatierung: auf der Seite in der eingestellten Sprache, für WebMCP immer englisch.
- **Gespeichert** (`planets.settings.v1`): `{ lat, lon, place: 'auto'|'manual', fromGeo, geoAsked, view: 'inner'|'all'|'sky', speed: 'hour'|'day'|'week'|'month'|'year', planet }`. Der Zeitpunkt wird nicht gespeichert (Start = jetzt). Alte Einstellungen ohne `place` gelten als `auto`.
- **Standort** (`autoLocate`, `locate`): Normalfall `place: 'auto'`. Beim ersten Start fragt die App einmal ohne Tippen (`geoAsked`), danach nur, wenn der Browser es schon erlaubt (`navigator.permissions.query`, `granted`) – eine Ablehnung wird nicht bei jedem Start erneut abgefragt, stattdessen der Knopf *Standort verwenden* unter der Liste (`#geoRow`). Ohne Permissions-API (ältere Safari) wie `prompt`. Bis der Standort da ist, gelten die zuletzt gespeicherten Koordinaten (`fromGeo` = von einem früheren Standort) bzw. die Mitte Deutschlands. *Von Hand* im Menü (`place: 'manual'`) zeigt Breite/Länge; Tippen dort schaltet ebenfalls auf `manual`. Koordinaten auf 0,1° gerundet, nie protokolliert (Diagnose nur Zustand/Fehlercode) oder an Agenten gegeben.
- **Mond in der Oberfläche:** wählbar wie ein Planet (`SKY = ['moon', ...PLANETS]`, gespeichert als `planet: 'moon'`), eigene Erklärung in `explainMoon()` (beleuchtete Seite rechts beim zunehmenden Mond auf der Nordhalbkugel, auf der Südhalbkugel umgekehrt). Im Bild in seiner echten Richtung, aber 16 px neben der Erde.
- **Jupitermonde in der Oberfläche:** SVG auf der Jupiter-Karte (`renderJupiterMoons`), Norden oben, Osten links, verdeckte Monde nur in der Bildunterschrift.
- **Kompass** (`view: 'sky'`, `drawSky`): Beobachter in der Mitte, Azimut = Richtung (Norden oben), Abstand zur Mitte = 90° − Höhe; Hintergrund nach Sonnenhöhe (Tag/Dämmerung/Nacht). Der Gewählte unter dem Horizont: gestrichelter Ring am Rand. *Ausrichten* dreht mit dem Gerätekompass: iPhone `webkitCompassHeading` nach `DeviceOrientationEvent.requestPermission()`, Chrome `deviceorientationabsolute` (Richtung = 360° − alpha), plus Bildschirmdrehung. Lehnt Chrome `requestPermission` ab (Fehler statt Antwort), wird trotzdem gelauscht; ohne Daten nach 3 s Hinweis und aus. Verlassen der Ansicht beendet es.
- **Mondkalender** (`calDlg`, `moonMonth`, `renderCal`): Monat mit der Mondgestalt um 21 Uhr je Tag (SVG aus beleuchtetem Anteil und Seite, wie `drawMoonShape` auf dem Canvas), Hauptphasen mit Uhrzeit; Antippen setzt den Tag 21 Uhr und wählt den Mond.
- **Tempo:** `hour` (1 h/s) dazu, deshalb `.chips` statt `.seg`.
- **WebMCP:** `set_time`, `get_sky` (nur lesen, mit Mondphase), `explain_planet` (auch `moon`; bei Jupiter mit Lage der Monde), `get_moon_calendar` (nur lesen). `get_sky` gibt zusätzlich Höhe und Himmelsrichtung zum eingestellten Zeitpunkt.

## Tests

`tests/planets.spec.mjs` prüft die Rechnung gegen veröffentlichte Almanach-Daten (Oppositionen, Konjunktionen, größte Elongationen, Perihel/Aphel, Ringkantenstellung Saturn 2025, Sonnenaufgang Berlin, Mitternachtssonne, Mondphasen Januar/März 2026, Perigäum/Apogäum, Umlaufzeiten der Jupitermonde), dazu die Oberfläche; WebMCP in `tests/webmcp.spec.mjs`.
