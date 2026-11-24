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

Geprüft mit den echten Dateien (November 2026): ICD-10-GM 2026 (ClaML, Metadaten, Alphabet), OPS 2027 (ClaML,
Alphabet), Alpha-ID-SE 2027, ICD-10-WHO 2019, ICD-O-3 2. Revision, ICF 2005. Die Tests bilden deren Eigenheiten in
`tests/medical-codes-data.mjs` nach (die echten Dateien stehen unter der Lizenz des BfArM und gehören nicht ins Repo).

- **ZIP:** eigener Leser (zentrales Verzeichnis, „stored“ und „deflate“ über `DecompressionStream('deflate-raw')`),
  liest direkt aus dem `File`. Verschachtelte ZIPs (Vorgängerversionen) bis Tiefe 3. ZIP64 und Verschlüsselung →
  Meldung. Neben den Daten liegen PDFs und `…_liesmich.txt` (beschreiben die Felder, auch mit „|“) – übersprungen.
- **ClaML 2** (ICD-10-GM, OPS, ICD-10-WHO, ICD-O-3, ICF): eigener Streaming-Scanner statt `DOMParser` (Speicher).
  - Titel: `preferredLong`, sonst `preferred` (ICD-10-GM: „S52.01 Olekranon“ → „Fraktur des proximalen Endes der
    Ulna: Olekranon“). Geschützte Leerzeichen („Stadium I“) bleiben.
  - `Fragment type="list"` gehört in eine Zeile („Diabetes mellitus: juveniler Typ“), `Reference class="in brackets"`
    steht in Klammern; `usage` dagger/aster/optional → †, *, !.
  - **Modifikatoren** (ICD 4./5. Stelle, OPS 6. Stelle): ein `ModifiedBy` gilt für die Blätter darunter, mehrere
    hintereinander werden kombiniert, `ExcludeModifier` nimmt ihn heraus, `ValidModifierClass` (OPS, `all="false"`)
    beschränkt die Auswahl, `Meta excludeOnPrecedingModifier="S04E10_4 .0"` verbietet eine Kombination (kein E10.00);
    ein Modifikator-Kode mit „.“ kommt nicht an einen Kode mit Punkt; vorhandene Klassen gehen vor. Erzeugte Kodes
    bekommen nur die `Meta` ihrer Modifikator-Klasse (OPS: `ZusatzK` …), nicht die des Dreistellers.
  - **ICF:** die Modifikatoren (`Q_…`, Kodes `xxx.0`) sind Beurteilungsmerkmale – nicht ausmultipliziert, sondern
    beim Kode angezeigt (sonst 217.000 Schein-Kodes).
  - „ICD-10“ heißt im `Title` sowohl GM als auch WHO; der Dateiname unterscheidet.
  - `Meta` (§ 295/§ 301, Alter, Geschlecht, IfSG, OPS § 17b/d, Zusatz-/Einmalkode) mit den Bedeutungen aus den
    Liesmich-Dateien übersetzt.
- **EDV-TXT mit „|“**, Text = letztes Feld:
  - Alpha-ID-SE (UTF-8): `Gültigkeit|Alpha-ID|Primär|Stern|Zusatz|Primär 2|ORPHAcode|Text`.
  - ICD-10-GM-Alphabet (Windows-1252): `Art|Nummer|Druckkennzeichen|Primär|Stern|Zusatz|Primär 2|Text`.
  - OPS-Alphabet (UTF-8): `Art|Id|Kode|Kode 2|Text`; „↔“ hinter dem Kode = Seitenangabe nötig.
  - Das Kreuz steht in den TXT-Dateien als „+“ (A01.0+), die App zeigt †. Art 0 = reiner Verweis ohne Kode.
- **Metadaten-TXT mit „;“** wird bewusst nicht gelesen (Meldung: ClaML nehmen) – die ClaML-Fassung enthält dasselbe
  mit allen Hinweisen.

### Ergebnis der Prüfung mit den echten Dateien

| Prüfung | Ergebnis |
|---|---|
| ICD-10-GM 2026: Kodes aus ClaML (inkl. zusammengesetzter) gegen `icd10gm2026syst_kodes.txt` | 16.905 = 16.905, keiner fehlt, keiner zu viel |
| ICD-10-GM 2026: Titel gegen die Metadaten | alle gleich (bis auf Verweise in Klammern, die die ClaML im Titel führt) |
| Kodes aus Alpha-ID-SE / ICD-Alphabet / OPS-Alphabet in der Systematik | 94.522 / 94.262 / 49.310 – alle vorhanden |
| Einträge | ICD-10-GM 17.177, OPS 39.530, ICD-10-WHO 16.151, ICD-O-3 1.622, ICF 1.495, Alpha-ID-SE 91.165, ICD-Alphabet 89.613, OPS-Alphabet 49.366 |
| Alle 8 Dateien zusammen im Browser (Chromium, Desktop) | ~6 s Einlesen, ~180 MB Speicher, Suche < 120 ms |

## Speicher

- Geöffnete Dateien: `Tools.keep` (`file-<id>`, Liste in `files`), `id` aus Name und Größe; beim Start neu gelesen.
- `medical-codes.settings.v1`: `{ active: <dataset-id>, recent: { <dataset-id>: [code | '#<index>'] } }`.
- Detailansicht mit eigenem History-Eintrag (`{ mcDetail, mcDs }`), Zurück-Geste führt zur Liste; nach dem Neuladen
  kommt der offene Kode wieder.

## Offen

- Überleitungstabellen (Vorjahr → aktuell) und Vergleich zweier Jahrgänge.
- ATC/DDD, LOINC, UCUM-Werteliste (andere Formate, nicht auf der Download-Seite bzw. eigene Lizenz).
