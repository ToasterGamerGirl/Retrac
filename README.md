# GRIDFALL

Ein eigenständiges Build-Battle-Royale: springe ab, sammle Loot, baue, editiere und überlebe als Letzte/r gegen Bots.

## Herunterladen & spielen (PC / Mac)

1. **[GRIDFALL.html](GRIDFALL.html)** öffnen und oben rechts auf **„Download raw file“** (Pfeil-Symbol) klicken.
   Alternativ: grüner Button **Code → Download ZIP** und die ZIP entpacken.
2. Die Datei `GRIDFALL.html` **doppelt anklicken**. Sie öffnet sich in Chrome, Edge oder Firefox.
3. **SPIELEN** drücken und ins Bild klicken, damit die Maus gefangen wird. Mit **Esc** pausierst du.

Du musst nichts installieren, und nach dem Download brauchst du auch kein Internet. Das ganze Spiel steckt in dieser einen Datei.
Du brauchst Maus und Tastatur. Auf Handys und Tablets läuft das Spiel nicht.

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Bewegen |
| Maus | Umschauen |
| Shift | Sprinten |
| Leertaste | Springen (im Fallen: Gleiter öffnen) |
| C | Ducken · beim Sprinten: Rutschen |
| Linke Maustaste | Schießen / Bauen (halten = Turbo-Bauen) / Edit-Kacheln wählen |
| Rechte Maustaste | Zielen (ADS) · im Baumodus: Material wechseln · im Edit: zurücksetzen |
| 1 | Spitzhacke (Holz, Stein und Metall abbauen) |
| 2–6 / Mausrad | Inventar-Slots |
| Q / F / E / V | Wand / Boden / Rampe / Pyramide |
| G | Editieren (auf Bauteil zielen) · erneut G = bestätigen |
| R | Nachladen |
| X | Aufheben · Truhe öffnen (halten) |
| B | Emote |
| M | Karte |

## Features

- **Bewegung:** Sprinten, Rutschen (auch Rampen hinunter), Springen, Ducken, Fallschirmsprung mit Gleiter, Schulterkamera mit FOV-Slider
- **Bauen:** Wand, Boden, Rampe und Pyramide im 4-m-Raster, Turbo-Bauen, Holz/Stein/Metall mit unterschiedlicher HP und Aufbauzeit, Statik (Teile ohne Verbindung zum Boden stürzen ein)
- **Editieren:** 3×3-Raster für Wände, 2×2 für Böden, Rampen und Pyramiden. Kacheln per Ziehen auswählen, „Edit on Release“ und „Reset Edit“
- **Gunplay:** Hitscan (Sturmgewehr, MP, Pistole, Pump-Shotgun), Scharfschützengewehr mit echtem Geschoss und Bullet Drop, Bloom mit First-Shot-Accuracy, Kopfschuss-Multiplikatoren, Schadensabfall auf Distanz
- **Loot:** 5 Slots, 5 Seltenheitsstufen (Grau bis Gold), Truhen, Bodenloot, Schilde und Heilung, Munition, Materialien
- **Spind:** Outfits, Rucksäcke, Spitzhacken, Lackierungen und Emotes mit Musik. Alles ist freigeschaltet und lokal gespeichert
- **Match:** 3–30 Bots in drei Schwierigkeitsstufen, schrumpfender Sturm, Kill-Feed, Minimap, Endwertung

Alle Inhalte (Figuren, Kosmetik, Karte, Sounds) sind eigene, prozedural erzeugte Designs.

## Für Entwickler

Der Quellcode liegt in `game/src/`. Die spielbare Datei wird mit Node.js gebaut:

```bash
node game/build.js   # erzeugt GRIDFALL.html
```

Das Konzept für eine spätere Unreal-Engine-5-Version steht in [docs/GDD.md](docs/GDD.md).
Die verwendete 3D-Bibliothek ist [three.js](https://threejs.org) (MIT-Lizenz, siehe `game/vendor/LICENSE-three.txt`).
