# Quantenputt – Aufbau

Minigolf mit einem Quanten-Ball: Nach dem Schlag läuft der Ball als Wellenpaket (Schrödinger-Gleichung), der Spieler misst im richtigen Moment, und die Messung legt den Ball nach |ψ|² fest. Die Spielidee stammt von „Quantum Minigolf“ (Friedemann Reinhard, 2007, GPL); Rechnung, Bahnen, Grafik und Ablauf (mehrere Schläge mit Par, Weiterspielen vom Messpunkt, Chance-Anzeige, klassische Vergleichskugel) sind eigene – kein Code und keine Bahnen übernommen. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche (Bühne): Bahnwahl, Bahn als Canvas, Status, Chance „Im Loch“, Hauptknopf, Einstellungen, Hilfe
engine.js    window.PuttEngine: 10 Bahnen, Potential, FFT, Split-Operator-Simulation, Messung, klassische Kugel
app.js       Spielablauf (aim → fly → holed), Zielen (Ziehen, Tasten), Zeichnen, Bestwerte, Einstellungen, WebMCP
```

## Physik (engine.js)

- Gitter 128 × 256 (Zweierpotenzen für die eigene Radix-2-FFT), ħ = 1, m = ½ → H = −∇² + V, Gruppengeschwindigkeit 2k.
- Zeitschritt DT = 0,5: FFT → e^{−ik²DT} → inverse FFT → e^{−iV·DT}. Frei ist das exakt; ca. 3 ms je Schritt am Desktop.
- **Wände** sind eine endliche Stufe V_WALL = 4 (über der größten Energie K_MAX² ≈ 1,7). Die Welle dort zu löschen (wie im Original mit kleinem Zeitschritt) schluckt bei DT = 0,5 bei jedem Abprall fast alles; eine höhere Stufe lässt wegen der Phase V·DT durch. Rand 4 Zellen breit, weil die FFT periodisch ist.
- Stärke 0–1 → k = 0,3…1,3; Breite des Balls σ = 4/7/10 (Std.-Abw. von |ψ|²). Breiter = genauerer Impuls, läuft langsamer auseinander.
- Messung: kumulierte Summe von |ψ|² ohne Wandzellen, ein Zufallswert wählt die Zelle (Bornsche Regel; das Original zieht nach |ψ|⁴).
- Klassische Kugel: x' = 2p, p' = −∇V (zentrale Differenzen), 8 Unterschritte, Abprall an Wandzellen.

## Bahnen

Eigene Entwürfe; Par und Lösbarkeit mit Probeschüssen abgestimmt (beste Chance eines Schlags von 50 % auf der freien Bahn bis ca. 1 % im Zickzack, das über mehrere Schläge gespielt wird). Die Tests prüfen je Bahn einen Schuss mit Mindest-Chance – wer Bahnen ändert, passt die Werte in `tests/quantum-putt.spec.mjs` an.

## Oberfläche (app.js)

- Tempo: 0,5/1/2 Schritte je Bild, höchstens ca. 28 ms Rechnen je Bild (langsame Geräte: Zeitlupe statt Ruckeln).
- Gespeichert: `quantum-putt.settings.v1`, `quantum-putt.scores.v1` (bester Schlagwert je Bahn), `quantum-putt.game.v1` (Bahn, Schläge, Lage des Balls, eingelocht) – nie die Welle; fliegt der Ball beim Neuladen, liegt er wieder am letzten Platz (der Schlag zählt).
- Tests halten die Uhr an (`page.clock.install()`), dann läuft die Welle nur über die WebMCP-Schritte bzw. `runFor`.
