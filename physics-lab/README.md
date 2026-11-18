# Physik verstehen – Aufbau

Physik zum Ausprobieren: je Versuch eine Zeichnung, die sofort auf Regler reagiert, das Ergebnis, eine Erklärung in Worten und die Formeln mit den eigenen Zahlen (KaTeX). Werkzeugkasten nach `UI-KONZEPT.md` 4b – jeder Versuch ist ein Werkzeug; Gruppen auf der Übersicht nach Gebiet (Optik, Wellen, …). (`.md` wird nicht veröffentlicht.)

**Leitsatz: Jeder Versuch beantwortet eine Warum-Frage** (als aufklappbarer Abschnitt mit durchgerechnetem Beispiel). Die Frage bestimmt, welche Regler und Anzeigen der Versuch braucht – nicht mehr.

```
index.html   Oberfläche: Übersicht/Tabs (assets/shared/toolbox.js), je Versuch Zeichnung (SVG), Regler, Ergebnisse, Formeln, WebMCP
optics.js    window.Optics: Abbildungsgleichung und Strahlengang ohne DOM
waves.js     window.Waves: Licht durch N Spalte (Intensität, Hauptmaxima, Zeigerkette, Farbe einer Wellenlänge)
mechanics.js window.Mechanics: Faden-/Federpendel (RK4 in festen Schritten, Stoppuhr), gekoppelte Pendel (exakte Lösung), schiefer Wurf mit Luftwiderstand
```

## Optik (optics.js)

- Einheiten cm; Spiegel bzw. Linse bei x = 0, Gegenstand bei x = −g, y nach oben.
- Vorzeichen wie in der Schule („reell = positiv“): g > 0; f > 0 Hohlspiegel/Sammellinse, f < 0 Wölbspiegel/Zerstreuungslinse, f = ∞ ebener Spiegel; b > 0 reelles Bild, b < 0 virtuelles Bild; m = B/G = −b/g, m < 0 = Bild steht Kopf.
- Regler: Spiegel-Krümmung 1/r in 1/m (−40 … 40, Schritt 0,5; r = 100/k cm, f = r/2), Linsen-Brechkraft D in dpt (−25 … 25; f = 100/D cm), Gegenstandsweite 1 … 50 cm. Gegenstandshöhe fest 8 cm.
- Strahlen: Parallelstrahl, Brennpunktstrahl, Strahl durch die Mitte (Spiegel: Scheitelstrahl, Linse: Mittelpunktstrahl). Näherung für achsennahe Strahlen: Knick an der senkrechten Linie x = 0. Der Spiegel wird als „gefaltete Linse“ gerechnet (`fold`: alles nach dem Element an x = 0 gespiegelt) – eine Rechnung für beide Versuche.
- Spiegel-Zeichnung: Parabel x = −y²/2r (die paraxiale Form), Öffnung so begrenzt, dass die Schale höchstens 6 cm tief ist.
- Sehr kleine Bilder (< 22 px) zeigt ein Kästchen oben rechts vergrößert, mit richtiger Richtung („Bild ×n“).

## Licht durch Spalte (waves.js)

- Fraunhofer-Näherung, Schirm L = 1 m. λ in nm (380 … 750), Spaltabstand d und Spaltbreite a in µm, N = 1 … 20; a ≤ d (wird beim Einstellen begrenzt).
- I/I0 = (sin β/β)² · (sin(NΔφ/2) / (N sin(Δφ/2)))², Δφ = 2π d sinα/λ, β = π a sinα/λ.
- Gezeigter Ausschnitt: ±3,5 Ordnungen (sin α ≤ 0,95), unabhängig von N – so lassen sich 1, 2, 20 Spalte direkt vergleichen. Die Markierung („Stelle auf dem Schirm“) wird als Anteil dieses Ausschnitts gespeichert.
- Schirmbild als Canvas (Helligkeit je Pixel über 4 Stellen gemittelt, damit schmale Gitterstreifen nicht zwischen Stützstellen fallen), Helligkeitskurve und Zeigerdiagramm als SVG. Das Zeigerdiagramm füllt seinen Kasten (Pfeil höchstens 50 px), damit auch ein geschlossenes Vieleck sichtbar bleibt; die Länge der Summe steht als % darunter.
- Erklärung je Stelle: Hauptmaximum (Δs ganzzahlig, ±0,01 λ), fehlende Ordnung (dort Minimum des Einzelspalts), dunkel (Zeigersumme < 1 %), sonst teilweise.

## Schwingungen (mechanics.js)

- **Pendel:** zwei Pendel nebeneinander (Massen m₁, m₂), Fadenpendel exakt φ'' = −(g/l)·sin φ, Federpendel x'' = −(k/m)·x; RK4 mit festem Schritt 1 ms, unabhängig von der Bildrate. Die „Stoppuhr“ misst die Zeit zwischen zwei Nulldurchgängen nach oben (interpoliert). Exakte Periode zum Vergleich: T = T₀ / AGM(1, cos(φ₀/2)). Ort: Erde 9,81, Mond 1,62, Mars 3,71 m/s².
- **Gekoppelte Pendel:** kleine Winkel (10°), Kopplung κ = q·g/l (q = Regler in %); Eigenkreisfrequenzen ω₁ = √(g/l), ω₂ = √(g/l + 2κ), exakt gelöst – die Zeit ist der einzige Zustand. Energiebalken: Energie jedes Pendels ohne den Anteil der Feder (ein ruhendes Pendel zeigt genau 0 %). Die Kurve zeigt eine Schwebungsdauer (höchstens 90 s) im Voraus, eine Linie läuft mit.
- Animation: eine Schleife (`anim`) für den laufenden Versuch; sie hält an bei Übersicht, Wechsel des Versuchs und verborgener Seite. Start nur per Knopf (kein Autostart, damit auch „weniger Bewegung“ respektiert ist). Tests mit `page.clock.install()` und `runFor`.

## Schiefer Wurf (mechanics.js)

- Abwurf vom Boden, Luftwiderstand F = ½·ρ·c_w·A·v² gegen die Flugrichtung (ρ = 1,2 kg/m³), RK4 mit 2 ms, Landung auf y = 0 interpoliert. Bälle (m, d, c_w): Stoßkugel 7,26 kg / 12 cm / 0,45; Fußball 430 g / 22 cm / 0,25; Tennisball 58 g / 6,7 cm / 0,55; Tischtennisball 2,7 g / 4 cm / 0,45 – typische Werte, ohne Drall (Magnus-Effekt).
- Weite über Winkel: Simulation für 1 … 89°, bester Winkel auf 0,1° verfeinert; zwischengespeichert für Ball, Geschwindigkeit und Luft (der Winkel-Regler rechnet nur die eine Bahn neu).
- Der Ball fliegt nach „Werfen“ in echter Zeit über dieselbe Animationsschleife wie die Pendel.

## Speicher

`physics-lab.settings.v1`: `{ view, tab, mirror: { v, g }, lens: { v, g }, waves: { n, l, d, a, p }, pend: { kind, grav, l, k, m1, m2, aS, aF }, coup: { l, q, start }, throw: { ball, a, v, air } }` – nur Reglerstellungen und offener Versuch.

## Erweitern

Neuer Versuch = Kachel + Tab + `section.card.panel`; Logik ohne DOM in eine eigene Datei im App-Ordner (wie `optics.js`), fachliche Tests mit unabhängig nachgerechneten Werten in `tests/physics-lab.spec.mjs`. Ab etwa 6 Versuchen Gruppen auf der Übersicht (h2 je Gebiet).

Neue Versuche mit **Animation** (Pendel, Wurf, Teilchen): `requestAnimationFrame` nur, solange der Versuch offen und die Seite sichtbar ist (anhalten in `onOverview`, bei `visibilitychange` und beim Tab-Wechsel), `prefers-reduced-motion` beachten (dann Start per Knopf); in Tests feste Zeit (`page.clock`) und festgelegter Zufall.

## Plan (Reihenfolge) mit Warum-Fragen

| # | Gebiet | Versuch | Warum-Frage | Stand |
|---|---|---|---|---|
| 1 | Optik | Gewölbter Spiegel, Linse | Warum steht das Bild im Löffel Kopf? | fertig |
| 2 | Wellen | Licht durch N Spalte | Warum wird das Muster mit mehr Spalten schärfer? | fertig |
| 3 | Schwingungen | Fadenpendel, Federpendel, gekoppelte Pendel (Schwebung) | Warum hängt die Schwingungsdauer beim Fadenpendel nicht von der Masse ab (beim Federpendel aber schon)? Warum wandert die Energie zwischen gekoppelten Pendeln hin und her? | fertig |
| 4 | Mechanik | Schiefer Wurf mit/ohne Luftwiderstand | Warum fliegt der Ball mit Luftwiderstand unter weniger als 45° am weitesten? | fertig |
| 5 | Optik | Brechung, Totalreflexion, Prisma | Warum sieht ein Stab im Wasser geknickt aus? | geplant |
| 6 | Atomphysik | Radioaktiver Zerfall; Spektrallinien (Bohr) | Warum gibt es eine Halbwertszeit, obwohl jeder Zerfall Zufall ist? Warum leuchtet jedes Element in eigenen Farben? | geplant |
| 7 | Magnetismus | Lorentzkraft, Feldlinien | Warum fliegen geladene Teilchen im Magnetfeld im Kreis (Polarlicht)? | geplant |
| 8 | Thermodynamik | Gasteilchen in der Box (p, V, T) | Warum steigt der Druck, wenn das Gas warm wird? | geplant |
| 9 | Elektrizität | Stromkreis mit festen Schaltungen (Reihe, parallel, Spannungsteiler) | Warum leuchten zwei Lämpchen in Reihe schwächer? | geplant |

Später/eigenes Vorhaben: freier Schaltkreis-Baukasten (Bauteile verbinden, Knotenanalyse). Bewusst weggelassen: 3D-Orbitale (aufwendig, wenig Einsicht); elastisches Pendel (chaotisch, schwer zu erklären) – höchstens als Zusatz zu #3.
