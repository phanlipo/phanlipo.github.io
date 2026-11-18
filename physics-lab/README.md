# Physik verstehen – Aufbau

Physik zum Ausprobieren: je Versuch eine Zeichnung, die sofort auf Regler reagiert, das Ergebnis, eine Erklärung in Worten und die Formeln mit den eigenen Zahlen (KaTeX). Werkzeugkasten nach `UI-KONZEPT.md` 4b – jeder Versuch ist ein Werkzeug; Gruppen auf der Übersicht nach Gebiet (bisher „Optik“). (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche: Übersicht/Tabs (assets/shared/toolbox.js), je Versuch Zeichnung (SVG), Regler, Ergebnisse, Formeln, WebMCP
optics.js    window.Optics: Abbildungsgleichung und Strahlengang ohne DOM
```

## Optik (optics.js)

- Einheiten cm; Spiegel bzw. Linse bei x = 0, Gegenstand bei x = −g, y nach oben.
- Vorzeichen wie in der Schule („reell = positiv“): g > 0; f > 0 Hohlspiegel/Sammellinse, f < 0 Wölbspiegel/Zerstreuungslinse, f = ∞ ebener Spiegel; b > 0 reelles Bild, b < 0 virtuelles Bild; m = B/G = −b/g, m < 0 = Bild steht Kopf.
- Regler: Spiegel-Krümmung 1/r in 1/m (−40 … 40, Schritt 0,5; r = 100/k cm, f = r/2), Linsen-Brechkraft D in dpt (−25 … 25; f = 100/D cm), Gegenstandsweite 1 … 50 cm. Gegenstandshöhe fest 8 cm.
- Strahlen: Parallelstrahl, Brennpunktstrahl, Strahl durch die Mitte (Spiegel: Scheitelstrahl, Linse: Mittelpunktstrahl). Näherung für achsennahe Strahlen: Knick an der senkrechten Linie x = 0. Der Spiegel wird als „gefaltete Linse“ gerechnet (`fold`: alles nach dem Element an x = 0 gespiegelt) – eine Rechnung für beide Versuche.
- Spiegel-Zeichnung: Parabel x = −y²/2r (die paraxiale Form), Öffnung so begrenzt, dass die Schale höchstens 6 cm tief ist.
- Sehr kleine Bilder (< 22 px) zeigt ein Kästchen oben rechts vergrößert, mit richtiger Richtung („Bild ×n“).

## Speicher

`physics-lab.settings.v1`: `{ view, tab, mirror: { v, g }, lens: { v, g } }` – nur Reglerstellungen und offener Versuch.

## Erweitern

Neuer Versuch = Kachel + Tab + `section.card.panel`; Logik ohne DOM in eine eigene Datei im App-Ordner (wie `optics.js`), fachliche Tests mit unabhängig nachgerechneten Werten in `tests/physics-lab.spec.mjs`. Ab etwa 6 Versuchen Gruppen auf der Übersicht (h2 je Gebiet).

Mögliche nächste Versuche (passen zur Architektur: rein rechnend, offline):

- **Brechung** (Snellius, Totalreflexion, Prisma/Regenbogen) – Optik.
- **Schiefer Wurf** mit und ohne Luftwiderstand – Mechanik.
- **Pendel / Federschwinger** (Periodendauer, Energie) – Mechanik.
- **Wellen**: Überlagerung, Interferenz am Doppelspalt, Doppler-Effekt.
- **Stromkreis**: Reihen-/Parallelschaltung, Ohmsches Gesetz.
