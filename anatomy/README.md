# Anatomie 3D – Aufbau

3D-Atlas des menschlichen Körpers: sieben Ebenen (Haut, Muskeln, Skelett, Organe, Herz & Gefäße, Nerven & Sinne, Lymphsystem), frei drehbar, jeder Teil antippbar mit deutschem, lateinischem und englischem Namen, Beschriftung der größten sichtbaren Teile, Suche, Quiz. (`.md` wird nicht veröffentlicht.)

```
index.html          Oberfläche: Ebenen-Chips, Infokarte, Beschriftung, Suche, Quiz, Einstellungen, WebMCP
viewer.mjs          3D-Ansicht (three.js): Szene, Kamera (Drehen/Neigen/Zoomen/Verschieben), Ausblenden, Hervorheben,
                    Antippen und Beschriftung über einen Puffer mit Teil-Nummern
models/index.json   alle Teile: Ebene, Englisch, Seite, Latein, Deutsch, Farbe, Bereiche in der .bin
models/<ebene>.bin  Geometrie je Ebene – erzeugt von scripts/anatomy/pack.mjs, nie von Hand ändern
models/LICENSE.txt  Herkunft und Lizenz der Modelle (CC BY-SA 4.0)
```

## Darstellung (viewer.mjs)

- **Eine Ebene = ein Mesh** (ein Draw-Call) mit Farbe und Teil-Nummer je Ecke. Teile sind Bereiche darin: *Ausblenden* setzt die Dreiecke des Teils im Index-Puffer auf 0, *Hervorheben* überschreibt seine Farben. So bleiben es 7 Draw-Calls statt 2 400.
- **Antippen und Beschriftung** rendern die Teil-Nummern (RGB = Nummer + 1) in ein Render-Target statt Strahlen durch 600 000 Dreiecke zu schicken: Antippen liest 1 Pixel (`setViewOffset`), die Beschriftung ein ca. 200 px breites Bild und zählt die sichtbare Fläche je Teil. Durchscheinende Ebenen (Haut unter 90 % Deckkraft) verdecken dabei nichts; getroffen werden sie nur, wo nichts anderes liegt.
- Gerendert wird nur bei Änderungen (Kamera, Ebenen, Farben) – spart Akku.
- three.js kommt aus `assets/vendor/three/` (ES-Module `three.module.js` + `three.core.js`, keine Addons; die Kamera-Steuerung ist eigene Logik).

## Modelle erzeugen

Quelle ist [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) (CC BY-SA 4.0, beruht auf BodyParts3D, CC BY-SA 2.1 JP): `Z-Anatomy.zip` enthält `Startup.blend` (ca. 300 MB, 4 500 Meshes, Gefäße und Nerven teils als Kurven), `TA2.csv` die lateinischen Namen.

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/Z-Anatomy/models-of-human-anatomy za
unzip za/Z-Anatomy.zip -d za/unz
# Blender 4.2 LTS (download.blender.org), ohne Oberfläche:
ANATOMY_OUT=/tmp/anatomy-export blender -b za/unz/Z-Anatomy/Startup.blend --python scripts/anatomy/export.py
node scripts/anatomy/pack.mjs /tmp/anatomy-export za/TA2.csv                                         # → anatomy/models/
node scripts/build.mjs
```

- `export.py` nimmt je Ebene eine Sammlung der Datei, lässt ausgeblendete Objekte, Beschriftungen (`.j`/`.g`) und Hüllen weg (Faszien, Hirnhäute, Bauchfell, Pleura …), wandelt Kurven in Meshes und reduziert jede Ebene mit dem Decimate-Modifier auf ein Dreiecks-Budget (Skelett 140 000, Muskeln 170 000 …; jedes Teil behält mindestens 60). Ergebnis: rohe Float32-Positionen, Uint32-Indizes und JSON je Ebene.
- `pack.mjs` säubert Namen, ergänzt Latein (TA2) und Deutsch (`names-de.mjs`), vergibt Farben und quantisiert die Positionen auf 16 Bit im gemeinsamen Begrenzungsrahmen aller Ebenen. Insgesamt ca. 6 MB, alle im Offline-Cache (`sw.js`).
- **Deutsche Namen:** Z-Anatomy kennt nur Englisch und Latein. `names-de.mjs` hat ein Wörterbuch (Skelett vollständig, bekannte Muskeln, Organe, große Gefäße und Nerven) und Regeln für Reihen (Rippen, Wirbel, Finger-/Zehenglieder, Zähne, „Left/Right …“). Ohne deutschen Namen zeigt die App den lateinischen – so wie im Medizinstudium üblich. Neue Einträge dort ergänzen und `pack.mjs` erneut laufen lassen.
- **Lizenz:** Abgeleitete Modelle stehen ebenfalls unter CC BY-SA 4.0 (`models/LICENSE.txt`, Hilfe der App). Z-Anatomy nennt als Vorlagen auch Modelle unter CC BY-NC (Niere, Lissie Cowley) und CC BY-NC-SA (Innenohr, University of Dundee); welche Meshes daraus übernommen wurden, gibt die Quelle nicht an. Die Seite ist nicht kommerziell.

## Offene Erweiterungen

- Definitionen: Z-Anatomy enthält ~3 800 englische Texte aus Wikipedia (CC BY-SA 3.0) – könnten in der Infokarte erscheinen (Englisch; Größe prüfen).
- Weitere Ebenen aus der Datei: Gelenke und Bänder, Muskelansätze.
- Mehr deutsche Namen (Gefäße, Nerven, Lymphknoten).
