# Kodiersysteme (`medical-codes`)

Viewer für die Downloads des BfArM (https://www.bfarm.de/DE/Kodiersysteme/Services/Downloads/_node.html).
Die App enthält **keine Klassifikationsdaten**: Mit dem Download kommt ein Nutzungsvertrag mit dem BfArM zustande,
und bfarm.de erlaubt keinen Abruf aus anderen Seiten (kein CORS). Der Nutzer lädt die ZIP-Datei selbst herunter und
öffnet sie hier (Datei wählen, Ziehen, „Teilen an“/„Öffnen mit“).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche: Einrichtung, Suche, Blättern, Detailansicht, „Geladene Dateien“ im Menü, WebMCP |
| `codes.js` | Logik ohne DOM (`self.MedCodes`): ZIP lesen, ClaML- und EDV-TXT-Parser |
| `parse-worker.js` | startet `codes.js` im Worker, damit 30–90 MB große XML-Dateien die Seite nicht blockieren |

## Formate

- **ZIP:** eigener Leser (zentrales Verzeichnis, „stored“ und „deflate“ über `DecompressionStream('deflate-raw')`),
  liest direkt aus dem `File` ohne alles in den Speicher zu laden. Verschachtelte ZIPs (Vorgängerversionen) bis Tiefe 3.
  ZIP64 und Verschlüsselung → Meldung.
- **ClaML 2** (ICD-10-GM, OPS, ICD-10-WHO, ICD-O-3, ICF): eigener Streaming-Scanner statt `DOMParser` (Speicher).
  `Class` → Eintrag mit `code`, `kind`, `usage` (†, *, !), Titel aus der Rubrik `preferred`, übrige Rubriken als
  Teile (Text / `{ ref }` für `Reference`), `Meta`. Kodes aus **Modifikatoren** (`ModifiedBy` + `ModifierClass`,
  z. B. OPS 6. Stelle, ICD-Lokalisationen) werden zusammengesetzt: Ein `ModifiedBy` gilt für die Blätter darunter,
  `ExcludeModifier` nimmt ihn heraus, `ValidModifierClass` beschränkt die Auswahl, ein Modifikator-Kode mit „.“ kommt
  nicht an einen Kode, der schon einen Punkt hat; vorhandene Klassen gehen immer vor.
  Kodierung aus der XML-Deklaration (ISO-8859-1 bei älteren Dateien).
- **EDV-TXT mit „|“** (Alpha-ID-SE, Alphabete): eine Zeile je Eintrag, Text = letztes Feld. Alpha-ID-SE:
  `Gültigkeit|Alpha-ID|Primärkode|Stern|Zusatz|Primärkode 2|ORPHAcode|Text`. Andere Listen: Kodes werden an ihrer
  Form erkannt. UTF-8, sonst Windows-1252.
- **Metadaten-TXT mit „;“** wird bewusst nicht gelesen (Meldung: ClaML nehmen) – die ClaML-Fassung enthält dasselbe
  mit allen Hinweisen.

Die Feldfolge stammt aus der Dokumentation der Formate; mit echten Dateien ließ sich das beim Bau nicht prüfen (die
Tests nutzen nachgebaute Dateien in `tests/medical-codes-data.mjs`). Weicht ein Jahrgang ab, zuerst dort nachstellen.

## Speicher

- Geöffnete Dateien: `Tools.keep` (`file-<id>`, Liste in `files`), `id` aus Name und Größe; beim Start neu gelesen.
- `medical-codes.settings.v1`: `{ active: <dataset-id>, recent: { <dataset-id>: [code | '#<index>'] } }`.
- Detailansicht mit eigenem History-Eintrag (`{ mcDetail, mcDs }`), Zurück-Geste führt zur Liste; nach dem Neuladen
  kommt der offene Kode wieder.

## Offen

- Überleitungstabellen (Vorjahr → aktuell) und Vergleich zweier Jahrgänge.
- ATC/DDD, LOINC, UCUM-Werteliste (andere Formate, nicht auf der Download-Seite bzw. eigene Lizenz).
