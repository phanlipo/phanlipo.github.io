# Quantenmagnetismus – Aufbau

Ising-Modell zum Zuschauen: klassisch per Monte Carlo auf drei Gittern und als Quanten-Kette im Querfeld, exakt diagonalisiert. Alles läuft auf dem Gerät, ohne Bibliotheken. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Gitter/Ring als Canvas, Werkzeugleiste, Bedienfeld mit Messwerten, Diagramm, Reglern; Hilfe
lattice.js   window.IsingLattice: Gitter (Nachbarn, Bindungen, Zeichenpositionen, Untergitter), Metropolis, exakte Werte
chain.js     window.QuantumChain: Quanten-Ising-Ring, Lanczos, Messgrößen (σˣ, σᶻ, Korrelationen, Verschränkung)
app.js       Einstellungen, Animationsschleife, Zeichnen, Diagramme, Temperatur-Scan, Hysterese, WebMCP
```

## Gitter (lattice.js)

- Periodische Ränder. Quadrat L×L (4 Nachbarn); Dreieck L×L in axialen Koordinaten (6 Nachbarn, L durch 3 teilbar, damit die drei Untergitter passen); Kagome L×L Zellen à 3 Plätze (4 Nachbarn). Bindungslänge 1.
- Gezeichnet wird ein Rechteck: Die Gitter sind entlang x periodisch, x wird in `[0, W)` gefaltet. Bindungen über den Rand werden nicht gezeichnet; Plätze am linken/rechten Rand doppelt, damit keine Lücken bleiben.
- Metropolis mit Tabelle der Annahme-Wahrscheinlichkeiten je (Spin, Nachbarsumme), neu berechnet bei jeder Änderung von J, h, T. Zufall: mulberry32 mit Startwert (Tests).
- `measure()`: m, Untergitter-Ordnung (Quadrat: Schachbrett; sonst halbe größte Differenz zweier Untergitter, 1 für „zwei hoch, einer runter“), Energie je Spin, Anteil unzufriedener Bindungen.
- Exakt bekannt (`exact`): T_c Quadrat 2/ln(1+√2) (Onsager), Dreieck 4/ln 3, Kagome 4/ln(3+2√3) (Ferro, und Antiferro auf dem Quadrat); Restentropie des Antiferro-Dreiecks 0,3383 (Wannier), Kagome 0,5018 (Kanô & Naya); Grundzustand frustriert: ⅓ der Bindungen unzufrieden. `onsagerM(T)` = (1 − sinh(2/T)^−4)^(1/8).

## Quanten-Kette (chain.js)

- H = −J Σ σᶻσᶻ − Γ Σ σˣ − h Σ σᶻ auf einem Ring, Basis = Bitmuster (Bit = 1 ↔ oben), N = 3…10 in der Oberfläche (2^N Zustände).
- Lanczos mit voller Re-Orthogonalisierung und festem Pseudozufalls-Start (reproduzierbar). Bei h = 0 getrennt in den Sektoren gerade/ungerade unter „alle Spins umdrehen“: So erscheinen entartete Niveaus innerhalb eines Sektors genau einmal, die Kurven im Spektrum springen nicht, und für Γ → 0 entsteht der Katzenzustand statt einer zufälligen Mischung.
- Verschränkung: ρ_A der ersten ⌊N/2⌋ Spins aus ψ (reell), Eigenwerte per Jacobi, Entropie in bit.
- Probe: `exactE0` – Lösung über freie Fermionen (Pfeuty 1970), gilt bei h = 0 für Ferro und für Antiferro mit gerader Anzahl.

## Oberfläche (app.js)

- Eine `requestAnimationFrame`-Schleife läuft nur, solange etwas läuft (Simulation, Scan, Γ-Durchlauf, Spektrum-Rechnung). Ohne `prefers-reduced-motion` startet die Simulation von selbst.
- Temperatur-Scan: 30 Temperaturen von T_max bis 0,2, je Größe 150–250 Durchläufe Einschwingen und 400–600 Messen; C und χ aus den Schwankungen. Rechnet je Bild ca. 12 ms, damit man das Abkühlen sieht.
- Gespeichert werden nur Einstellungen (`quantum-magnetism.settings.v1`), nie Spins oder Kurven.
