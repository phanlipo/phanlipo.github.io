# Collage (`collage-maker`)

Beliebig viele Fotos → lückenlose Collage → sehr großes JPG oder PNG.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche, Vorschau (Knöpfe mit `object-fit: cover`), Tauschen/Entfernen, Speichern (Tools.keep), Export, WebMCP |
| `layout.js` | Logik ohne DOM: Schnittbaum-Suche („Automatisch“), Reihen/Spalten, Geometrie in Bruchteilen |
| `png.js` | PNG-Encoder in Streifen: Filter „Up“, `CompressionStream('deflate')`, IDAT-Blöcke à ~1 MB, CRC |
| `heic-worker.js` | HEIC-Decoder (gemeinsamer Code in `assets/shared/`) |

## Entscheidungen

- **Lückenlos ohne Beschnitt:** „Automatisch“ ist ein Schnittbaum (slicing tree): jeder Knoten legt zwei Teile nebeneinander (`h`, A = Aa + Ab) oder übereinander (`v`, 1/A = 1/Aa + 1/Ab). Jeder Baum füllt sein Rechteck exakt, und jedes Foto behält seine Form. Die Suche bewertet nur Seitenverhältnis und gleichmäßige Flächen (`score`): bis 6 Bilder alle Bäume, darüber ausgewogener Startentwurf + Bergsteigen (Schnitt umdrehen, zwei Bilder tauschen) mit mehreren Neustarts, Zufall per Seed.
- **Festes Seitenverhältnis:** Der beste Baum trifft es fast (ab etwa 7 Bildern meist < 1 %). Der Rest wird gleichmäßig verteilt: alle Zellen werden etwas gestreckt und die Fotos darin wie `cover` beschnitten. „Frei“ (2:3 … 3:2) beschneidet nichts. Der größte Beschnitt steht unter der Vorschau.
- **Reihen/Spalten:** Reihenfolge bleibt, Aufteilung per dynamischer Programmierung (gleich breite Reihen), Zahl der Reihen nach demselben `score`. Mit festem Verhältnis oft mehr Beschnitt als „Automatisch“.
- **Tauschen/Entfernen** ändert die Positionen nicht neu, sondern dreht nur Schnitte (`refit`), damit das Bild ruhig bleibt.
- **Riesige Bilder:** PNG in Streifen (höchstens 16 MP pro Streifen, Kacheln ≤ 4096 px breit), so passt jede Größe bis 250 MP in den Speicher – nur die gepackte Datei liegt im Speicher. Fotos werden pro Zelle in der nötigen Größe dekodiert (`resizeWidth/Height`, nie größer als das Original) und freigegeben, sobald die Streifen an ihnen vorbei sind. JPG braucht eine Leinwand in voller Größe; schlägt das fehl, bietet die App PNG an.
- **Volle Auflösung** = Median über die Fotos, damit ein einzelnes winziges Feld die Collage nicht riesig macht.
- **Kanten:** Zellränder werden einmal auf ganze Pixel gerundet und von beiden Nachbarn geteilt – keine Haarlinien.
- **HEIC:** kann der Browser es nicht selbst, wird das Foto einmal als JPG (Qualität 95) abgelegt.

## Offene Ideen

- Eigener JPG-Encoder in Streifen (riesige JPGs auch auf dem iPhone).
- Ausschnitt je Foto verschieben (Fokuspunkt statt Mitte), wenn beschnitten wird.
- Fotos per Ziehen tauschen.
