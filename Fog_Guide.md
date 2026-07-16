# Fog System - Complete Guide

## Overview

This guide covers every fog-related setting, animation, visual, and piece of code in the project. It tells you exactly what each part does, where it lives, and how to configure it.

---

## Table of Contents

1. [Fog Core Settings](#1-fog-core-settings)
2. [Fog Initialization](#2-fog-initialization)
3. [Fog Day/Night Toggle](#3-fog-daynight-toggle)
4. [Fog Density Calculation](#4-fog-density-calculation)
5. [Fog Color Transitions](#5-fog-color-transitions)
6. [Fog in Minimap](#6-fog-in-minimap)
7. [Fog + SCP Interaction](#7-fog--scp-interaction)
8. [Fog + Panic Mode](#8-fog--panic-mode)
9. [Fog CSS Visual Effects](#9-fog-css-visual-effects)
10. [Fog Particle Effects](#10-fog-particle-effects)
11. [All Fog CONFIG Settings](#11-all-fog-config-settings)
12. [File Locations Reference](#12-file-locations-reference)

---

## 1. Fog Core Settings

### What It Is
The Three.js `FogExp2` system creates exponential fog that makes distant objects fade to black, simulating a dark forest night.

### Where The Code Lives
- **File:** `game.js`
- **Line:** 28 (CONFIG) and 160 (scene setup)

### All Core Values

| Setting | Value | Where | Description |
|---------|-------|-------|-------------|
| Fog type | `THREE.FogExp2` | Line 160 | Exponential fog (denser with distance) |
| Fog color (night) | `0x000000` (black) | Line 160 | Pitch black night |
| Fog density (night) | `4.5` | Line 28 | Balanced visibility at night |
| Fog color (day) | `0xb0d5f8` (sky blue) | Line 1765 | Afternoon sky |
| Fog density (day) | `0.015` | Line 1766 | Thin clear-day fog |

### How to Change Fog Density

**In `game.js`, find the CONFIG object (line 21):**

```javascript
const CONFIG = {
    fogDensity: 4.5,  // Line 28 - Change this value
    // ...
};
```

| Fog Density | Effect |
|-------------|--------|
| `1.0` | Very thin fog, can see far |
| `2.5` | Light fog, moderate visibility |
| `4.5` | Default, good horror balance |
| `6.0` | Dense fog, limited visibility |
| `10.0` | Very dense, can barely see |
| `20.0` | Extreme, almost zero visibility |

### How to Change Fog Color

**In `game.js`, find the scene setup (line 160):**

```javascript
scene.fog = new THREE.FogExp2(0x000000, CONFIG.fogDensity);
//                              ^^^^^^^
//                              Change this hex value
```

| Color | Hex | Effect |
|-------|-----|--------|
| Black | `0x000000` | Default dark horror |
| Dark blue | `0x000011` | Cold, icy atmosphere |
| Dark green | `0x001100` | Toxic/swamp fog |
| Dark red | `0x110000` | Blood/inferno fog |
| Purple | `0x0a0011` | Supernatural fog |
| Grey | `0x222222` | Overcast/misty |

---

## 2. Fog Initialization

### Where It Happens
- **File:** `game.js`
- **Function:** `init()` at line 155

### The Code (lines 157-160)

```javascript
function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pitch black night
    // Add Exp2 Fog for a dark horror night
    scene.fog = new THREE.FogExp2(0x000000, CONFIG.fogDensity); // Playable dark fog
```

### What Each Part Does

| Line | Code | Purpose |
|------|------|---------|
| 158 | `scene.background = new THREE.Color(0x000000)` | Sets background to pitch black |
| 160 | `new THREE.FogExp2(0x000000, CONFIG.fogDensity)` | Creates exponential fog |
| 160 | `scene.fog = ...` | Assigns fog to scene |

### Step-by-Step to Replace Fog Type

**Step 1:** Open `game.js`

**Step 2:** Find line 160

**Step 3:** Replace `FogExp2` with linear fog for different effect:

```javascript
// Linear fog (fog starts at near distance, full at far distance)
scene.fog = new THREE.Fog(0x000000, 0.1, 1.5);
//                          color    near  far
```

**Step 4:** Save.

### FogExp2 vs Fog Comparison

| Property | FogExp2 | Fog (Linear) |
|----------|---------|--------------|
| Formula | `exp(-density * distance)` | Linear interpolation |
| Parameters | `color, density` | `color, near, far` |
| Feel | Smooth exponential fade | Sharp cutoff at `far` |
| Best for | Horror atmosphere | Precise visibility control |
| Default values | `density: 4.5` | `near: 0.1, far: 1.5` |

---

## 3. Fog Day/Night Toggle

### What It Is
Press `C` to toggle between day and night mode. The fog changes from black (density 4.5) to sky blue (density 0.015).

### Where The Code Lives
- **File:** `game.js`
- **Toggle trigger:** `keydown` handler at line 452
- **Update function:** `updateTimeOfDay()` at line 1759

### Toggle Code (line 452)

```javascript
// C key toggles day mode
if (e.key.toLowerCase() === 'c') {
    dayMode = !dayMode;
    updateTimeOfDay();
}
```

### Day Mode (lines 1763-1785)

```javascript
if (dayMode) {
    scene.background = new THREE.Color(0xb0d5f8);          // Sky blue
    scene.fog.color = new THREE.Color(0xb0d5f8);           // Fog matches sky
    scene.fog.density = 0.015;                              // Thin fog
    
    scene.traverse(child => {
        if (child.isAmbientLight) {
            child.color.setHex(0xffffff);                   // White ambient
            child.intensity = 1.0;                          // Bright ambient
        }
    });
    
    if (!sunLight) {
        sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
        sunLight.position.set(20, 40, 20);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        sunLight.shadow.bias = -0.0005;
        scene.add(sunLight);
    } else {
        sunLight.visible = true;
    }
}
```

### Night Mode (lines 1787-1799)

```javascript
else {
    scene.background = new THREE.Color(0x000000);           // Black
    scene.fog.color = new THREE.Color(0x000000);           // Black fog
    scene.fog.density = CONFIG.fogDensity;                  // Dense fog
    
    scene.traverse(child => {
        if (child.isAmbientLight) {
            child.color.setHex(0x0e0e14);                  // Dark blue-grey
            child.intensity = CONFIG.ambientLightIntensity; // 0.12
        }
    });
    
    if (sunLight) {
        sunLight.visible = false;
    }
}
```

### Day/Night Settings Reference

| Property | Night | Day |
|----------|-------|-----|
| Background color | `0x000000` (black) | `0xb0d5f8` (sky blue) |
| Fog color | `0x000000` (black) | `0xb0d5f8` (sky blue) |
| Fog density | `4.5` | `0.015` |
| Ambient color | `0x0e0e14` (dark blue) | `0xffffff` (white) |
| Ambient intensity | `0.12` | `1.0` |
| Sun light | Hidden | Visible, intensity `1.4` |
| Tone mapping exposure | `1.1` | `1.1` |

### How to Change Day Mode Colors

```javascript
// Sunset mode:
scene.background = new THREE.Color(0xff6633);  // Orange
scene.fog.color = new THREE.Color(0xff4422);   // Red-orange fog
scene.fog.density = 0.025;                      // Slightly denser

// Night with moonlight:
scene.background = new THREE.Color(0x0a0a20);  // Dark navy
scene.fog.color = new THREE.Color(0x0a0a20);   // Matching fog
scene.fog.density = 3.0;                         // Moderate
```

---

## 4. Fog Density Calculation

### How Fog Density Works in FogExp2

The formula is:
```
visibility = exp(-density * distance)
```

| Distance (units) | density=1.0 | density=4.5 | density=10.0 |
|------------------|-------------|-------------|--------------|
| 0.1 | 90% visible | 64% visible | 37% visible |
| 0.2 | 82% visible | 40% visible | 14% visible |
| 0.3 | 74% visible | 25% visible | 5% visible |
| 0.5 | 61% visible | 10% visible | 0.7% visible |
| 1.0 | 37% visible | 1% visible | 0.005% visible |

### Micro Scale Context

The game operates at 7cm character scale, so distances are tiny:
- `0.1` units = 10cm (about one hand width)
- `0.5` units = 50cm (arm's length)
- `1.0` units = 1m (about a step)
- `4.5` units = 4.5m (across a room)

At `density=4.5`:
- You can see about `0.3m` clearly (30cm)
- Beyond `0.5m` things fade fast
- Beyond `1.0m` everything is black

### How to Calculate Your Own Density

```javascript
// desiredVisibility at distance d:
// visibility = exp(-density * d)
// density = -ln(visibility) / d

// Example: want 50% visibility at 0.5m:
// density = -ln(0.5) / 0.5 = 1.386

CONFIG.fogDensity = 1.386;
```

---

## 5. Fog Color Transitions

### What It Is
Smoothly transitions fog color and density when toggling day/night.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `updateTimeOfDay()` at line 1759

### How Transitions Work

The day/night toggle is **instant** (no lerp). To add smooth transitions:

### Step-by-Step to Add Smooth Fog Transitions

**Step 1:** Open `game.js`

**Step 2:** Add transition variables near the top (with other globals, around line 80):

```javascript
let fogTargetColor = new THREE.Color(0x000000);
let fogTargetDensity = 4.5;
let fogTransitionSpeed = 2.0;
```

**Step 3:** Replace the `updateTimeOfDay()` function (line 1759) with:

```javascript
function updateTimeOfDay() {
    if (dayMode) {
        fogTargetColor.set(0xb0d5f8);
        fogTargetDensity = 0.015;
        
        scene.traverse(child => {
            if (child.isAmbientLight) {
                child.color.setHex(0xffffff);
                child.intensity = 1.0;
            }
        });
        
        if (!sunLight) {
            sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
            sunLight.position.set(20, 40, 20);
            sunLight.castShadow = true;
            sunLight.shadow.mapSize.width = 1024;
            sunLight.shadow.mapSize.height = 1024;
            sunLight.shadow.bias = -0.0005;
            scene.add(sunLight);
        } else {
            sunLight.visible = true;
        }
    } else {
        fogTargetColor.set(0x000000);
        fogTargetDensity = CONFIG.fogDensity;
        
        scene.traverse(child => {
            if (child.isAmbientLight) {
                child.color.setHex(0x0e0e14);
                child.intensity = CONFIG.ambientLightIntensity;
            }
        });
        
        if (sunLight) {
            sunLight.visible = false;
        }
    }
}

// NEW: Smooth fog transition (call in animate loop)
function updateFogTransition(deltaTime) {
    if (!scene.fog) return;
    
    // Smooth color lerp
    scene.fog.color.lerp(fogTargetColor, fogTransitionSpeed * deltaTime);
    
    // Smooth density lerp
    scene.fog.density = THREE.MathUtils.lerp(
        scene.fog.density,
        fogTargetDensity,
        fogTransitionSpeed * deltaTime
    );
}
```

**Step 4:** In the `animate()` function, add `updateFogTransition(deltaTime)` after `mapMixer.update()` (around line 1044):

```javascript
if (mapMixer) {
    mapMixer.update(deltaTime);
}

updateFogTransition(deltaTime);  // Add this line
```

**Step 5:** Save.

---

## 6. Fog in Minimap

### What It Is
The minimap temporarily disables fog to show a clear top-down view, then restores it.

### Where The Code Lives
- **File:** `game.js`
- **Function:** `updateMinimap()` at line 1504

### The Code (lines 1514-1550)

```javascript
// 2. Temporarily switch scene settings to DAYLIGHT
const originalFog = scene.fog;                    // Save fog
const originalAmbientIntensity = ambientLight.intensity;
const originalTorch = torchLight.intensity;
const originalCampfire = campfireLight ? campfireLight.intensity : 0;

// Temporarily hide night lights and vignettes
scene.fog = null;                                 // Disable fog
ambientLight.intensity = 1.4;                     // Bright daylight
sunLight.visible = true;
sunLight.intensity = 1.8;
torchLight.intensity = 0.0;
if (campfireLight) campfireLight.intensity = 0.4;

// Hide spooky red eyes during minimap render pass
redEyesList.forEach(eye => {
    if (eye.group) eye.group.visible = false;
});

// Render the 3D top-down view
minimapRenderer.render(scene, minimapCamera);

// Restore original night settings immediately
scene.fog = originalFog;                          // Restore fog
ambientLight.intensity = originalAmbientIntensity;
torchLight.intensity = originalTorch;
if (campfireLight) campfireLight.intensity = originalCampfire;
sunLight.visible = originalSunVisible;
sunLight.intensity = originalSunIntensity;

// Re-enable spooky elements
redEyesList.forEach(eye => {
    if (eye.group) eye.group.visible = true;
});
```

### Why This Matters
- Without disabling fog, the minimap would be too dark to read
- Fog is restored immediately after the minimap renders
- This happens every frame but the minimap is small (120x120px)

### How to Change Minimap Fog Behavior

```javascript
// Keep fog on minimap but make it lighter:
scene.fog = new THREE.FogExp2(0x000000, 1.0);  // Lighter fog

// Or use a different fog color for minimap:
scene.fog = new THREE.FogExp2(0x222222, 2.0);
```

---

## 7. Fog + SCP Interaction

### What It Is
When SCP entities (red eyes) are nearby, fog density increases to create tension.

### Where The Code Lives
- **File:** `game.js`
- **Add this function** after `updateRedEyes()`

### Step-by-Step to Add

**Step 1:** Open `game.js`

**Step 2:** After `updateRedEyes()` (around line 1502), add:

```javascript
function updateScpFogDensity(deltaTime) {
    if (!scene.fog || !playerGroup) return;

    let nearestDist = 999;
    redEyesList.forEach(eye => {
        const d = eye.group.position.distanceTo(playerGroup.position);
        if (d < nearestDist) nearestDist = d;
    });

    // SCP nearby: increase fog density
    if (nearestDist < 3.0) {
        const proximityFactor = 1.0 + (3.0 - nearestDist) * 1.5;
        const targetDensity = CONFIG.fogDensity * proximityFactor;
        scene.fog.density = THREE.MathUtils.lerp(
            scene.fog.density, targetDensity, 3 * deltaTime
        );
    } else {
        // No SCP nearby: return to normal density
        scene.fog.density = THREE.MathUtils.lerp(
            scene.fog.density, CONFIG.fogDensity, 2 * deltaTime
        );
    }
}
```

**Step 3:** In `animate()`, after `updateRedEyes(deltaTime)`, add:

```javascript
updateScpFogDensity(deltaTime);
```

**Step 4:** Save.

### Fog Density by SCP Distance

| SCP Distance | Fog Density Multiplier | Effective Density |
|--------------|----------------------|-------------------|
| 3.0+ units | 1.0x (normal) | 4.5 |
| 2.5 units | 1.25x | 5.6 |
| 2.0 units | 1.5x | 6.75 |
| 1.5 units | 1.75x | 7.875 |
| 1.0 units | 2.0x | 9.0 |
| 0.5 units | 2.25x | 10.125 |
| 0.0 units | 2.5x | 11.25 |

---

## 8. Fog + Panic Mode

### What It Is
When panic intensity is high, the fog gets an additional red tint and increased density.

### Where The Code Lives
- **File:** `game.js`
- **Inside:** `animate()` at lines ~1107-1121

### The Code

```javascript
// Apply camera wobble and vignette pulse when panic intensity is high (danger!)
const vignette = document.querySelector('.vignette');
if (vignette) {
    if (panicIntensity > 0.05) {
        vignette.classList.add('panic');
        // High frequency camera translation jitter for fear effect
        if (camera) {
            const shakeX = (Math.random() - 0.5) * 0.0016 * panicIntensity;
            const shakeY = (Math.random() - 0.5) * 0.0016 * panicIntensity;
            camera.position.x += shakeX;
            camera.position.y += shakeY;
        }
    } else {
        vignette.classList.remove('panic');
    }
}
```

### Step-by-Step to Add Fog Color Change During Panic

**Step 1:** Open `game.js`

**Step 2:** In the `animate()` function, after the vignette code (around line 1121), add:

```javascript
// Fog color tint during panic
if (panicIntensity > 0.05 && scene.fog) {
    // Lerp fog to dark red during panic
    const panicColor = new THREE.Color(0x330000);
    scene.fog.color.lerp(panicColor, panicIntensity * 0.1);
    
    // Increase fog density during panic
    const panicDensity = CONFIG.fogDensity * (1.0 + panicIntensity * 0.5);
    scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, panicDensity, 0.1);
}
```

**Step 3:** Save.

### Panic Fog Settings

| Panic Intensity | Fog Color | Fog Density | Visual Effect |
|-----------------|-----------|-------------|---------------|
| 0.0 | Black | 4.5 | Normal horror |
| 0.2 | Dark red tint | 5.0 | Slight unease |
| 0.5 | Red tint | 5.6 | Growing fear |
| 0.8 | Strong red | 6.3 | Near panic |
| 1.0 | Deep red | 6.75 | Full panic |

---

## 9. Fog CSS Visual Effects

### What It Is
The vignette overlay on the screen creates the horror fog-around-edges effect.

### Where The Code Lives
- **File:** `style.css`
- **Lines:** 310-320 (vignette) and 454-462 (panic vignette)

### Normal Vignette (line 310)

```css
.vignette {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, transparent 20%, rgba(0, 0, 0, 0.96) 85%);
    pointer-events: none;
    z-index: 3;
    transition: opacity 0.5s ease;
}
```

### What Each Property Does

| Property | Value | Effect |
|----------|-------|--------|
| `background` | `radial-gradient(circle, transparent 20%, rgba(0,0,0,0.96) 85%)` | Dark edges, clear center |
| `transparent 20%` | Center 20% is invisible | Player can see clearly |
| `rgba(0,0,0,0.96) 85%` | Edges are almost black | Fog around edges |
| `pointer-events: none` | Click-through | Doesn't block gameplay |
| `z-index: 3` | Above game canvas | Always visible on top |
| `transition: opacity 0.5s` | Smooth fade | When toggling panic |

### Panic Vignette (line 454)

```css
.vignette.panic {
    background: radial-gradient(circle, rgba(140, 10, 10, 0.32) 15%, rgba(0, 0, 0, 0.98) 80%);
    animation: heartbeat 0.6s infinite alternate ease-in-out;
}

@keyframes heartbeat {
    0% { transform: scale(1.0); opacity: 0.95; }
    100% { transform: scale(1.03); opacity: 1.0; }
}
```

### How to Change Vignette

```css
/* Wider clear area (less fog edges): */
.vignette {
    background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.96) 90%);
}

/* Narrower clear area (more fog edges): */
.vignette {
    background: radial-gradient(circle, transparent 10%, rgba(0,0,0,0.96) 70%);
}

/* Red horror vignette: */
.vignette.panic {
    background: radial-gradient(circle, rgba(200, 0, 0, 0.4) 10%, rgba(0,0,0,0.99) 75%);
    animation: heartbeat 0.4s infinite alternate ease-in-out;  /* Faster pulse */
}

/* Slower heartbeat: */
@keyframes heartbeat {
    0% { transform: scale(1.0); opacity: 0.9; }
    100% { transform: scale(1.05); opacity: 1.0; }
}
```

---

## 10. Fog Particle Effects

### What It Is
Fireflies and bug swarms that are visible through the fog (they use `fog: false` on their material).

### Where The Code Lives
- **File:** `game.js`
- **Function:** `spawnAmbientParticles()` at line 601
- **Update:** `updateAmbientParticles()` at line 681

### Firefly Settings (line 604-638)

| Setting | Value | Description |
|---------|-------|-------------|
| Count | `60` | Number of fireflies |
| Geometry | `SphereGeometry(0.0015, 6, 6)` | 1.5mm radius |
| Color | `0xdfff80` | Bright green-yellow |
| Opacity | `0.95` | Nearly fully visible |
| `fog: false` | `true` | **Visible through fog** |
| Spawn range | `10.0` units | Spread across map |
| Height range | `0.05 to 0.85` | Ground to above player |
| Oscillation freq | `0.4 - 1.0` Hz | Slow drift |
| Oscillation amplitude | `0.3 - 0.9` units | Movement range |

### Bug Swarm Settings (line 640-678)

| Setting | Value | Description |
|---------|-------|-------------|
| Swarm count | `3` | Number of swarms |
| Bugs per swarm | `20` | Total 60 bugs |
| Geometry | `SphereGeometry(0.0010, 4, 4)` | 1.0mm radius |
| Color | `0x111111` (black) | Dark bugs |
| `fog` property | Not set (default true) | Affected by fog |
| Oscillation freq | `1.8 - 5.3` Hz | Fast flutter |
| Oscillation amplitude | `0.04 - 0.16` units | Small movement |

### The Key Line - `fog: false`

```javascript
const fireflyMat = new THREE.MeshBasicMaterial({
    color: 0xdfff80,
    transparent: true,
    opacity: 0.95,
    fog: false  // THIS LINE makes fireflies visible through fog
});
```

### How to Make Bugs Visible Through Fog Too

```javascript
const bugMat = new THREE.MeshBasicMaterial({ 
    color: 0x111111,
    fog: false  // Add this line
});
```

### How to Change Particle Fog Behavior

```javascript
// Make fireflies affected by fog (disappear in distance):
const fireflyMat = new THREE.MeshBasicMaterial({
    color: 0xdfff80,
    transparent: true,
    opacity: 0.95
    // Remove fog: false line
});

// Make fireflies brighter to compete with fog:
const fireflyMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,  // Pure white
    transparent: true,
    opacity: 1.0,
    fog: false
});
```

---

## 11. All Fog CONFIG Settings

### Add/Modify in the CONFIG object in game.js (line 21)

```javascript
const CONFIG = {
    // ─── FOG SETTINGS ──────────────────────────────────
    fogDensity: 4.5,              // Night fog density (FogExp2)
    fogColor: 0x000000,           // Night fog color (black)
    fogDayColor: 0xb0d5f8,        // Day fog color (sky blue)
    fogDayDensity: 0.015,         // Day fog density (thin)
    fogTransitionSpeed: 2.0,      // Speed of fog color transition
    fogNearColor: 0x000000,       // Panic fog near color
    fogPanicMultiplier: 1.5,      // Fog density multiplier during panic
    fogSCPProximityRange: 3.0,    // Distance where SCP affects fog
    fogSCP DensityMultiplier: 1.5, // Fog density multiplier near SCP
    
    // ─── EXISTING SETTINGS (for reference) ─────────────
    playerSpeed: 0.12,
    gravity: -22.0,
    jumpForce: 1.05,
    raycastHeightOffset: 0.30,
    stepLimit: 0.22,
    playerHeight: 0.07,
    ambientLightIntensity: 0.12,
};
```

---

## 12. File Locations Reference

| Feature | File | Line | Function/Variable |
|---------|------|------|-------------------|
| Fog density config | `game.js` | 28 | `CONFIG.fogDensity` |
| Fog scene setup | `game.js` | 160 | `scene.fog = new THREE.FogExp2(...)` |
| Day/night toggle | `game.js` | 452 | `keydown` handler for 'c' |
| Day mode fog | `game.js` | 1765-1766 | `updateTimeOfDay()` |
| Night mode fog | `game.js` | 1788-1789 | `updateTimeOfDay()` |
| Minimap fog disable | `game.js` | 1534 | `updateMinimap()` |
| Minimap fog restore | `game.js` | 1550 | `updateMinimap()` |
| Panic fog color | `game.js` | Add in `animate()` | After vignette code |
| SCP fog density | `game.js` | Add after eyes | `updateScpFogDensity()` |
| Smooth fog transition | `game.js` | Add after init | `updateFogTransition()` |
| Vignette CSS | `style.css` | 310-320 | `.vignette` |
| Panic vignette CSS | `style.css` | 454-462 | `.vignette.panic` |
| Firefly fog:false | `game.js` | 611 | `spawnAmbientParticles()` |
| View system fog | `view_system.js` | 216 | `scene.fog = new THREE.FogExp2(0x000000, 4.5)` |
| Backup game fog | `backup_split_screen/game.js` | 57-58 | `scene.fog = new THREE.FogExp2(0xb0ddff, 0.010)` |

---

## Quick Start Checklist

- [ ] Set `fogDensity` in CONFIG (line 28) to desired value
- [ ] Set `fogColor` in scene setup (line 160) to desired hex
- [ ] Verify `updateTimeOfDay()` has both day/night fog values
- [ ] Verify minimap disables/restores fog properly
- [ ] Add `updateFogTransition()` for smooth day/night changes
- [ ] Add `updateScpFogDensity()` for SCP-fog interaction
- [ ] Add panic fog color change in `animate()`
- [ ] Verify firefly materials have `fog: false`
- [ ] Verify vignette CSS in `style.css`
- [ ] Test fog density at different CONFIG values
- [ ] Test day/night toggle (C key)
- [ ] Test fog response to SCP proximity

---

## Fog Density Quick Reference Chart

| CONFIG.fogDensity | Visibility (clear) | Feel |
|-------------------|-------------------|------|
| 0.5 | ~3m | Bright, non-horror |
| 1.0 | ~1.5m | Light mist |
| 2.0 | ~0.7m | Moderate fog |
| 4.5 | ~0.3m | Default horror (good) |
| 6.0 | ~0.2m | Dense fog |
| 8.0 | ~0.15m | Very dense |
| 10.0 | ~0.1m | Extreme, scary |
| 15.0 | ~0.07m | Almost zero visibility |
| 20.0 | ~0.05m | Pure darkness |
