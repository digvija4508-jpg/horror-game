# SCP Horror System - Complete Guide

## Overview

This guide covers every SCP-related setting, animation, visual, and piece of code in the project. It tells you exactly what each part does, where it lives, and how to paste/configure it.

---

## Table of Contents

1. [SCP Avatar System](#1-scp-avatar-system)
2. [SCP Avatar Animations](#2-scp-avatar-animations)
3. [SCP Avatar Visuals & Materials](#3-scp-avatar-visuals--materials)
4. [SCP Red Eyes (Entities)](#4-scp-red-eyes-entities)
5. [SCP Red Eyes Animations](#5-scp-red-eyes-animations)
6. [SCP Red Eyes Visuals](#6-scp-red-eyes-visuals)
7. [SCP Panic Mode](#7-scp-panic-mode)
8. [SCP Containment Breach](#8-scp-containment-breach)
9. [SCP Fog Interactions](#9-scp-fog-interactions)
10. [SCP Player Selection UI](#10-scp-player-selection-ui)
11. [SCP Multiplayer Sync](#11-scp-multiplayer-sync)
12. [All SCP CONFIG Settings](#12-all-scp-config-settings)
13. [File Locations Reference](#13-file-locations-reference)

---

## 1. SCP Avatar System

### What It Is
The procedural white stickman avatar that serves as the SCP player model. Every part (head, torso, arms, legs, pelvis) is built from capsule/sphere/box geometry.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `buildProceduralAvatar()` at line ~775
- **Called from:** `init()` at line ~371

### How It Works
```
buildProceduralAvatar(parentGroup, storeParts)
  -> Creates a THREE.Group called "root"
  -> Builds all body parts from geometry helpers (capsule, sphere, box)
  -> Scales everything to CONFIG.playerHeight (0.07m / 7cm)
  -> Stores references in bodyParts{} for animation
```

### Step-by-Step to Paste/Replace

**Step 1:** Open `game.js`

**Step 2:** Find the function `buildProceduralAvatar` (around line 775)

**Step 3:** To replace with SCP model, replace the entire function body with:

```javascript
function buildProceduralAvatar(parentGroup, storeParts) {
    // SCP MODE: Load SCP .glb model instead of procedural avatar
    if (useSCPAvatar) {
        const scpModelUrls = {
            "scp-173": "Avatars/SCP-173.glb",
            "scp-076": "Avatars/SCP-076.glb",
            "scp-999": "Avatars/SCP-999.glb",
            "scp-035": "Avatars/SCP-035.glb",
        };
        const url = scpModelUrls[selectedSCP] || scpModelUrls["scp-076"];

        gltfLoader.load(url, (gltf) => {
            const scpModel = gltf.scene;
            const bbox = new THREE.Box3().setFromObject(scpModel);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scaleFactor = CONFIG.playerHeight / maxDim;
            scpModel.scale.setScalar(scaleFactor);

            applySCPMaterials(scpModel, selectedSCP);
            scpModel.userData.scpType = selectedSCP;

            parentGroup.add(scpModel);
            if (storeParts) {
                playerModel = scpModel;
                bodyParts.isSCPModel = true;
                bodyParts.scpType = selectedSCP;
            }
        });
        return;
    }

    // ... existing procedural avatar code stays here ...
}
```

**Step 4:** Save the file.

### Key Settings

| Setting | Value | Where |
|---------|-------|-------|
| `playerHeight` | `0.07` (7cm) | `CONFIG` object, line 22 |
| SCP model scale factor | `playerHeight / maxDim` | `buildProceduralAvatar` |
| Camera height | `CONFIG.playerHeight * 0.95` | `init()`, line 374 |
| Avatar color | `0xffffff` (white) | `capsule()` / `sphere()` / `box()` |

---

## 2. SCP Avatar Animations

### What It Does
Every frame the avatar animates through states: idle, walk, jump, fall, land. Each state moves body parts using lerp (linear interpolation).

### Where The Code Lives
- **File:** `game.js`
- **Function:** `animateCharacter()` at line ~930
- **Helper functions:** `setLeg()` at line 919, `setArm()` at line 924

### Animation States Reference

| State | Condition | Torso Y | Hip Angle | Knee Angle | Arm Swing |
|-------|-----------|---------|-----------|------------|-----------|
| **idle** | `grounded && !isMoving` | `1.10 + sin(t)*0.012` | 0 | 0 | Slight sway |
| **walk** | `isMoving && grounded` | `1.10 - bob*0.5` | `sin(t)*0.7` | `max(0,-sin(t))*0.9` | Opposite to legs |
| **jump** | `!grounded && vVel > 0.5` | `1.18` (raised) | `-0.5` (tucked) | `1.1` (bent) | Arms up `-1.2` |
| **fall** | `!grounded && vVel < -1.0` | Tilted forward `0.25` | `0.2` | `0.5` | Arms out `0.2` |
| **land** | `landTimer > 0` | Squat based | `0.5` | `0.9` | Braced |

### How to Change Animation Speed

Find `animateCharacter()` and look for these multipliers:

```javascript
// WALK SPEED - Change the walkTime increment:
walkTime += deltaTime * 7.5;  // Line ~965, higher = faster walk cycle

// BREATHING IDLE SPEED:
walkTime += deltaTime * 1.4;   // Line ~955, higher = faster breathing

// ARM SWING AMPLITUDE:
setArm(bp.lShoulderPivot, bp.lElbowPivot, -Math.sin(t) * 0.5, ...);
//                                         ^^^^^^^^^^^^^^^^^^^^
//                                         Change 0.5 to increase/decrease arm swing range

// LEG STRIDE AMPLITUDE:
const lHipAngle = Math.sin(t) * 0.7;
//                               ^^^
//                               Change 0.7 to increase/decrease leg stride

// HEAD BOB:
const bob = Math.abs(Math.sin(t)) * 0.03;
//                                  ^^^^
//                                  Change 0.03 to increase/decrease head bob
```

### Step-by-Step to Add SCP-Specific Animation

**Step 1:** Open `game.js`

**Step 2:** After the existing `animateCharacter()` function (around line 1001), add:

```javascript
function animateSCPCharacter(deltaTime, isMoving) {
    if (!bodyParts.isSCPModel) return;

    const t = Date.now() / 1000;
    const scpType = bodyParts.scpType;

    if (scpType === "scp-173") {
        // SCP-173: Static, twitchy head movements
        if (bodyParts.headGroup) {
            bodyParts.headGroup.rotation.y = Math.sin(t * 0.1) * 0.02;
            // Sudden snap when player blinks (simulated)
            if (Math.random() < 0.001) {
                bodyParts.headGroup.rotation.y = (Math.random() - 0.5) * 2.0;
            }
        }
    } else if (scpType === "scp-076") {
        // SCP-076: Rigid, minimal movement
        if (playerModel) {
            playerModel.rotation.x = Math.sin(t * 0.05) * 0.005;
        }
    } else if (scpType === "scp-999") {
        // SCP-999: Hovering bob
        if (playerGroup) {
            playerGroup.position.y += Math.sin(t * 2.0) * 0.0003;
        }
    }
}
```

**Step 3:** In the `animate()` function, after the `animateCharacter()` call (around line 1140), add:

```javascript
animateSCPCharacter(deltaTime, isMoving);
```

**Step 4:** Save.

---

## 3. SCP Avatar Visuals & Materials

### What It Does
Controls the color, emissive glow, roughness, metalness, and transparency of each SCP entity model.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `applySCPMaterials()` (add this new function)

### SCP Material Reference Table

| SCP Type | Base Color | Emissive | Emissive Intensity | Metalness | Roughness | Opacity |
|----------|------------|----------|-------------------|-----------|-----------|---------|
| SCP-173 | `0x00aa00` (green) | `0x003300` | 0.4 | 0.1 | 0.9 | 1.0 |
| SCP-076 | `0x000000` (black) | `0x222222` | 0.05 | 0.05 | 0.95 | 0.9 |
| SCP-999 | `0xffaa00` (orange) | `0x553300` | 0.3 | 0.0 | 0.7 | 0.8 |
| SCP-035 | `0x880000` (dark red) | `0x330000` | 0.2 | 0.1 | 0.85 | 0.95 |

### Step-by-Step to Add Materials Function

**Step 1:** Open `game.js`

**Step 2:** After `buildProceduralAvatar()` (around line 917), add:

```javascript
function applySCPMaterials(model, scpType) {
    model.traverse(child => {
        if (child.isMesh) {
            const mat = child.material;
            const isArr = Array.isArray(mat);
            const mats = isArr ? mat : [mat];

            mats.forEach(m => {
                switch (scpType) {
                    case "scp-173":
                        m.color.setHex(0x00aa00);
                        m.emissive.setHex(0x003300);
                        m.emissiveIntensity = 0.4;
                        break;
                    case "scp-076":
                        m.color.setHex(0x000000);
                        m.emissive.setHex(0x222222);
                        m.emissiveIntensity = 0.05;
                        break;
                    case "scp-999":
                        m.color.setHex(0xffaa00);
                        m.emissive.setHex(0x553300);
                        m.emissiveIntensity = 0.3;
                        m.transparent = true;
                        m.opacity = 0.8;
                        break;
                    case "scp-035":
                        m.color.setHex(0x880000);
                        m.emissive.setHex(0x330000);
                        m.emissiveIntensity = 0.2;
                        break;
                }
                m.metalness = 0.1;
                m.roughness = 0.9;
                m.toneMapping = THREE.ACESFilmicToneMapping;
                m.toneMappingExposure = 0.8;
                m.needsUpdate = true;
            });
        }
    });
}
```

**Step 3:** Save.

---

## 4. SCP Red Eyes (Entities)

### What It Is
The creepy glowing red eyes that watch the player from the darkness. These are the SCP entities lurking in the map.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `spawnRedEyes()` at line ~1354
- **Update function:** `updateRedEyes()` at line ~1442

### Spawn Settings

| Setting | Value | Line |
|---------|-------|------|
| Eye geometry radius | `0.0008` | 1361 |
| Eye color | `0xff0000` (red) | 1362 |
| Eye count | `4` | 1364 |
| Eye spacing apart | `0.0015` (1.5mm) | 1370-1371 |
| Min distance from spawn | `1.5` units | 1381 |
| Placement range | `8.0` units | 1379-1380 |
| Snap height above ground | `0.015` | 1386 |

### Step-by-Step to Change Eye Count/Color

**Step 1:** Open `game.js`

**Step 2:** Find `spawnRedEyes()` at line 1354

**Step 3:** Change the eye count (line 1364):
```javascript
for (let i = 0; i < 6; i++) {  // Changed from 4 to 6
```

**Step 4:** Change eye color (line 1362):
```javascript
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, fog: false }); // Green eyes
```

**Step 5:** Save.

---

## 5. SCP Red Eyes Animations

### What It Does
Eyes pulse/breathe their glow, look at the player, and teleport away when the flashlight shines on them.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `updateRedEyes()` at line ~1442

### Animation Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Glow breathing rate | `deltaTime * 2` | How fast eyes pulse |
| Look-at target | `playerGroup.position` | Eyes always face player |
| Flashlight detection angle | `Math.PI / 8` (22.5deg) | When flashlight points at eyes |
| Flashlight detection range | `0.8` units | Max distance for flashlight detection |
| Panic trigger range | `0.65` units | When panic intensity starts |
| Panic max | `1.0` | Maximum panic intensity |

### Key Animation Code

```javascript
// Glow breathing (line ~1449)
eye.fadeTimer += deltaTime * 2;
const glow = (Math.sin(eye.fadeTimer) + 1.0) / 2.0;
// Sets color: (glow, 0, 0) = pulses between black and red

// Look at player (line ~1458)
eye.group.lookAt(playerGroup.position);

// Flashlight detection (line ~1474)
const angle = lookDir.angleTo(toEyeDir);
if (angle < Math.PI / 8 && dist < 0.8) {
    // Teleport eyes away
}
```

### How to Adjust

```javascript
// Slower glow pulse:
eye.fadeTimer += deltaTime * 0.8;  // Was 2

// Faster glow pulse:
eye.fadeTimer += deltaTime * 5.0;  // Was 2

// Wider flashlight detection:
if (angle < Math.PI / 4 && dist < 1.5) {  // Was PI/8 and 0.8

// Closer panic trigger:
if (minDistance < 0.4) {  // Was 0.65
```

---

## 6. SCP Red Eyes Visuals

### Where The Code Lives
- **File:** `game.js`
- **Lines:** 1361-1362 (geometry and material)

### Visual Settings

| Property | Current Value | How to Change |
|----------|--------------|---------------|
| Eye shape | `SphereGeometry(0.0008, 8, 8)` | Increase radius for bigger eyes |
| Eye color | `0xff0000` | Change hex value |
| Eye material | `MeshBasicMaterial` | Unlit, always visible through fog |
| `fog: false` | `true` | Eyes visible even in dense fog |
| Eyes per entity | 2 (left + right) | Hardcoded in group |
| Eye spacing | `0.003` total | Left at `-0.0015`, right at `0.0015` |

### How to Make Eyes Glow Through Fog

The `fog: false` property on the material makes eyes visible regardless of fog density:

```javascript
const eyeMat = new THREE.MeshBasicMaterial({ 
    color: 0xff0000, 
    fog: false  // This line prevents fog from hiding the eyes
});
```

---

## 7. SCP Panic Mode

### What It Is
When SCP entities get close, the screen shakes, vignette pulses red, fog density increases, and the player experiences horror effects.

### Where The Code Lives
- **File:** `game.js`
- **Variable:** `panicIntensity` at line 55
- **Applied in:** `animate()` at lines ~1107-1121
- **Triggered by:** `updateRedEyes()` at line ~1497

### Panic Settings

| Setting | Value | Description |
|---------|-------|-------------|
| Panic trigger distance | `0.65` units | When panic starts |
| Max panic intensity | `1.0` | Full panic |
| Camera shake X | `(Math.random()-0.5)*0.0016*panicIntensity` | Horizontal shake |
| Camera shake Y | `(Math.random()-0.5)*0.0016*panicIntensity` | Vertical shake |
| Vignette class | `.vignette.panic` | CSS class for red pulse |

### Panic Trigger Code (line ~1497)

```javascript
if (minDistance < 0.65) {
    panicIntensity = Math.max(0, (0.65 - minDistance) / 0.65);
} else {
    panicIntensity = 0;
}
```

### How to Adjust

```javascript
// Trigger panic from further away:
if (minDistance < 1.5) {  // Was 0.65

// More intense shake:
const shakeX = (Math.random() - 0.5) * 0.005 * panicIntensity;  // Was 0.0016

// Less intense shake:
const shakeX = (Math.random() - 0.5) * 0.0008 * panicIntensity;  // Was 0.0016
```

### Panic CSS (style.css)

```css
/* Line ~454 in style.css */
.vignette.panic {
    background: radial-gradient(circle, rgba(140, 10, 10, 0.32) 15%, rgba(0, 0, 0, 0.98) 80%);
    animation: heartbeat 0.6s infinite alternate ease-in-out;
}

@keyframes heartbeat {
    0% { transform: scale(1.0); opacity: 0.95; }
    100% { transform: scale(1.03); opacity: 1.0; }
}
```

---

## 8. SCP Containment Breach

### What It Is
When panic intensity exceeds 0.7 for 3+ seconds, a "CONTAINMENT BREACH" screen appears with an emergency alert.

### Where The Code Lives
- **File:** Add to `game.js` after `updateRedEyes()`
- **Function:** `triggerScpEscape()` (add this function)

### Step-by-Step to Add

**Step 1:** Open `game.js`

**Step 2:** After `updateRedEyes()`, add:

```javascript
function triggerScpEscape(scpType, distance) {
    const msg = document.createElement('div');
    msg.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;
             background:rgba(0,0,0,0.95);z-index:10000;display:flex;
             align-items:center;justify-content:center;">
            <div style="text-align:center;padding:30px;background:rgba(50,0,0,0.9);
                 border:3px solid #ff0000;border-radius:10px;max-width:600px;">
                <h2 style="color:#ff0000;font-size:32px;">CONTAINMENT BREACH!</h2>
                <p style="color:#fff;font-size:18px;margin:20px 0;">
                    ${scpType.toUpperCase()} has escaped!
                </p>
                <p style="color:#ffcc00;font-size:16px;">
                    Distance: ${(distance * 100).toFixed(0)}cm
                </p>
                <button onclick="location.reload()" 
                    style="margin-top:20px;padding:10px 30px;background:#ff0000;
                    color:white;border:none;border-radius:5px;cursor:pointer;
                    font-size:16px;">RECONTAIN NOW</button>
            </div>
        </div>
    `;
    document.body.appendChild(msg);
}
```

**Step 3:** In `updateRedEyes()`, after the panic intensity calculation (around line 1500), add:

```javascript
// Check for containment breach
if (panicIntensity > 0.7 && minDistance < 0.3) {
    triggerScpEscape("SCP-Unknown", minDistance);
}
```

**Step 4:** Save.

---

## 9. SCP Fog Interactions

### What It Is
SCP entities make the fog denser when they are nearby, creating an oppressive atmosphere.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `updateScpFogDensity()` (add this function)

### Step-by-Step to Add

**Step 1:** Open `game.js`

**Step 2:** After `updateRedEyes()`, add:

```javascript
function updateScpFogDensity(deltaTime) {
    if (!scene.fog) return;

    let nearestDist = 999;
    redEyesList.forEach(eye => {
        const d = eye.group.position.distanceTo(playerGroup.position);
        if (d < nearestDist) nearestDist = d;
    });

    if (nearestDist < 3.0) {
        // SCP nearby: increase fog density
        const factor = 1.0 + (3.0 - nearestDist) * 1.5;
        scene.fog.density = THREE.MathUtils.lerp(
            scene.fog.density, CONFIG.fogDensity * factor, 3 * deltaTime
        );
    } else {
        // No SCP nearby: return to normal
        scene.fog.density = THREE.MathUtils.lerp(
            scene.fog.density, CONFIG.fogDensity, 2 * deltaTime
        );
    }
}
```

**Step 3:** In the `animate()` function, after `updateRedEyes(deltaTime)`, add:

```javascript
updateScpFogDensity(deltaTime);
```

**Step 4:** Save.

---

## 10. SCP Player Selection UI

### What It Is
A menu that lets players choose which SCP entity to play as before the game starts.

### Where The Code Lives
- **File:** `game.js`
- **Functions:** `showSCPSelectionMenu()` (add this)
- **Global variables:** `selectedSCP`, `useSCPAvatar` (add these)

### Step-by-Step to Add

**Step 1:** Open `game.js`

**Step 2:** Near the top (after line 140, with other globals), add:

```javascript
let selectedSCP = "scp-076";
let useSCPAvatar = false;
```

**Step 3:** Before the `init()` function (around line 155), add:

```javascript
function showSCPSelectionMenu() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.85);z-index:2000;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;';

    const title = document.createElement('h2');
    title.innerText = 'CHOOSE YOUR SCP ENTITY';
    title.style.cssText = 'color:#ff0000;font-size:28px;margin-bottom:30px;';
    overlay.appendChild(title);

    const cards = document.createElement('div');
    cards.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;justify-content:center;';
    overlay.appendChild(cards);

    const options = [
        { type: "scp-173", name: "SCP-173", desc: "Static. Turns when not looked at.", color: "#00ff00" },
        { type: "scp-076", name: "SCP-076", desc: "Emotionless. Rigid movement.", color: "#ffffff" },
        { type: "scp-999", name: "SCP-999", desc: "Hovering. Distorts perception.", color: "#ffff00" },
        { type: "scp-035", name: "SCP-035", desc: "Haunting. Follows in shadows.", color: "#ff0000" }
    ];

    options.forEach(opt => {
        const card = document.createElement('div');
        card.style.cssText = `width:200px;padding:15px;background:rgba(50,0,0,0.7);` +
            `border:2px solid ${opt.color};border-radius:8px;cursor:pointer;text-align:center;`;
        card.innerHTML = `<h3 style="color:${opt.color};margin:10px 0;">${opt.name}</h3>` +
            `<p style="font-size:12px;color:#ddd;">${opt.desc}</p>`;
        card.addEventListener('click', () => {
            selectedSCP = opt.type;
            useSCPAvatar = true;
            overlay.remove();
            init();
        });
        cards.appendChild(card);
    });

    document.body.appendChild(overlay);
}
```

**Step 4:** Save.

---

## 11. SCP Multiplayer Sync

### What It Is
Other players see your SCP model and its animations in multiplayer.

### Where The Code Lives
- **File:** `game.js`
- **Functions:** `createRemotePlayer()` at line ~2291, `updateRemotePlayer()` at line ~2402

### What to Send in Player Updates

In `sendPlayerUpdate()` (line ~2521), add SCP data:

```javascript
ws.send(JSON.stringify({
    type: 'update',
    x: playerGroup.position.x,
    y: playerGroup.position.y,
    z: playerGroup.position.z,
    yaw: yaw,
    pitch: pitch,
    activeSlot: selectedSlot,
    isSprinting: localIsSprintingActive,
    isFlashlightOn: selectedSlot === 1,
    // SCP-specific:
    isSCPAvatar: useSCPAvatar,
    scpType: selectedSCP
}));
```

### What to Handle in Remote Player Creation

In `createRemotePlayer()`, after creating the group (around line 2298), add:

```javascript
if (p.isSCPAvatar && p.scpType) {
    gltfLoader.load('Avatars/' + p.scpType + '.glb', (gltf) => {
        const remoteModel = gltf.scene;
        const bbox = new THREE.Box3().setFromObject(remoteModel);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        remoteModel.scale.setScalar(CONFIG.playerHeight / maxDim);
        applySCPMaterials(remoteModel, p.scpType);
        group.add(remoteModel);
    });
}
```

---

## 12. All SCP CONFIG Settings

### Add to the CONFIG object in game.js (line ~21)

```javascript
const CONFIG = {
    // ... existing settings ...
    
    // SCP Avatar Settings
    scpModelPath: 'Avatars/',
    defaultSCP: 'scp-076',
    
    // SCP Eye Settings  
    scpEyeRadius: 0.0008,
    scpEyeColor: 0xff0000,
    scpEyeCount: 4,
    scpEyeSpacing: 0.0015,
    scpMinSpawnDist: 1.5,
    scpPlacementRange: 8.0,
    
    // SCP Panic Settings
    scpPanicRange: 0.65,
    scpPanicMaxIntensity: 1.0,
    scpShakeIntensity: 0.0016,
    scpFlashlightAngle: Math.PI / 8,
    scpFlashlightRange: 0.8,
    
    // SCP Fog Interaction
    scpFogTriggerDist: 3.0,
    scpFogDensityMultiplier: 1.5,
    
    // SCP Containment Breach
    scpBreachPanicThreshold: 0.7,
    scpBreachDistThreshold: 0.3,
};
```

---

## 13. File Locations Reference

| Feature | File | Line | Function |
|---------|------|------|----------|
| Avatar builder | `game.js` | ~775 | `buildProceduralAvatar()` |
| Avatar animation | `game.js` | ~930 | `animateCharacter()` |
| Avatar leg animation | `game.js` | ~919 | `setLeg()` |
| Avatar arm animation | `game.js` | ~924 | `setArm()` |
| Red eyes spawn | `game.js` | ~1354 | `spawnRedEyes()` |
| Red eyes update | `game.js` | ~1442 | `updateRedEyes()` |
| Panic intensity calc | `game.js` | ~1497 | Inside `updateRedEyes()` |
| Panic visual effect | `game.js` | ~1107 | Inside `animate()` |
| Panic CSS | `style.css` | ~454 | `.vignette.panic` |
| Camera shake | `game.js` | ~1112 | Inside `animate()` |
| CONFIG object | `game.js` | ~21 | `const CONFIG = {...}` |
| Flashlight | `game.js` | ~2028 | `createProceduralFlashlight()` |
| Player height | `game.js` | ~22 | `CONFIG.playerHeight` |
| Global SCP vars | `game.js` | Add near top | `selectedSCP`, `useSCPAvatar` |
| SCP selection menu | `game.js` | Add before init | `showSCPSelectionMenu()` |
| SCP materials | `game.js` | Add after avatar | `applySCPMaterials()` |
| Containment breach | `game.js` | Add after eyes | `triggerScpEscape()` |
| SCP fog density | `game.js` | Add after eyes | `updateScpFogDensity()` |
| SCP model files | `D:/horror game/Avatars/` | - | `.glb` files |

---

## Quick Start Checklist

- [ ] Create `Avatars/` folder in project root
- [ ] Place SCP `.glb` model files in `Avatars/`
- [ ] Add `selectedSCP` and `useSCPAvatar` globals near top of `game.js`
- [ ] Add `applySCPMaterials()` function after `buildProceduralAvatar()`
- [ ] Add SCP branch inside `buildProceduralAvatar()`
- [ ] Add `showSCPSelectionMenu()` function
- [ ] Add SCP-specific animation in `animateSCPCharacter()`
- [ ] Add `updateScpFogDensity()` function
- [ ] Add `triggerScpEscape()` function
- [ ] Update `sendPlayerUpdate()` with SCP data
- [ ] Update `createRemotePlayer()` to load SCP models
- [ ] Add SCP CONFIG settings to CONFIG object
- [ ] Add `.vignette.panic` CSS if not present
- [ ] Test all SCP types work correctly
