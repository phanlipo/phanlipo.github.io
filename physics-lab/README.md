# Physik verstehen – Aufbau

Physik zum Ausprobieren: je Versuch eine Zeichnung, die sofort auf Regler reagiert, das Ergebnis, eine Erklärung in Worten und die Formeln mit den eigenen Zahlen (KaTeX). Werkzeugkasten nach `UI-KONZEPT.md` 4b – jeder Versuch ist ein Werkzeug; Gruppen auf der Übersicht nach Gebiet (Optik, Wellen, …). (`.md` wird nicht veröffentlicht.)

**Leitsatz: Jeder Versuch beantwortet eine Warum-Frage** (als aufklappbarer Abschnitt mit durchgerechnetem Beispiel). Die Frage bestimmt, welche Regler und Anzeigen der Versuch braucht – nicht mehr.

```
index.html   Oberfläche: Übersicht/Tabs (assets/shared/toolbox.js), je Versuch Zeichnung (SVG), Regler, Ergebnisse, Formeln, WebMCP
optics.js    window.Optics: Abbildungsgleichung und Strahlengang, Brechung (Snellius, Fresnel, scheinbarer Ort unter Wasser) ohne DOM
waves.js     window.Waves: Licht durch N Spalte (Intensität, Hauptmaxima, Zeigerkette, Farbe einer Wellenlänge)
atomic.js    window.Atomic: radioaktiver Zerfall (Lebensdauern mit festem Zufall), Wasserstoff nach Bohr, Linien der Elemente
electro.js   window.Electro: Lorentzkraft (Kreisbahn, Umlaufzeit), Stromkreise mit Lämpchen (eins, Reihe, parallel)
thermo.js    window.Thermo: ideales Gas in 2D (Teilchen, Wandstöße, gemessener Druck)
rainbow.js   window.Rainbow: Radius von Haupt- und Nebenbogen, Kreis um den Gegenpunkt der Sonne am Himmel, sichtbarer Anteil
sky.js       window.Sky: Rayleigh-Streuung, Luftmasse, Himmelsfarbe (Spektrum → XYZ → sRGB)
float.js     window.Float: 10 kg Eisen als Würfel oder offene Schale, Archimedes, Eintauchtiefe, höchste Ladung
wing.js      window.Wing: Joukowski-Profil, Potenzialströmung mit Kutta-Bedingung (Stromlinien, Druck, Auftrieb), Strömungsabriss, Abheben
radar.js     window.Radar: Radarwellen am Flugzeug-Querschnitt (Strahlen, Spiegelungen, Echo-Anteil), Radargleichung
mechanics.js window.Mechanics: Faden-/Federpendel (RK4 in festen Schritten, Stoppuhr), gekoppelte Pendel (exakte Lösung), schiefer Wurf mit Luftwiderstand
```

## Optik (optics.js)

- Einheiten cm; Spiegel bzw. Linse bei x = 0, Gegenstand bei x = −g, y nach oben.
- Vorzeichen wie in der Schule („reell = positiv“): g > 0; f > 0 Hohlspiegel/Sammellinse, f < 0 Wölbspiegel/Zerstreuungslinse, f = ∞ ebener Spiegel; b > 0 reelles Bild, b < 0 virtuelles Bild; m = B/G = −b/g, m < 0 = Bild steht Kopf.
- Regler: Spiegel-Krümmung 1/r in 1/m (−40 … 40, Schritt 0,5; r = 100/k cm, f = r/2), Linsen-Brechkraft D in dpt (−25 … 25; f = 100/D cm), Gegenstandsweite 1 … 50 cm. Gegenstandshöhe fest 8 cm.
- Strahlen: Parallelstrahl, Brennpunktstrahl, Strahl durch die Mitte (Spiegel: Scheitelstrahl, Linse: Mittelpunktstrahl). Näherung für achsennahe Strahlen: Knick an der senkrechten Linie x = 0. Der Spiegel wird als „gefaltete Linse“ gerechnet (`fold`: alles nach dem Element an x = 0 gespiegelt) – eine Rechnung für beide Versuche.
- Spiegel-Zeichnung: Parabel x = −y²/2r (die paraxiale Form), Öffnung so begrenzt, dass die Schale höchstens 6 cm tief ist.
- Sehr kleine Bilder (< 22 px) zeigt ein Kästchen oben rechts vergrößert, mit richtiger Richtung („Bild ×n“).

## Brechung (optics.js)

- Stoffe: Wasser 1,33, Glas 1,50, Diamant 2,42; Luft 1,00. Snellius, Grenzwinkel arcsin(n₂/n₁), gespiegelter Anteil nach Fresnel für unpolarisiertes Licht (Dicke und Deckkraft des gespiegelten Strahls).
- Prisma und Regentropfen: Brechzahl nach Cauchy, n = A + B/λ² (Kronglas BK7: 1,5046 + 4200/λ², Wasser: 1,3240 + 3046/λ², λ in nm), sieben Farben von 680 bis 410 nm einzeln verfolgt (Snellius in Vektorform). Prisma gleichseitig (60°), Strahl trifft die Mitte der linken Fläche; Totalreflexion innen wird gespiegelt weiterverfolgt. Tropfen: Eintritt, eine Spiegelung, Austritt; Rückkehrwinkel θ zur Sonnenrichtung, Regenbogen = größtes θ (Suche über 2000 Höhen, entspricht cos²α = (n²−1)/3).
- Stab im Wasser: Der Stab taucht bei x = 0 ein (18 cm darüber und darunter), das Auge sitzt 32 cm entfernt unter dem eingestellten Blickwinkel. Für jeden Punkt unter Wasser wird der echte Strahlweg zum Auge gesucht (Austrittspunkt per Bisektion), dann zwei Strahlen zu den Rändern einer 4-mm-Pupille geradlinig zurückverlängert – ihr Schnittpunkt ist der Ort, an dem das Auge den Punkt sieht. Senkrecht von oben ergibt das h/n.

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

## Atomphysik (atomic.js)

- **Zerfall:** Jedes Atom bekommt beim Auslosen eine Lebensdauer t = −log₂(U) Halbwertszeiten (exponentialverteilt, ohne Gedächtnis); gezählt wird über die sortierte Liste. Die Zeit ist der einzige Zustand – eine Halbwertszeit dauert 3 s, Ende nach 8. Zufall: eigener Generator (mulberry32), Startwert aus `Date.now()` und Laufnummer – in Tests mit `page.clock.install({ time })` fest. Beispiele mit echten Halbwertszeiten (Radon-220 55,6 s, Iod-131 8,02 d, C-14 5730 a) ändern nur die Zeitangaben.
- **Spektrallinien:** Wasserstoff nach Bohr (E_n = −13,6 eV/n², Rydberg mit reduzierter Masse, Vakuum-Wellenlängen), Balmer-Serie 3…6 → 2 mit Energiestufen-Bild (Höhe ∝ 1/n). Helium, Natrium, Neon, Quecksilber: hellste sichtbare Linien (gemessene Werte in Luft, gerundet). Farben der Linien wie bei den Spalten (`Waves.rgb`).

## Elektrizität & Magnetismus (electro.js)

- **Teilchen im Magnetfeld:** Elektron, Proton, Alphateilchen; v = 1 … 10 · 10⁶ m/s, B = 1 … 10 mT, Feld in den oder aus dem Bildschirm. r = m·v/(|q|·B), T = 2π·m/(|q|·B). Maßstab je Teilchen fest (größter Kreis passt ins Bild), damit v und B die Kreisgröße sichtbar ändern. Die Animation ist verlangsamt: 3 s je Umlauf bei 5 mT, proportional zum echten T (hängt nur von B ab, nicht von v). Drehsinn aus F = q·v×B.
- **Erde (Feldlinien):** Dipol im Erdmittelpunkt, B = (3(m·r̂)r̂ − m)/r³, m zeigt etwa nach geografisch Süd, um 10° gegen die Drehachse geneigt. Erdradius 1,6 Einheiten, äußerer Kern 3480/6371, innerer Kern 1220/6371 des Radius. 14 Linien starten auf der Südhalbkugel bei 12 … 67° neben dem magnetischen Nordpol und enden auf der Oberfläche oder am Bildrand. Nur das Feld außerhalb; die Erklärung (Geodynamo) unter „Warum hat die Erde ein Magnetfeld?“.
- **Feldlinien:** Jeder Stabmagnet als zwei Pole (±1, Feld ∝ 1/r²) an seinen Enden; Linien starten auf einem kleinen Kreis um jeden Nordpol (14 je Pol) und werden mit dem Mittelpunktverfahren verfolgt, bis sie einen Südpol erreichen oder das Bild verlassen. Anordnungen: ein Magnet, N gegenüber S, N gegenüber N.
- **Stromkreis:** Batterie ohne Innenwiderstand, ohmsche Lämpchen (2 … 50 Ω), Schaltungen eins/Reihe/parallel und Spannungsteiler (zwei Widerstände, Messgerät an R₂ ohne Stromverbrauch). Helligkeit = Leistung im Verhältnis zum selben Lämpchen allein an derselben Batterie. Die Punkte auf den Drähten sind eine CSS-Animation (Tempo ∝ Strom), bei „weniger Bewegung“ stehen sie still.

## Wärme (thermo.js)

- **Gas in der Box:** 30/80/200 Teilchen der Masse 1 in einem 10 × 8 großen Kasten, nur Wandstöße (ideales Gas). Startgeschwindigkeiten aus der 2D-Maxwell-Verteilung, so skaliert, dass ⟨v²⟩ = 2·T/300 genau stimmt. Heizen skaliert alle Geschwindigkeiten mit √(T_neu/T_alt), die rechte Wand ist verschiebbar. Gemessener Druck = Impuls an die Wände pro Zeit und Wandlänge, gemittelt über 8 Zeiteinheiten; verglichen mit p·A = N·T (beide bezogen auf 300 K und vollen Kasten). Simulation 4-mal schneller als echte Zeit, Schritt 0,004.

## Regenbogen (rainbow.js)

- Wasser nach Cauchy wie bei der Brechung, Farben 680 … 410 nm. Nach k Spiegelungen größter/kleinster Ablenkungswinkel bei cos²α = (n²−1)/(k(k+2)); Radius um den Gegenpunkt θ₁ = 4β − 2α (rot 42,4°, violett 40,8°), θ₂ = 180° + 2α − 6β (rot 50,3°, violett 53,3°).
- Himmelsbild: Kreis mit Winkelradius θ um den Gegenpunkt (Höhe −h), exakt auf der Kugel berechnet und als Azimut/Höhe gezeichnet (±62°). Boden schneidet bei Höhe 0 ab, „Vom Flugzeug“ zeigt den vollen Kreis (Ausschnitt um den Gegenpunkt). Innen etwas heller, Nebenbogen blasser – nur angedeutet.
- Höchster Punkt θ − h, sichtbarer Anteil arccos(tan h / tan θ)/π (Test). Seitenansicht: Strahlen vom Auge unter −h ± θ.

## Blauer Himmel (sky.js)

- Sonne als schwarzer Körper 5778 K, 380–780 nm in 10-nm-Schritten. Optische Dicke der Luft (senkrecht, Meereshöhe, Hansen & Travis 1974): τ(λ) = 0,008569·λ⁻⁴·(1 + 0,0113·λ⁻² + 0,00013·λ⁻⁴), λ in µm (τ₄₅₀ ≈ 0,221, τ₇₀₀ ≈ 0,037). „Tröpfchen“: τ(550 nm) für alle Farben; „Keine Luft“: τ = 0.
- Luftmasse nach Kasten & Young (1989), m(0°) ≈ 37,9. Direktes Licht S·e^(−τm). Himmelslicht: einfache Streuung in einer flachen, gleichmäßigen Schicht mit Rayleigh-Phasenfunktion, L = S·3/(16π)·(1+cos²θ)·m_v·(e^(−τm_s) − e^(−τm_v))/(m_v − m_s).
- Farbe: Spektrum × CIE-1931-Normspektralwertkurven (Gauß-Näherung von Wyman, Sloan & Shirley 2013) → XYZ → sRGB; Belichtung fest (Himmel oben bei 60° Sonnenhöhe = Y 0,9), Helligkeit über Reinhard gedämpft, Farbton bleibt. Sonne immer in voller Helligkeit ihrer Farbe.
- Bild: Panorama ±120° um die Sonne, Höhe 0–90°, 96 × 40 Zellen, weich hochskaliert. Grenzen: keine Mehrfachstreuung, kein Ozon (Chappuis-Absorption hält den Himmel in der Dämmerung blau), kein Staub.
- Ergebnis „Blau wird gestreut“ = (700/450)⁴ ≈ 5,86 (reine 1/λ⁴-Regel); die Formeln zeigen die τ-Werte mit Korrektur.

## Schwimmen (float.js)

- 10 kg Eisen (7870 kg/m³, 1,27 L). Klumpen: Würfel 10,83 cm. Schale: Blech 1 mm → 1,27 m², offene Kiste mit quadratischem Boden a² + 4aH = 1,27 m² (Wände dünn, innen = außen). Flüssigkeiten 1000 / 1025 / 13534 kg/m³.
- Schwimmt, wenn d = M/(ρ·a²) ≤ H (M = Eisen + Ladung); sonst läuft die Schale voll bzw. sinkt der Würfel, Auftrieb dann ρ·g·V_Eisen (Ladung ohne eigenes Volumen). Höchste Ladung ρ·a²·H − 10 kg; am größten bei a = 2H, also 12H² = Fläche → H ≈ 32,5 cm.
- Zeichnung: Becken 1,4 m breit, Ladung als Sandkisten (1600 kg/m³); Kraftpfeile im Verhältnis zueinander. Keine Schwimmstabilität (Kentern).

## Flügel & Auftrieb (wing.js)

- **Profil:** Joukowski z = ζ + 1/ζ eines Kreises durch ζ = 1 (spitze Hinterkante bei z = 2), Mittelpunkt μ = (−dx, dy). Dicke und Wölbung (Anteile der Profiltiefe, gemessen im Sehnen-System, 99 Stellen) werden per Iteration auf die Reglerwerte gebracht. Anstellwinkel α = Winkel zwischen Anströmung und Sehne (Vorderkante–Hinterkante).
- **Strömung:** exakte Potenzialströmung um den Kreis, abgebildet; Γ = 4π·V·a·sin(α_x + β) (Kutta), C_L = 8π·a·sin(α_x + β)/c. Flache Platte: 2π·sin α (Test). Zeichnung im System „Luft von links, Sehne 1 lang, Mitte bei 0“; Stromlinien mit RK4 in festen Zeitschritten (0,01 Sehnenlängen bei freier Strömung), Punkte alle 20 Schritte = gleichzeitig losgeflogene Teilchen (Animation verschiebt nur die Phase). Druckpfeile C_p = 1 − (v/V)², Länge ∝ |C_p|, ohne die Punkte direkt an der Hinterkante.
- **Strömungsabriss:** Potenzialströmung kennt keinen Abriss. Faustregel für den Winkel ab Nullauftrieb: α_s = min(18°, 7° + 80·Dicke + 50·Wölbung) (NACA 0012 ≈ 16°, 4412 ≈ 14° geometrisch, dünne Platte ≈ 7°). Darüber fällt C_L von seinem Wert bei α_s mit exp(−Überschuss/2°) auf den Plattenwert C_L ≈ sin 2α (C_N ≈ 2 sin α). Gezeichnet wird die Kutta-Strömung mit dem verringerten Γ; ein grauer Bereich über dem hinteren Teil (wächst mit dem Überschuss) verdeckt sie und deutet die Wirbel an.
- **Abheben:** C_L = 2mg/(ρv²A), α = α₀ + C_L/a mit a = 2π·Λ/(Λ+2) (Traglinie, elliptisch), v_min bei C_L,max. Typwerte: Papierflieger 5 g, 0,02 m², Λ 2, C_L,max 0,8, α₀ 0°; Segelflugzeug 500 kg, 18 m², Λ 16, 1,4; Sportflugzeug 1100 kg, 16,2 m², Λ 7,4, 1,6; Verkehrsflugzeug 70 t, 122,6 m², Λ 10,4, 2,6 (Klappen); α₀ −2°. Ergibt v_min ≈ 8 / 64 / 94 / 214 km/h.

## Radar & Tarnkappe (radar.js)

- **Form:** Querschnitt von vorn (Meter, y nach oben), Radar weit weg in Richtung u = (cos β, sin β), β = −80 … 80° (negativ = von unten), deshalb parallele Strahlen. Herkömmlich: runder Rumpf (r = 1 m), waagrechte Flügel (y = −0,3), senkrechtes Leitwerk (x = 0, y = 1 … 4), Triebwerke (r = 0,5 m) an senkrechten Pylonen – rechte Winkel Flügel/Leitwerk und Flügel/Pylon. Tarnkappe: Sechseck-Rumpf mit Kanten bei ±3,2 m, Flügel in Verlängerung, Leitwerke um 27° nach außen geneigt; kein Paar Flächen im rechten Winkel (Leitwerk/obere Fläche 82°).
- Jeder Strahl wird gespiegelt (d' = d − 2(d·n)n, Kreise exakt), bis zu 10-mal. **Echo** = Strahl verlässt das Flugzeug höchstens 5° neben der Richtung zum Radar (steht für die Breite der Rückstreukeule, keine Beugung). Echo-Anteil = Breite der zurückkehrenden Strahlen / Breite der getroffenen, je Spiegelung mal r (Metall 1, Beschichtung 0,1 = −10 dB). Gerechnet mit 2000 Strahlen, Kurve über β mit 800 Strahlen je Grad (zwischengespeichert), gezeichnet 40.
- Prüfwert (Test): β = 0, herkömmlich: getroffen y = −1,8 … 4 (5,8 m), zurück Leitwerk 3 m + Pylon 0,5 m + Glanzpunkte 2r·sin 2,5° von Rumpf und Triebwerk → ≈ 62,6 %.
- **Reichweite:** Radargleichung P ∝ σ/R⁴; Bezugsradar sieht 1 m² in 150 km, also R_max = 150 km · (σ/1 m²)^¼ und Echo/Schwelle = σ · (150 km/R)⁴. σ von vorn, grobe öffentliche Schätzwerte: Verkehrsflugzeug 100, Kampfjet 10, Mensch 1, Vogel 0,01, Tarnkappenjet 0,001, Insekt 0,00001 m². Ohne Erdkrümmung und Wetter.

## Speicher

`physics-lab.settings.v1`: `{ view, tab, mirror: { v, g }, lens: { v, g }, waves: { n, l, d, a, p }, pend: { kind, grav, l, k, m1, m2, aS, aF }, coup: { l, q, start }, throw: { ball, a, v, air }, refr: { mode, med, dir, a, e, t, px, db }, decay: { n, ex }, spec: { el, up }, lor: { p, dir, v, b, mode, cfg }, circ: { kind, u, r1, r2 }, gas: { n, t, v }, radar: { mode, shape, b, coat, obj, r }, wing: { mode, a, f, t, plane, vs: { paper, glider, small, airliner } }, sky: { h, mode }, bow: { h, plane, second }, float: { shape, H, c, liq } }` – nur Reglerstellungen und offener Versuch.

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
| 5 | Optik | Brechung, Totalreflexion (Prisma/Regenbogen später) | Warum sieht ein Stab im Wasser geknickt aus? | fertig |
| 6 | Atomphysik | Radioaktiver Zerfall; Spektrallinien (Bohr) | Warum gibt es eine Halbwertszeit, obwohl jeder Zerfall Zufall ist? Warum leuchtet jedes Element in eigenen Farben? | fertig |
| 7 | Magnetismus | Lorentzkraft (Feldlinien später) | Warum fliegen geladene Teilchen im Magnetfeld im Kreis (Polarlicht)? Warum hat die Erde ein Magnetfeld? | fertig |
| 8 | Thermodynamik | Gasteilchen in der Box (p, V, T) | Warum steigt der Druck, wenn das Gas warm wird? | fertig |
| 9 | Elektrizität | Stromkreis mit festen Schaltungen (eins, Reihe, parallel) | Warum leuchten zwei Lämpchen in Reihe schwächer? | fertig |
| 10 | Wellen | Radar & Tarnkappe (Spiegelung am Querschnitt, Radargleichung) | Warum sieht man Tarnkappenflugzeuge (auf dem Radar) nicht? | fertig |
| 11 | Mechanik | Flügel & Auftrieb (Strömung um ein Profil, Abheben) | Warum fliegen Flugzeuge – bei welchem Winkel und welcher Flügelform gibt es Auftrieb? | fertig |
| 12 | Optik | Blauer Himmel (Rayleigh-Streuung, Sonnenstand) | Warum ist der Himmel blau – und abends rot? | fertig |
| 13 | Optik | Regenbogen am Himmel (Kegel um den Gegenpunkt) | Warum ist der Regenbogen rund? | fertig |
| 14 | Mechanik | Schwimmen (Eisen als Klumpen oder Schale, Archimedes) | Warum schwimmt ein Schiff aus Eisen? | fertig |

Ergänzt: Prisma und Regentropfen (zu #5), Feldlinien mit Erde (zu #7), Spannungsteiler (zu #9). Ab etwa 15 Versuchen Tabs mit `data-group` (wie `unit-converter`). Eigenes Vorhaben: freier Schaltkreis-Baukasten (Bauteile verbinden, Knotenanalyse). Bewusst weggelassen: 3D-Orbitale (aufwendig, wenig Einsicht); elastisches Pendel (chaotisch, schwer zu erklären) – höchstens als Zusatz zu #3.
