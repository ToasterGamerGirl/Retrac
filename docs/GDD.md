# Game Design Document & Technische Roadmap

**Arbeitstitel:** Codename *GRIDFALL* – Third-Person Battle Royale mit Bau- und Editiersystem
**Engine:** Unreal Engine 5.4+ (C++ first, Blueprints für Content/Tuning)
**Netzwerk:** Dedicated Server, Client-Server, Server-autoritativ
**Stand:** 2026-11-09

---

## 0. Rahmen & rechtliche Leitplanken

Dieses Dokument beschreibt ein **eigenständiges Spiel im Genre „Build-Battle-Royale“**. Ziel ist ein vergleichbares *Spielgefühl* (schnelles Bauen, 3×3-Edits, Bloom-Gunplay, Seltenheitsstufen), **nicht** eine Kopie eines bestehenden Produkts.

| Erlaubt / geplant | Nicht Teil des Projekts |
|---|---|
| Genre-Mechaniken (Bauen, Editieren, Bloom, Rarity, Loot-Truhen) | Extrahierte Assets, Meshes, Texturen, Sounds oder Spieldateien von Fortnite |
| Eigene Werte, durch Playtests getunt | Fortnite-Skins, -Charaktere, -Map, -Logos, -Namen |
| Eigene, gekaufte (Fab/Marketplace) oder lizenzierte Kosmetika | Nachbau des Epic-Backends, um Original-Clients zu verbinden |
| Lokales/Server-Profil mit „Unlock All“ für **eigene** Inhalte | Verwendung von Marken wie „Fortnite“ oder „Retrac“ im Produkt |

> Hinweis: Physik-Startwerte in diesem Dokument sind **eigene Ausgangswerte**, keine ausgelesenen Originalwerte. Das „richtige“ Gefühl entsteht durch Tuning in Playtests (siehe §1.5).

---

## 1. Kernmechaniken & Bewegung

### 1.1 Klassenübersicht

| Klasse | Basis | Aufgabe |
|---|---|---|
| `AGFCharacter` | `ACharacter`, `IAbilitySystemInterface` | Spielfigur, hält Komponenten, ASC-Proxy |
| `UGFCharacterMovementComponent` | `UCharacterMovementComponent` | Sprint, Slide, Crouch, Custom-Gravity, Prediction via `FSavedMove` |
| `FSavedMove_GF` / `FNetworkPredictionData_Client_GF` | CMC-Prediction | Speichert Sprint-/Slide-Flags für Replay |
| `UGFCameraComponent` | `UCameraComponent` | FOV-Blending (Hip/ADS/Sprint), Schulter-Offset |
| `UGFCameraModeStack` | `UObject` | Kamera-Modi (Default, ADS, Build, Edit, Skydive) mit Blend |
| `UGFInputConfig` | `UDataAsset` | Mapping Enhanced-Input-Action → GameplayTag |
| `UGFInputModifier_Deadzone` / `_ResponseCurve` | `UInputModifier` | Radiale/axiale Deadzone, Exponentialkurven |
| `UGFSettingsLocal` | `UGameUserSettings` | FOV-Slider, Sensitivität, ADS-Multiplikator, Edit-on-Release usw. |

### 1.2 Bewegungszustände

```
            ┌──────────┐ Sprint gedrückt + vorwärts  ┌──────────┐
            │  Walking │ ───────────────────────────▶│ Sprinting│
            └────┬─────┘ ◀─────────── losgelassen ───└────┬─────┘
       Crouch    │                                Crouch  │ (Speed > SlideMin)
                 ▼                                        ▼
            ┌──────────┐                            ┌──────────┐
            │ Crouched │ ◀── Speed < SlideExit ──── │  Sliding │ (MOVE_Custom: CMOVE_Slide)
            └──────────┘                            └──────────┘
   Jump aus jedem Bodenzustand ─▶ Falling ─▶ (Höhe > X) ─▶ Skydive/Glider (CMOVE_Skydive)
```

**Sprint-Regeln:** Sprint nur bei Vorwärtsanteil der Eingabe > 0,7 und nicht beim Zielen (ADS bricht Sprint ab). Waffe wird beim Sprinten gesenkt; nach Ende des Sprints gibt es eine Feuerverzögerung von ca. 0,1 s (`SprintToFireDelay`).

**Slide:** Start bei Crouch während Sprint mit `Speed ≥ SlideMinSpeed`. Hangabhängige Beschleunigung: `a = g * sin(SlopeAngle) * SlideGravityScale - SlideFriction`. Ende, sobald `Speed < SlideExitSpeed` oder Jump.

### 1.3 Custom Movement Component (Prediction-sicher)

```cpp
// GFCharacterMovementComponent.h
UENUM(BlueprintType)
enum ECustomMovementMode { CMOVE_None, CMOVE_Slide, CMOVE_Skydive, CMOVE_Glide };

UCLASS()
class UGFCharacterMovementComponent : public UCharacterMovementComponent
{
    GENERATED_BODY()
public:
    // Wünsche des Clients – werden über CompressedFlags repliziert
    uint8 bWantsToSprint : 1;

    UPROPERTY(EditDefaultsOnly, Category="GF|Sprint") float SprintSpeed      = 640.f;
    UPROPERTY(EditDefaultsOnly, Category="GF|Walk")   float WalkSpeed        = 420.f;
    UPROPERTY(EditDefaultsOnly, Category="GF|Crouch") float CrouchSpeed      = 260.f;
    UPROPERTY(EditDefaultsOnly, Category="GF|Slide")  float SlideMinSpeed    = 560.f;
    UPROPERTY(EditDefaultsOnly, Category="GF|Slide")  float SlideExitSpeed   = 300.f;
    UPROPERTY(EditDefaultsOnly, Category="GF|Slide")  float SlideImpulse     = 180.f;
    UPROPERTY(EditDefaultsOnly, Category="GF|Slide")  float SlideFriction    = 0.9f;

    virtual float GetMaxSpeed() const override;
    virtual void  UpdateFromCompressedFlags(uint8 Flags) override;
    virtual FNetworkPredictionData_Client* GetPredictionData_Client() const override;
protected:
    virtual void PhysCustom(float DeltaTime, int32 Iterations) override;
    virtual void OnMovementUpdated(float DeltaSeconds, const FVector& OldLoc, const FVector& OldVel) override;
    void PhysSlide(float DeltaTime, int32 Iterations);
    void PhysSkydive(float DeltaTime, int32 Iterations);
};

class FSavedMove_GF : public FSavedMove_Character
{
public:
    uint8 bSavedWantsToSprint : 1;
    virtual void Clear() override;
    virtual uint8 GetCompressedFlags() const override;      // FLAG_Custom_0 = Sprint
    virtual bool CanCombineWith(const FSavedMovePtr& New, ACharacter* C, float MaxDelta) const override;
    virtual void SetMoveFor(ACharacter* C, float Dt, const FVector& Accel, FNetworkPredictionData_Client_Character& Data) override;
    virtual void PrepMoveFor(ACharacter* C) override;
};
```

**Wichtig:** Jeder Zustand, der die Bewegung beeinflusst, muss über `FSavedMove` laufen. Ein replizierter Bool, der direkt die Geschwindigkeit ändert, führt zu Rubberbanding.

### 1.4 Kamera, FOV & ADS

- **Kamera:** Third-Person-Schulterkamera, `SpringArm` Länge ca. 250 cm, Socket-Offset (Y = +60 cm, Z = +60 cm), `bUsePawnControlRotation = true`. Kollision mit Probe-Radius 12 cm, damit die Kamera nicht durch eigene Bauteile clippt (Bauteile des Spielers auf eigenem Trace-Channel ignorieren).
- **FOV-Modell:** horizontales FOV über einen Slider (z. B. 80–110°, Standard 80°). Kamera-Modi skalieren *relativ* zum Basis-FOV:

| Modus | FOV | Arm-Länge | Blend-Zeit |
|---|---|---|---|
| Hipfire | Basis | 250 | – |
| ADS (AR/SMG) | Basis × 0,80 | 150 | 0,15 s |
| ADS Scope (Sniper) | festes Scope-FOV (z. B. 20°) + Overlay | 0 (1st-Person-Overlay) | 0,20 s |
| Sprint | Basis + 5° | 250 | 0,25 s |
| Build/Edit | Basis | 250, leicht höher | 0,10 s |

- **Sensitivität bei ADS:** `ADS_Sens = HipSens × ADSMultiplier × (tan(FOV_ADS/2) / tan(FOV_Hip/2))`. Dieser Faktor („Monitor Distance Match“) sorgt dafür, dass die Bildschirmbewegung pro Mausweg gleich *anfühlt*.
- **Maus:** Rohdaten, keine Beschleunigung, kein Smoothing. Getrennte X/Y-Sensitivität sowie getrennte Werte für Build- und Edit-Modus.
- **Controller:**
  - Deadzone **radial** (Standard 0,10), optional axial. Danach Re-Normalisierung: `out = (|v| - dz) / (1 - dz) * v̂`.
  - Response-Curve: `out = sign(x)·|x|^γ` (γ ≈ 1,5–2,0) oder Linear.
  - „Look Acceleration“: Boost-Rampe nach >0,9 Auslenkung für 0,3 s.
  - Aim-Assist (nur Controller): Slowdown bei Ziel im Assist-Kegel und Rotation-Follow. Server-seitig ist das nicht nötig, weil es nur die Eingabe formt.

### 1.5 Charakter-Physik – Startwerte & Tuning-Methode

| Parameter | Startwert | Hinweis |
|---|---|---|
| `GravityScale` | 1,6 (≈ −1570 cm/s²) | „snappy“, kurze Airtime |
| `JumpZVelocity` | 650 cm/s | Sprunghöhe ≈ v²/2g ≈ 135 cm, genug für eine halbe Wand |
| `AirControl` | 0,45 | hoch genug für Strafing in der Luft |
| `MaxWalkSpeed` | 420 | |
| `BrakingDecelerationWalking` | 2400 | schneller Stopp → wichtig für First-Shot-Accuracy |
| `GroundFriction` | 8 | |
| `MaxStepHeight` | 45 | Rampen dürfen nicht hängen bleiben |
| `WalkableFloorAngle` | 50° | Rampen-Neigung (45°) muss begehbar sein |
| Fallschaden | ab 600 cm Fallhöhe linear bis tödlich ab 2000 cm | `Landed()` → GameplayEffect |
| Skydive | Terminal ≈ 2000 cm/s (Tauchen) / 1000 (flach) | Gleiter-Auto-Deploy bei Bodenabstand < X |

**Tuning-Methode für „fühlt sich richtig an“:**
1. Alle Werte in `UGFMovementTuning` (DataAsset) auslagern und per Console-Variable live änderbar machen (`gf.Move.JumpZ 650`).
2. Messbare Ziele definieren: *Zeit bis Höchstgeschwindigkeit*, *Stopp-Distanz*, *Airtime eines Sprungs*, *Rampen-Lauf + Sprung = 1 Etage*.
3. Ghost-Replays aufnehmen und A/B-Blindtests mit Spielern durchführen.

---

## 2. Bausystem & Editieren

### 2.1 Grid-Definition

- **Zellgröße:** 400 × 400 × 400 cm (konfigurierbar in `UGFBuildSettings`).
- **Koordinate eines Bauteils:** `FGFGridKey { FIntVector Cell; EGFPieceType Type; uint8 Orientation; }`

| Typ | Position in der Zelle | Orientierungen |
|---|---|---|
| Wand | auf einer der 4 Zellkanten (vertikal) | 0–3 (N/E/S/W) – Kanten werden zwischen Nachbarzellen **geteilt** und normalisiert, damit keine Doppel-Wand entsteht |
| Boden | Zellboden (horizontal) | 1 |
| Rampe | diagonal durch die Zelle | 4 (Steigungsrichtung) |
| Pyramide/Dach | auf Zellboden, Spitze in der Mitte | 1 (rotiert nur visuell) |

### 2.2 Klassen

| Klasse | Basis | Aufgabe |
|---|---|---|
| `UGFBuildGridSubsystem` | `UWorldSubsystem` | `TMap<FGFGridKey, TWeakObjectPtr<AGFBuildingPiece>>`, Belegungsabfragen, Snap-Mathe, Strukturgraph |
| `AGFBuildingPiece` | `AActor` | Basisklasse: HP, Material, Owner-Team, `EditMask`, Mesh-Variante |
| `AGFWall`, `AGFFloor`, `AGFRamp`, `AGFPyramid` | `AGFBuildingPiece` | Typspezifische Edit-Layouts & Kollisionen |
| `UGFBuildComponent` | `UActorComponent` (am Character) | Ghost-Vorschau, Zielbestimmung, Turbo-Build, Server-RPCs |
| `UGFEditComponent` | `UActorComponent` (am Character) | Edit-Modus, Tile-Auswahl, Confirm/Reset |
| `AGFBuildPreview` | `AActor` (nur lokal) | Blaues/rotes Ghost-Mesh |
| `UGFEditShapeTable` | `UDataAsset` | Erlaubte Masken → Mesh/Kollisions-Variante |
| `UGFBuildingPieceDefinition` | `UPrimaryDataAsset` | Kosten, HP pro Material, Bauzeit, Meshes |
| `UGA_Build`, `UGA_Edit` | `UGameplayAbility` | GAS-Wrapper (Kosten, Tags wie `State.Building`, Blockaden) |

### 2.3 Zielbestimmung (Snap-to-Grid)

```
1. Trace von Kamera vorwärts (MaxBuildDistance ≈ 1,5 Zellen vom Spieler).
2. Treffpunkt P (oder Endpunkt, falls nichts getroffen) → Zelle C = floor(P / CellSize).
3. Spieler-Blickrichtung (Yaw) bestimmt Orientierung:
     Wand:    Kante, die der Blickrichtung zugewandt ist (Yaw auf 90° quantisiert)
     Rampe:   steigt in Blickrichtung
     Boden:   Zelle unter dem Blickpunkt; bei Pitch > X die Zelle auf Fußhöhe
4. Höhen-Logik: Wenn der Spieler in C steht und nach vorne schaut, Wand/Rampe auf seiner Fußebene
   (nicht auf der getroffenen Höhe) → ermöglicht „90s“ und Rampen-Rush.
5. Key normalisieren (geteilte Wandkanten) → Belegung prüfen → Vorschau grün/rot.
```

### 2.4 Turbo Building

```cpp
void UGFBuildComponent::TickComponent(float Dt, ...)
{
    if (!bPlaceHeld) return;
    const FGFGridKey Target = ComputeTargetKey();               // jeden Frame neu
    const bool bNewCell  = Target != LastPlacedKey;
    const bool bInterval = GetWorld()->TimeSince(LastPlaceTime) >= TurboInterval; // z. B. 0,05 s
    if (bNewCell && bInterval && CanPlace(Target))
    {
        PredictPlace(Target);                                   // §6.4
        LastPlacedKey = Target; LastPlaceTime = Now;
    }
}
```

- Ohne Turbo: Platzierung nur bei Tastendruck (Edge).
- **Server-Rate-Limit:** max. N Platzierungen pro Sekunde und Spieler (Token-Bucket, z. B. 20/s mit Burst 5). Überschuss wird abgelehnt.
- **Bauzeit/HP-Ramp:** Teil spawnt mit 10 % HP und wächst über `BuildTime` auf Max-HP (Holz schnell/niedrig, Metall langsam/hoch). Schaden während des Aufbaus wird abgezogen.

### 2.5 Strukturelle Integrität

- Jedes Teil hält Kanten zu Nachbarn (im Subsystem berechnet, nicht repliziert).
- Ein Teil ist **stabil**, wenn ein Pfad zu einem „geerdeten“ Teil (berührt Landschaft/Map-Geometrie) existiert.
- Bei Zerstörung: BFS von jedem Nachbarn aus. Teilgraphen ohne Erdung kollabieren (Server zerstört, Clients spielen Kollaps-VFX).
- Performance: BFS mit Limit (z. B. 512 Knoten) und Verteilung über mehrere Frames; Ergebnis-Cache pro Insel.

### 2.6 Editier-System

#### Datenmodell
```cpp
// Bit i = Kachel i (Zeilen von oben links). 1 = Kachel vorhanden, 0 = entfernt.
USTRUCT() struct FGFEditMask { UPROPERTY() uint16 Bits = 0x1FF; }; // Wand/Boden: 9 Bits (3×3)
// Rampe: 4 Bits (2×2), Pyramide: 4 Bits (Ecken 2×2)
```

| Teil | Grid | Beispiele |
|---|---|---|
| Wand | 3×3 | Fenster (mittlere Kachel), Tür (Mitte + Mitte-unten), Bogen (untere Mitte + Mitte + ...), Halbwand |
| Boden | 3×3 → intern auf 2×2-Viertel reduziert | Viertel, Halb, L-Form |
| Rampe | 2×2 | Halbe Rampe, Ecke |
| Pyramide | 2×2 Ecken | Abgesenkte Ecke(n), „Pyramiden-Treppe“ |

#### Algorithmus (Edit-Modus)

```
EnterEdit():
    Piece = Trace auf eigenes/Team-Bauteil innerhalb EditRange
    if Piece == null oder Piece.bBeingEditedByOther: return
    Server_RequestEditLock(Piece)              // optimistisch, siehe §6.4
    WorkingMask = Piece.EditMask              // Kopie
    State = Editing; bDragging = false

OnSelectPressed():                             // linke Maustaste
    Tile = TraceTile(Piece)                    // Treffpunkt → lokale UV → Index
    DragMode = WorkingMask[Tile] ? Remove : Add // erste Kachel bestimmt den Modus
    Apply(Tile); bDragging = true

OnCursorMoved():
    if bDragging:
        Tile = TraceTile(Piece)
        if Tile != LastTile: Apply(Tile)       // Drag-Select über mehrere Kacheln

Apply(Tile):
    WorkingMask[Tile] = (DragMode == Add)
    UpdateLocalEditPreview(WorkingMask)        // Kacheln transparent/markiert

OnSelectReleased():
    bDragging = false
    if Settings.bEditOnRelease: Confirm()      // „Edit on Release“

OnEditKeyPressedAgain() / OnConfirm():
    Confirm()

Confirm():
    Shape = EditShapeTable.Resolve(Piece.Type, WorkingMask)
    if Shape == Invalid:
        Shape = EditShapeTable.NearestValid(WorkingMask) // oder abbrechen
    if Shape.Mask == Piece.EditMask: ExitEdit(); return
    PredictApplyEdit(Piece, Shape.Mask)        // lokal sofort
    Server_ApplyEdit(Piece, Shape.Mask, PredictionId)
    ExitEdit()

OnReset():                                     // „Reset Edit“, eigene Taste (z. B. Rechtsklick)
    WorkingMask = FullMask(Piece.Type)
    PredictApplyEdit(Piece, FullMask); Server_ApplyEdit(...)
    ExitEdit()

Server_ApplyEdit_Implementation(Piece, Mask, Id):
    Validate: Piece existiert, gleiche/verbündete Team-ID, Distanz ≤ EditRange + Toleranz,
              Spieler lebt, kein Cooldown-Spam, Mask ist in EditShapeTable gültig
    if ok:   Piece.EditMask = Mask (RepNotify → Mesh/Kollision tauschen); Client_AckEdit(Id, true)
    else:    Client_AckEdit(Id, false, Piece.EditMask)   // Rollback
```

**Gültige Formen:** `UGFEditShapeTable` enthält eine Lookup-Tabelle `TMap<uint16, FGFEditShape>` (Mesh, Kollision, Name). Bei 9 Bits sind es max. 512 Einträge, die einmal offline generiert und kuratiert werden. Ungültige Muster (z. B. schwebende Einzelkachel oben ohne Verbindung) werden abgelehnt oder auf die nächste gültige Form gemappt (Hamming-Distanz).

**Mesh-Wechsel:** Modulare Varianten mit gemeinsamer Pivot-Lage. Kollision wird beim Wechsel synchron getauscht (sonst laufen Spieler durch eine „geschlossene“ Tür). Clients wechseln das Mesh im `OnRep_EditMask`.

**Edit-Sperre:** Nur ein Spieler zugleich darf ein Teil editieren. Gegner können nicht editieren, aber das Teil beschädigen. Stirbt ein Teil während des Edits, wird der Edit abgebrochen.

---

## 3. Waffensystem, Gunplay & Bloom

### 3.1 Klassen

| Klasse | Basis | Aufgabe |
|---|---|---|
| `UGFWeaponDefinition` | `UGFItemDefinition` | Statische Daten: Feuermodus, Hitscan/Projektil, Kurven, Mesh, Sounds |
| `FGFWeaponStatsRow` | `FTableRowBase` | Werte **pro Seltenheit** (DataTable: Damage, FireRate, Mag, Reload, Spread) |
| `UGFWeaponInstance` | `UObject` (repliziert als Subobjekt) | Laufzeitstatus: Munition im Magazin, aktueller Spread, Rarity |
| `AGFWeaponActor` | `AActor` | Sichtbares Mesh am Character, Mündungs-VFX, Wrap-Material |
| `UGA_WeaponFire_Hitscan` | `UGameplayAbility` | Feuerlogik inkl. Target-Data an den Server |
| `UGA_WeaponFire_Projectile` | `UGameplayAbility` | Sniper/Explosivwaffen |
| `AGFProjectile` | `AActor` | Server-autoritatives Projektil (Sub-Stepping) |
| `UGFSpreadComponent` / Logik im Instance-Objekt | – | Bloom-Berechnung |
| `UGFDamageExecution` | `UGameplayEffectExecutionCalculation` | Headshot/Falloff/Shield-vor-Health |
| `UGFLagCompensationComponent` | `UActorComponent` (Server) | Hitbox-History für Rewind |

### 3.2 Hitscan-Ablauf

```
Client (lokal, sofort):
  1. Spread berechnen (§3.4), Seed = (ShotCounter, WeaponInstanceId)
  2. Richtung = Kamerablick + RandomInCone(Spread, Seed)
  3. Trace von Kamera → Zielpunkt; zweiter Trace von Mündung → Zielpunkt (verhindert Schüsse um Ecken)
  4. Tracer/Impact-VFX + Hitmarker (predicted, grau bis zur Bestätigung)
  5. Server_Fire(FGFShotData{ Origin, Dir, Seed, ClientTimestamp, HitActor, HitBone, HitLocation })

Server:
  1. Rate-Check (FireRate + Toleranz), Munition, Waffe ausgerüstet, kein Reload
  2. Origin-Plausibilität: |Origin − ServerKameraPos| < 100 cm
  3. Richtung muss im erlaubten Spread-Kegel um die Server-Blickrichtung liegen (gleicher Seed!)
  4. Lag-Compensation: Hitboxen des Ziels auf ClientTimestamp zurückspulen (max. 200 ms)
  5. Trace gegen die zurückgespulten Hitboxen bestätigt/verwirft den Client-Treffer
  6. GameplayEffect anwenden → Schaden repliziert → Client färbt Hitmarker / Damage-Number
```

### 3.3 Projektil-Waffen (Sniper)

- Startgeschwindigkeit z. B. 30.000 cm/s, Gravitation zusätzlich `ProjectileGravityScale` (z. B. 0,3–0,5 × Weltgravitation), damit Bullet Drop auf Distanz spürbar ist.
- **Server** simuliert das Projektil autoritativ mit festem Sub-Step (z. B. 1/120 s, Segment-Traces zwischen den Steps).
- **Schießender Client** spawnt sofort ein kosmetisches Projektil (`bIsFakeProjectile`), das beim Eintreffen des Server-Projektils abgeglichen bzw. entfernt wird.
- **Andere Clients** sehen das replizierte Projektil oder simulieren es aus Startparametern (`Multicast_SpawnProjectile(Origin, Velocity, ServerTime)` und lokal deterministisch nachrechnen – spart Bandbreite).
- Lag-Compensation für Projektile: Bei Treffer wird die Zielposition zum *Zeitpunkt des Projektil-Segments* minus Schützen-Latenz zurückgespult (vereinfachter „Favor-the-Shooter“-Ansatz, gedeckelt).

### 3.4 Bloom / Spread

```
Spread (Grad, halber Kegelwinkel) =
    clamp( BaseSpread[Stance]
           × MovementMultiplier       // Stand 1,0 · Gehen 1,5 · Sprint/Luft 2,5–4,0
           × ADSMultiplier            // ADS 0,6–0,8
           + CurrentBloom,
           0, MaxSpread )

Beim Schuss:      CurrentBloom = min(CurrentBloom + BloomPerShot, MaxBloom)
Pro Frame:        CurrentBloom = max(0, CurrentBloom - BloomRecoveryRate × Dt)
                  (Recovery startet erst nach RecoveryDelay seit dem letzten Schuss)

First-Shot-Accuracy:
    if Speed2D < FSA_SpeedThreshold (z. B. 10 cm/s)
       and IsOnGround
       and TimeSinceLastShot ≥ FSA_ResetTime (z. B. 0,6 s für AR)
       and Weapon.bHasFirstShotAccuracy:
        Spread = 0   → perfekter erster Schuss
```

- Das Fadenkreuz-Widget zeichnet `Spread` 1:1 (Winkel → Pixel via FOV), damit sichtbarer und echter Bloom identisch sind.
- **Determinismus:** Client und Server benutzen denselben Seed und denselben Spread-Input. Der Spread-Status wird nicht repliziert, sondern auf beiden Seiten aus Bewegungs- und Feuer-Events berechnet. Der Server toleriert eine kleine Abweichung.

### 3.5 Schaden

```
Damage = BaseDamage[Rarity]
       × (bHeadshot ? HeadshotMultiplier : 1)   // AR 1,5 · Sniper 2,5 · Shotgun 2,0
       × FalloffCurve.Eval(Distance)            // UCurveFloat pro Waffenklasse
       × MaterialMultiplier                     // vs. Bauteile: eigener Wert (StructureDamage)
Anwendung: zuerst Shield, Überlauf auf Health. Max 100 HP + 100 Shield.
```

| Waffenklasse | Typ | Falloff (Beispiel) |
|---|---|---|
| Pistole | Hitscan | 100 % bis 25 m → 70 % ab 60 m |
| SMG | Hitscan | 100 % bis 15 m → 60 % ab 40 m |
| AR | Hitscan | 100 % bis 50 m → 80 % ab 100 m |
| Shotgun | Hitscan-Pellets (Muster fest + kleiner Jitter) | stark: 100 % bis 5 m → 30 % ab 15 m |
| Sniper | Projektil | kein Falloff, aber Bullet Drop |

**Hitboxen:** Physics Asset mit Bodies `head` (Multiplikator Kopf), `spine/pelvis/limbs` (1,0). Der Bone-Name kommt über `FHitResult::BoneName` in die Damage-Execution.

---

## 4. Inventar & Loot-System

### 4.1 Klassen

| Klasse | Basis | Aufgabe |
|---|---|---|
| `UGFItemDefinition` | `UPrimaryDataAsset` | ID, Name, Icon, Kategorie, Stack-Größe, Rarity-Optionen |
| `UGFConsumableDefinition` | `UGFItemDefinition` | Nutzungszeit, GameplayEffect (Shield +50, Heal +100 usw.) |
| `FGFInventoryEntry` | `FFastArraySerializerItem` | ItemDef, Rarity, Menge, Instanz (Waffe) |
| `FGFInventoryList` | `FFastArraySerializer` | Delta-repliziertes Array |
| `UGFInventoryComponent` | `UActorComponent` | 5 Quickbar-Slots + Pickaxe-Slot + Materialien + Munition |
| `UGFQuickbarComponent` | `UActorComponent` | Aktiver Slot, Equip/Unequip, Swap-Delay |
| `AGFPickup` | `AActor` | Bodengegenstand mit Rarity-Glow und Beam |
| `AGFLootContainer` | `AActor` | Truhe/Munitionskiste, `IGFInteractable` |
| `UGFLootTable` | `UDataTable` (`FGFLootTableRow`) | Gewichtete Pakete |
| `UGFInteractionComponent` | `UActorComponent` | Fokus-Trace, Hold-to-Interact, UI-Prompt |

### 4.2 Inventar-Regeln

- **Slot 0:** Spitzhacke (fest, nicht droppbar).
- **Slots 1–5:** Waffen und Verbrauchsgegenstände. Gleiche Consumables stapeln (Max-Stack pro Item).
- **Materialien** separat: Holz, Stein, Metall (je max. 999). Munition separat pro Typ.
- Volle Slots: Pickup tauscht mit dem aktiven Slot (alter Gegenstand wird gedroppt).
- Alle Mutationen laufen **nur auf dem Server**. Der Client schickt Intents (`Server_RequestPickup(Pickup)`, `Server_Drop(Slot)`, `Server_Swap(A,B)`).

### 4.3 Seltenheit

```cpp
UENUM(BlueprintType)
enum class EGFRarity : uint8 { Common, Uncommon, Rare, Epic, Legendary };
```

| Rarity | Farbe (UI/Glow) | Stat-Skalierung (Beispiel) |
|---|---|---|
| Common | Grau `#B0B0B0` | Damage ×1,00 · Reload ×1,00 |
| Uncommon | Grün `#3FBF3F` | ×1,05 · ×0,95 |
| Rare | Blau `#3F8FFF` | ×1,10 · ×0,91 |
| Epic | Lila `#B44FFF` | ×1,16 · ×0,87 |
| Legendary | Gold `#FFB13F` | ×1,22 · ×0,82 |

Werte stehen in einer **DataTable pro Waffenfamilie** (eine Zeile pro Rarity), nicht als Multiplikator im Code. Das erlaubt gezieltes Balancing. Die Farben kommen aus `UGFRarityStyle` (DataAsset) und werden als Material-Parameter für Icon-Hintergrund, Pickup-Glow und Beam genutzt.

### 4.4 Truhen-Ablauf

```
Spieler hält Interact 0,25–0,5 s (Hold) → Server_Interact(Chest)
Server:
  Distanz-/Sicht-Check, Chest.bOpened == false
  bOpened = true (RepNotify → Animation/Sound/VFX auf allen Clients)
  Pakete = LootTable.Roll(Chest.LootTier, RandomStream(Seed))
      Paket „Waffe“      : Gewichtung nach Rarity (z. B. 30/30/22/13/5) + passende Munition
      Paket „Consumable“ : Mini-Shield, Shield, Bandage, Medkit …
      Paket „Material“   : 30 Holz / Stein / Metall
  Spawn AGFPickup im Bogen vor der Truhe (kleiner Impuls, Physik nur kosmetisch)
```

- Loot-Tabellen sind verschachtelbar (`Row → SubTable`), damit Truhen, Bodenloot und Vorratslieferungen dieselbe Logik teilen.
- Spawn-Chance von Truhen pro Match über `AGFLootSpawnPoint` (z. B. 60 %), deterministisch aus dem Match-Seed. Das macht Loot reproduzierbar beim Debuggen.

---

## 5. Kosmetik- & Skin-System

### 5.1 Grundprinzip

Alle Kosmetika sind **Primary Data Assets** mit eindeutiger ID und werden über den **Asset Manager** mit Soft References asynchron geladen. Repliziert wird nur die **Loadout-Struktur aus IDs** – niemals Meshes oder Objektzeiger.

```cpp
UENUM() enum class EGFCosmeticSlot : uint8 { Character, Backbling, Pickaxe, Glider, Wrap, Emote, Contrail, LoadingScreen };

UCLASS()
class UGFCosmeticDefinition : public UPrimaryDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditDefaultsOnly) FName CosmeticId;            // "CID_Ranger_01"
    UPROPERTY(EditDefaultsOnly) EGFCosmeticSlot Slot;
    UPROPERTY(EditDefaultsOnly) EGFRarity Rarity;
    UPROPERTY(EditDefaultsOnly) FText DisplayName;
    UPROPERTY(EditDefaultsOnly) TSoftObjectPtr<UTexture2D> Icon;
    UPROPERTY(EditDefaultsOnly) FGameplayTagContainer Tags;  // Set, Saison, Stil-Varianten
    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    { return FPrimaryAssetId(GetCosmeticTypeName(Slot), CosmeticId); }
};

UCLASS() class UGFCharacterCosmetic : public UGFCosmeticDefinition
{
    GENERATED_BODY()
    UPROPERTY(EditDefaultsOnly) TArray<FGFCharacterPart> Parts;       // Body, Head, Hat … (soft)
    UPROPERTY(EditDefaultsOnly) TArray<FGFCosmeticVariant> Variants;  // Stile: Material-/Mesh-Swaps
    UPROPERTY(EditDefaultsOnly) TSoftClassPtr<UAnimInstance> AnimLayer;
};
// analog: UGFBackblingCosmetic (Mesh + Socket + AnimBP), UGFPickaxeCosmetic (Mesh + Swing-Montages + Sounds),
//         UGFWrapCosmetic (MaterialInstance-Parameter), UGFEmoteCosmetic (Montage + Sound + bLooping + Prop)
```

### 5.2 Laufzeit-Klassen

| Klasse | Aufgabe |
|---|---|
| `UGFAssetManager` | Registriert Primary-Asset-Typen, Chunking, Async-Load-Bundles (`UI` vs. `Game`) |
| `FGFLoadout` (USTRUCT) | `TMap<EGFCosmeticSlot, FName>` + Varianten-Auswahl; repliziert im `PlayerState` |
| `UGFPawnCosmeticsComponent` | Am Character: lädt Loadout async, baut modulare Meshes (`SetLeaderPoseComponent`), hängt Backbling an Socket |
| `UGFWrapApplier` | Erzeugt `UMaterialInstanceDynamic` auf Waffen/Fahrzeugen und setzt Wrap-Parameter |
| `UGA_Emote` | Spielt Montage + Audio, synchronisiert über Server-Startzeit |
| `UGFProfileSubsystem` | `UGameInstanceSubsystem`: lädt das Spielerprofil (Besitz, Loadout) vom Backend oder lokal |

### 5.3 Ablauf: Loadout → Charakter

```
1. Login → ProfileSubsystem lädt Profil (Liste besessener CosmeticIds + gespeichertes Loadout).
2. Lobby: Spieler wählt Items → Server_SetLoadout(FGFLoadout).
3. Server validiert jede ID gegen das Profil (Besitz + Slot passt) und setzt PlayerState.Loadout.
4. OnRep_Loadout auf allen Clients → PawnCosmeticsComponent:
     AssetManager.LoadPrimaryAssets(Ids, {"Game"}) → OnLoaded → Meshes zuweisen.
   Während des Ladens: Default-Skin als Platzhalter (kein unsichtbarer Spieler).
5. Hitboxen/Kollision sind skin-unabhängig (gleiches Skelett, gleiche Kapsel) → kein Pay-to-Win.
```

### 5.4 Emotes mit synchronem Audio

- `Server_PlayEmote(EmoteId)` → Server prüft Besitz und Zustand (am Boden, nicht im Kampf-Lock) → setzt `ReplicatedEmote { EmoteId, ServerStartTime }`.
- Clients starten die Montage bei `Position = ServerTime − ServerStartTime`. Audio startet mit gleichem Offset (`UAudioComponent::Play(StartTime)`). So bleiben Tanz und Musik auch bei späten Joinern synchron.
- Abbruch bei Bewegungsinput (konfigurierbar pro Emote), Kamera wechselt in einen Orbit-Modus.
- Audio-Lautstärke-Attenuation und Option „Emote-Musik aus“ in den Einstellungen.

### 5.5 Profil-/Besitzsystem („Alles verfügbar“)

Zwei Implementierungen hinter einem Interface `IGFProfileProvider`:

| Provider | Einsatz | Verhalten |
|---|---|---|
| `UGFLocalProfileProvider` | Entwicklung, Offline, Community-Server | JSON in `Saved/Profile.json`; Flag `bGrantAllCosmetics = true` → alle registrierten `UGFCosmeticDefinition` im Asset-Registry gelten als besessen |
| `UGFHttpProfileProvider` | Live-Betrieb | REST-Backend (z. B. Node/Go + Postgres): `GET /profile/{id}`, `POST /profile/{id}/loadout`; Server-Variante `ServerGrantAll` für Events/Private Server |

Der **Dedicated Server** fragt das Profil selbst ab (Server-zu-Backend mit Service-Token) und vertraut nicht der Liste, die der Client schickt.

**Content-Quelle:** Alle Skins, Backblings, Pickaxes, Emotes und Wraps werden selbst modelliert, auf Fab gekauft oder lizenziert. Ein gemeinsames Skelett (z. B. UE5-Mannequin-kompatibel) macht Animation-Retargeting und Emotes für alle Skins wiederverwendbar.

---

## 6. Technische Architektur & Netzwerk

### 6.1 Gesamtbild

```
┌────────────── Client ──────────────┐        ┌──────── Dedicated Server ────────┐
│ Enhanced Input → GAS (predicted)   │  RPC   │ GameMode (Match-Phasen, Sturm)    │
│ CMC Prediction (SavedMoves)        │ ─────▶ │ GAS autoritativ, Validierung      │
│ Predicted Build/Edit/Fire          │ ◀───── │ Lag-Compensation, Loot, Bauteile  │
│ Kosmetik-Loading (Async)           │  Rep   │ Replication Graph / Iris          │
└────────────────────────────────────┘        └──────────────┬────────────────────┘
                                                             │ HTTPS
                                       ┌─────────────────────▼─────────────────────┐
                                       │ Backend: Auth, Profile, Matchmaking, Stats │
                                       └────────────────────────────────────────────┘
```

**Framework-Klassen:** `AGFGameMode` (Phasen: Warmup → Bus → Storm-Zyklen → Ende), `AGFGameState` (Spieler übrig, Sturm-Daten), `AGFPlayerState` (ASC, AttributeSets, Loadout, Kills), `AGFPlayerController` (Input, UI, Client-RPCs), `AGFStormManager`.

### 6.2 Gameplay Ability System (GAS)

- **ASC im PlayerState** (überlebt Respawn/Repossess), `ReplicationMode = Mixed`.
- **AttributeSets:** `UGFHealthSet` (Health, MaxHealth, Shield, MaxShield, IncomingDamage als Meta-Attribut), `UGFBuildSet` (optional: BuildSpeed-Modifikatoren).
- **Abilities (LocalPredicted):** `GA_Fire`, `GA_Reload`, `GA_Build`, `GA_Edit`, `GA_UseConsumable`, `GA_Emote`, `GA_Interact`, `GA_Sprint` (nur Tags, die Bewegung selbst liegt in der CMC!).
- **Tags** steuern Konflikte: `State.Editing` blockiert `GA_Fire`; `State.Consuming` wird durch Schaden nicht unterbrochen, aber durch Waffenwechsel.
- **Target Data:** Hitscan-Ergebnisse als `FGameplayAbilityTargetData_SingleTargetHit` mit ServerSetReplicatedTargetData. Der Server validiert, bevor `ApplyGameplayEffect` ausgeführt wird.

### 6.3 Server-seitige Validierung (Anti-Cheat-Grundlage)

| Aktion | Checks auf dem Server |
|---|---|
| Schuss | Feuerrate (mit Jitter-Toleranz), Munition, Origin-Nähe, Richtung im Spread-Kegel, Rewind-Trace gegen Hitboxen, Line-of-Sight Mündung→Ziel, max. Rewind 200 ms |
| Bauen | Material vorhanden, Zelle frei, Distanz zum Spieler ≤ BuildRange + Toleranz, Teil hat Stützkontakt, Rate-Limit (Token-Bucket), nicht in Spieler-Kapseln anderer Spieler |
| Editieren | Eigentümer-Team, Distanz, Maske gültig, Edit-Lock, Rate-Limit |
| Bewegung | Standard-CMC-Korrektur (Server simuliert Moves) + `MaxMoveDeltaTime`, Speed-Anomalie-Logging |
| Inventar/Loot | Nur Server-Mutationen; Pickup-Distanz; Truhe nur einmal öffnen |
| Kosmetik | ID-Besitz gegen Backend-Profil |

Verdächtige Muster (abgelehnte Schüsse pro Minute, unmögliche Rotationssprünge) werden geloggt und zur Telemetrie geschickt. Clientseitiges Anti-Cheat (z. B. Easy Anti-Cheat, kostenlos für UE-Titel) kommt **zusätzlich** dazu und ersetzt die Server-Validierung nicht.

### 6.4 Client-Side Prediction für Bauen & Editieren

**Bauen:**
```
Client:
  id = ++LocalPredictionCounter
  spawne lokales AGFBuildingPiece (bIsPredicted=true, nicht repliziert, Kollision AKTIV)
  ziehe Material lokal vorläufig ab
  Server_PlaceBuild(Key, PieceType, MaterialType, id)

Server:
  validieren → echtes, repliziertes Piece spawnen; Piece.PredictionOwner = PC, Piece.PredictionId = id
  oder ablehnen → Client_RejectBuild(id)

Client:
  OnRep/BeginPlay des echten Pieces mit eigener PredictionId → lokales Fake-Piece zerstören (gleicher Frame,
  kein Flackern: echtes Mesh erst sichtbar schalten, dann Fake entfernen)
  Client_RejectBuild(id) → Fake-Piece entfernen, Material zurückbuchen
  Timeout (z. B. 1 s ohne Antwort) → wie Reject behandeln
```

- Kollision des vorhergesagten Teils ist **sofort aktiv**, damit Spieler auf ihrer eigenen Rampe laufen können. Wird das Teil abgelehnt, korrigiert die CMC die Position (seltener, akzeptabler Pop).
- Der Server simuliert die Bewegung des Spielers mit dem *echten* Teil. Da das Teil auf dem Server ca. ½ RTT später existiert, kann der Server in `ServerMove` kurz vor dem Spawn eine Abweichung sehen. **Gegenmaßnahme:** Der Server legt neue Bauteile des eigenen Spielers „rückwirkend“ an (Kollision für diesen Spieler sofort aktiv) und erhöht kurzzeitig die Korrekturtoleranz (`MAXPOSITIONERRORSQUARED`) für diesen Client.

**Editieren:** gleiches Muster. Der Client ändert `EditMask` lokal (Mesh + Kollision), der Server bestätigt oder sendet die autoritative Maske zurück. `OnRep_EditMask` wird für den editierenden Client ignoriert, solange eine ausstehende `PredictionId` neuer ist.

### 6.5 Replikations-Best-Practices

1. **Bauteile sind das Hauptproblem bei der Skalierung** (Tausende Actors pro Match):
   - `NetDormancy = DORM_DormantAll`; nur bei HP-/Edit-Änderung `FlushNetDormancy()`.
   - Replizierte Properties minimal halten: `GridKey` (gepackt in 32–48 Bit), `MaterialType`, `EditMask` (uint16), `Health` (quantisiert uint16), `TeamId`.
   - Alternativ (Phase 2): **Kein Actor pro Teil**, sondern ein Manager pro Grid-Chunk mit `FFastArraySerializer` + Instanced Static Meshes. Spart massiv CPU und Bandbreite.
   - Spatialisierung über **Replication Graph** (`GridSpatialization2D`) oder **Iris** (UE 5.4+) mit Filter-Regionen.
2. **Push Model** aktivieren (`bWithPushModel`), Properties nur bei Änderung als dirty markieren.
3. **RPCs:** Gameplay-RPCs `Reliable` nur, wenn der Verlust das Spiel bricht (Build/Edit/Interact). Kosmetik-Multicasts (VFX, Sounds) `Unreliable`. Fire-RPCs `Unreliable`, aber mit Sequenznummer.
4. **Kein Tick auf dem Server** für rein visuelle Komponenten (`bAllowTickOnDedicatedServer = false`).
5. **NetCullDistance** pro Klasse: Bauteile hoch (Sichtbarkeit auf Distanz ist gameplay-relevant), Pickups mittel, Kosmetik-VFX niedrig.
6. **Quantisierung:** `FVector_NetQuantize10` für Positionen, `FRotator` komprimiert, Health als `uint8`/`uint16`.
7. **Server-Tickrate:** 30 Hz Basis, 60 Hz im Endgame (wenige Spieler) über `NetServerMaxTickRate` dynamisch. Client-`NetUpdateFrequency` für Characters 60–100.
8. **Netzwerk-Emulation** fest im QA-Prozess: `NetEmulation.PktLag 80`, `PktLoss 2`, `PktLagVariance 20` – Bauen und Editieren müssen bei 80 ms Ping noch flüssig sein.

### 6.6 Lag-Compensation (Hitbox-Rewind)

```cpp
struct FGFHitboxFrame { float ServerTime; TArray<FTransform> BoneTransforms; FVector ActorLocation; };
// UGFLagCompensationComponent (nur Server): Ringpuffer ~ 0,5 s, pro Server-Tick befüllt.

bool UGFLagCompensationComponent::ConfirmHit(const FGFShotData& Shot, AGFCharacter* Target)
{
    const float RewindTime = FMath::Clamp(ServerNow - Shot.ClientTimestampInServerTime, 0.f, MaxRewind);
    const FGFHitboxFrame Frame = Target->LagComp->Interpolate(ServerNow - RewindTime);
    // Hitbox-Shapes temporär auf Frame setzen → Trace → zurücksetzen (nur Hitbox-Kanal, keine Physik)
}
```

Die Zeit-Synchronisierung kommt über `AGameStateBase::GetServerWorldTimeSeconds()` plus einen eigenen RTT-Filter (Ping-Pong-RPC, gleitender Median).

---

## 7. Projektstruktur (Vorschlag)

```
Source/Gridfall/
  Core/          GFAssetManager, GFGameInstance, GFSettingsLocal
  Character/     GFCharacter, GFCharacterMovementComponent, GFCameraComponent, CameraModes/
  Input/         GFInputConfig, Modifiers/ (Deadzone, ResponseCurve)
  AbilitySystem/ GFAbilitySystemComponent, Attributes/, Abilities/, Executions/
  Building/      GFBuildGridSubsystem, GFBuildingPiece (+Wall/Floor/Ramp/Pyramid), GFBuildComponent,
                 GFEditComponent, GFEditShapeTable, GFStructuralGraph
  Weapons/       GFWeaponDefinition, GFWeaponInstance, GFProjectile, GFLagCompensationComponent, Spread/
  Inventory/     GFItemDefinition, GFInventoryComponent, GFQuickbarComponent, GFPickup, GFLootContainer, Loot/
  Cosmetics/     GFCosmeticDefinition (+Subtypen), GFPawnCosmeticsComponent, GFWrapApplier
  Profile/       IGFProfileProvider, GFLocalProfileProvider, GFHttpProfileProvider, GFProfileSubsystem
  Match/         GFGameMode, GFGameState, GFPlayerState, GFStormManager, GFBattleBus
  UI/            HUD (Crosshair/Bloom, Quickbar, Materialien, Edit-Grid), Lobby/Locker
Content/Gridfall/
  Data/          DataTables (WeaponStats, LootTables), DataAssets (Tuning, Rarity, EditShapes)
  Cosmetics/     Characters/, Backblings/, Pickaxes/, Wraps/, Emotes/
```

Als Basis empfiehlt sich **Lyra Starter Game** (Epic, frei verwendbar in UE-Projekten): GAS-Setup, Enhanced Input, Asset Manager, modulare Kosmetik und Experience-System sind dort bereits sauber gelöst.

---

## 8. Implementierungs-Roadmap

| Phase | Dauer (Richtwert, kleines Team 3–5) | Inhalt | Abnahmekriterium |
|---|---|---|---|
| **0 – Fundament** | 2–3 Wochen | UE5-Projekt (Lyra-Basis oder Clean C++), Dedicated-Server-Build, CI, Netzwerk-Emulation, Coding-Standards | Server + 2 Clients verbinden sich automatisiert |
| **1 – Movement & Kamera** | 3–4 Wochen | Custom CMC (Sprint/Slide/Crouch/Skydive), Kamera-Modi, FOV-Slider, Deadzones, Tuning-DataAsset | Kein Rubberbanding bei 100 ms / 2 % Loss; Blindtest-Feedback positiv |
| **2 – Bauen** | 4–6 Wochen | Grid-Subsystem, 4 Bauteile, Ghost, Turbo-Build, Materialien, Strukturgraph, Prediction | 1×1-Box in < 0,5 s bei 80 ms Ping, ohne Flackern |
| **3 – Editieren** | 3–4 Wochen | Edit-Grids, Shape-Table, Drag-Select, Edit-on-Release, Reset, Prediction + Rollback | Edits fühlen sich bei 80 ms lokal an; ungültige Formen werden korrekt abgelehnt |
| **4 – Gunplay** | 4–5 Wochen | Hitscan + Projektil, Bloom/FSA, Falloff, Headshots, Lag-Compensation, Crosshair | Server bestätigt > 98 % legitimer Treffer bei 100 ms Ping |
| **5 – Inventar & Loot** | 3 Wochen | Quickbar, Materialien, Rarity-Tabellen, Truhen, Pickups, Consumables (GAS) | Kompletter Loot-Zyklus im Match |
| **6 – Match-Loop** | 3–4 Wochen | Lobby → Bus → Sprung → Sturm → Sieg, Spectate, Scoreboard | 2–16-Spieler-Testmatch durchspielbar |
| **7 – Kosmetik & Profil** | 3–4 Wochen | Asset Manager, Loadout-Replikation, Locker-UI, Emotes, Wraps, Local/HTTP-Profil | Loadout-Wechsel in der Lobby erscheint bei allen Clients |
| **8 – Skalierung** | 4–6 Wochen | Replication Graph/Iris, Bauteil-Chunking (ISM), Dormancy, Profiling mit 100 Spielern (Bots) | Server-Frame < 33 ms mit 100 Bots + 10.000 Bauteilen |
| **9 – Härtung** | laufend | Anti-Cheat-Telemetrie, EAC, Balancing, Map-Content, Audio | – |

**Risiken & Gegenmaßnahmen**

| Risiko | Gegenmaßnahme |
|---|---|
| Bau-Prediction verursacht Korrekturen der Bewegung | Früh (Phase 2) mit Netzwerk-Emulation testen, rückwirkende Kollision auf dem Server (§6.4) |
| Bauteil-Actor-Anzahl sprengt den Server | Phase 8 von Anfang an einplanen; Datenmodell so bauen, dass später Chunk/ISM möglich ist |
| „Gefühl“ trifft nicht | Tuning-Werte datengetrieben, Playtests ab Phase 1 wöchentlich |
| Rechtliches (IP) | Nur eigene/lizenzierte Assets, eigener Name und eigene Marke, keine fremden Spieldateien (§0) |
