# Laserspiegel – Aufbau

Logikrätsel mit Laserstrahl auf einem Feld mit 5 × 5 Plätzen. Spielprinzip (Spiegel, Ziele, Strahlteiler) ist ein verbreitetes Rätsel-Genre; Name, Grafik und alle 50 Rätsel sind eigene – die Rätsel erzeugt `scripts/laser-levels.mjs`. (`.md` wird nicht veröffentlicht.)

```
index.html   Oberfläche: Rätselwahl, Feld (Knöpfe je Platz + SVG für den Strahl), Vorrat, Tipp, Ziehen, WebMCP
engine.js    window.LaserEngine: Regeln ohne DOM – react (was ein Teil mit dem Strahl macht), trace, evaluate
levels.js    window.LaserLevels: 50 Rätsel – generiert von scripts/laser-levels.mjs, nie von Hand ändern
```

## Regeln (engine.js)

- Richtungen 0–3 = oben, rechts, unten, links; Drehung `r` = Vierteldrehungen im Uhrzeigersinn.
- Teile in Grundstellung: Laser schießt nach rechts; Zielspiegel mit Spiegel „\“ (Spiegelseite oben/rechts), Ziel links, unten glatte Seite (schluckt); Strahlteiler und Doppelspiegel auf derselben Diagonale; Kontrollpunkt offen links–rechts; Sperrstein lässt alles durch; Mauer hält den Strahl von jeder Seite auf.
- Gelöst: genau `t` Ziele leuchten, markierte Ziele (`m`) leuchten, jedes Teil außer Sperrstein, Mauer und Laser wird getroffen (Kontrollpunkt: durchquert), Vorrat leer.

## Rätsel erzeugen

```bash
node scripts/laser-levels.mjs [seed]
```

Zufällige Bretter (Teile werden nacheinander auf den Strahlweg gesetzt), daraus Rätsel: einige Teile kommen in den Vorrat, einige Drehungen werden offen (`q`), einige leuchtende Ziele markiert (`m`). Eine vollständige Suche entlang des Strahls zählt die Lösungen – nur Rätsel mit genau einer Lösung bleiben. Je Stufe eine feste Mischung aus 1, 2 und 3 Zielen; sortiert nach Größe des Suchbaums. Die Stufe „Mauern“ (`w01`–`w10`) kam später dazu und steht deshalb in `TIERS` am Ende: So kommen die Stufen davor bei gleichem Startwert genau wie vorher heraus (gelöste Haken bleiben gültig). Ihre Mauern stehen neben dem Strahlweg – sie ändern die Lösung nicht, schließen aber andere Wege aus. Dauert ca. 2 Minuten. Neue Rätsel ändern die Ids nicht, aber ihren Inhalt – gespeicherte „gelöst“-Haken passen dann nicht mehr zum Rätsel; deshalb nur bei Bedarf neu erzeugen und die erwarteten Werte in `tests/laser-mirrors.spec.mjs` und `tests/webmcp.spec.mjs` (Rätsel `e01`) anpassen.

Format je Teil: Buchstabe (L, T, S, D, C, B, W) + Platz (A1–E5) + Drehung + Flags (`q` Drehung offen, `m` muss leuchten). `s` enthält die Lösung: hinzugefügte Teile und die offenen Drehungen. Die Tests prüfen jede Lösung mit einem eigenen, von `engine.js` unabhängigen Strahlverfolger und spielen jedes Rätsel per Tipp bis zum Ende durch.
