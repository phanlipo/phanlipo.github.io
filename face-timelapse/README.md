# Gesichter-Zeitraffer (`face-timelapse`)

Fotos derselben Person → Gesicht in jedem Bild erkennen, gerade rücken, gleich groß in die Mitte setzen → Video (MP4/WebM) oder GIF.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche, Ablauf, Speichern (Tools.keep), Export, WebMCP |
| `timelapse.js` | Logik ohne DOM: Formate, Augen aus Landmarks, Transformation, Bildfolge (`schedule`), EXIF-Datum, Zeichnen eines Bilds |
| `gif.js` | eigener GIF89a-Encoder: Palette je Bild (Median Cut auf 15-bit-Histogramm), LZW, Endlosschleife |
| `face-worker.mjs` | MediaPipe Face Landmarker (IMAGE-Modus, CPU) mit Netzsperre gegen die Nutzungsstatistik (wie `camera-effects`) |
| `heic-worker.js` | HEIC-Decoder (gemeinsamer Code in `assets/shared/`) |

## Entscheidungen

- **Ausrichtung über die Augen:** Mitte der Iris (Punkte 468/473), sonst Mitte der Augenwinkel. Augenabstand = Gesichtsbreite / 2,5; Augen auf 40 % Höhe, waagerecht. Nur drehen/verschieben/skalieren, nie verzerren.
- **Mehrere Gesichter:** das größte; im Editor „Anderes Gesicht“. Ohne Gesicht bleibt ein Foto draußen, bis die Augen von Hand gesetzt sind. Ohne Download (abgelehnt/fehlgeschlagen) geht alles von Hand.
- **Speicher:** pro Foto nur eine Kopie mit max. 720 px (Vorschau, Vorschaubilder); für den Export wird jede Datei neu dekodiert (volle Qualität, wenig Speicher). Höchstens 300 Fotos.
- **Zeiten:** alles in ganzen Bildern (Video 30 fps, GIF 15 fps); Überblenden = zweite Hälfte der Zeit pro Foto; letztes Foto mindestens 1 s. Video mit variabler Bilddauer (ein Bild pro Standbild).
- **Video:** Mediabunny `CanvasSource`; erst MP4 (avc, vp9, av1, hevc), sonst WebM. Ohne WebCodecs nur GIF.
- **GIF ohne Bibliothek:** die gängigen Encoder sind seit Jahren ohne Release (Regel in `assessHealth`).
- **Service Worker:** vor dem ersten Start der Erkennung wartet die App kurz, bis der Service Worker die Seite steuert – sonst fehlte das Rechenprogramm offline.

## Offene Ideen

- Hintergrund statt Schwarz unscharf aus dem Foto füllen.
- Gesicht passend zum vorigen Foto wählen (gleiche Person in Gruppenfotos).
- Fotos per Ziehen umsortieren.
