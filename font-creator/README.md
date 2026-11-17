# Schrift-Baukasten (`font-creator`)

Eigene Schrift zeichnen, live im Beispieltext sehen, als TrueType-Datei (`.ttf`) herunterladen – ohne Bibliothek.

## Dateien

- `index.html` – Oberfläche: Zeichenwahl, Zeichenfläche (Stift, Radierer, Rückgängig), Vorschau, Download, WebMCP.
- `ttf.js` – ohne DOM: Striche → Konturen (`FontTTF.strokeContours`), Vereinfachen (`FontTTF.simplify`, Ramer–Douglas–Peucker), Schriftdatei schreiben (`FontTTF.build`).

## Datenformat (`font-creator.font.v1`)

`glyphs: { "A": [[breite, x0, y0, x1, y1, …], …] }` – ein Eintrag je Strich in Einheiten der Zeichenfläche
(0…1000, y nach unten). Grundlinie bei y = 800, Großbuchstabenhöhe y = 100, x-Höhe y = 300; die Schrift hat
1000 Einheiten pro Geviert, Oberlänge 800, Unterlänge −200. Dazu `name`/`sample` (`null` = Standardtext der
Sprache), `width`, `template`, `size`, `spacing` (Seitenabstand je Zeichen), `wordSpace` (Leerzeichen), `extra`
(selbst hinzugefügte Zeichen). Nur Zeichen aus der Basisebene (≤ U+FFFF), weil `cmap` Format 4 genutzt wird.

## Vom Strich zur Kontur

Jeder Strich wird zu einem Kreis je Punkt (8 Off-Curve-Punkte, um 22,5° gedreht, damit die Punkte genau den
Kreis begrenzen) und einem Rechteck je Teilstück, alle im Uhrzeigersinn. TrueType füllt nach der
Non-Zero-Regel, überlappende Teile ergeben also einfach den Strich – keine Boolesche Vereinigung nötig.
Die Vorschau lädt die Datei nach jeder Änderung als `FontFace('FontCreatorLive', buffer)` und ersetzt die vorige.

## Tabellen

`cmap` (3/1, Format 4), `glyf`/`loca` (lang), `head`, `hhea`, `hmtx`, `maxp` 1.0, `name` (3/1/0x409),
`OS/2` v4 (`USE_TYPO_METRICS`), `post` 3.0. Glyph 0 `.notdef` (Kasten), Glyph 1 Leerzeichen.
Prüfung im Test (`tests/font-creator.spec.mjs`): Tabellen, `cmap`, Namen, Breiten und die Gesamt-Prüfsumme.
