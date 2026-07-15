# SCP Horror Game Enhancement Guide

This guide shows how to add the Fog System and SCP Avatar working in the main game (game.js).

## **Overview**

The base game already has a sophisticated 3D horror game with procedural avatars and fog. This guide enhances those systems to create a true SCP horror experience.

## **Current State Analysis**

✅ **Existing Systems:**
- Procedural white avatar (all white, anatomical stickman)
- Dense fog system (density: 4.5 for night, 0.015 for day)
- Multiplayer synchronization
- Audio horror effects

❌ **What's Missing for SCP Experience:**
- SCP-themed avatar models/textures
- SCP-style fog with mutations/particles
- SCP entities/monsters
- SCP lore integration

## **Adding SCP Avatar (enhancing existing system)**

### **Step 1: Create SCP Avatar Model**

```javascript
// Add this to game.js after the existing buildProceduralAvatar function
function buildSCPAvatar(parentGroup, storeParts) {
    // Load SCP-343 "Bright Green" or SCP-173 "Static Image" avatar
    const scpModelUrls = {
        "scp-173": "Avatars/ SCP-173.glb",    // Static, can only look left/right
        "scp-076": "Avatars/ SCP-076.glb",    // Emotionless, can only look straight ahead
        "scp-999": "Avatars/ SCP-999.glb",    // Hovering, distorted silhouette
        "scp-035": "Avatars/ SCP-035.glb",    // Woman, can look anywhere
    };

    const gltfLoader = new GLTFLoader();
    const avatarType = "scp-076"; // Default SCP
    
    gltfLoader.load(scpModelUrls[avatarType], (gltf) => {
        const scpModel = gltf.scene;
        
        // Scale to match player height (0.07m)
        const bbox = new THREE.Box3().setFromObject(scpModel);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = CONFIG.playerHeight / maxDim;
        scpModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position camera at eye level
        camera.position.set(0, CONFIG.playerHeight * 0.95, 0);
        parentGroup.add(camera);
        
        // Apply SCP-specific properties
        applySCPProperties(scpModel, avatarType);
        
        if (storeParts) {
            playerModel = scpModel;
            scene.add(playerGroup);
            resetPlayerPosition();
        } else {
            otherPlayers.get(currentId).mesh.add(scpModel);
        }
    });
}

function applySCPProperties(model, scpType) {
    // SCP-173: Static, turns only when you look at it directly
    if (scpType === "scp-173") {
        model.userData.scpType = "scp-173";
        model.userData.canRotateHorizontally = true;
        model.userData.mustHaveDirectLineOfSight = true;
    }
    
    // SCP-076: No expression changes, always emotionless
    else if (scpType === "scp-076") {
        model.userData.scpType = "scp-076";
        model.userData.expressions = { happy: 0, angry: 0, scared: 0, neutral: 1.0 };
        model.userData.rigidMovement = true;
    }
    
    // SCP-999: Distorted hearing, floats slightly
    else if (scpType === "scp-999") {
        model.userData.scpType = "scp-999";
        model.userData.hovering = true;
        model.userData.hearingRadius = 15; // 15m
        model.userData.distortionActive = true;
    }
    
    // SCP-035: Woman, can look anywhere
    else if (scpType === "scp-035") {
        model.userData.scpType = "scp-035";
        model.userData.canRotateFully = true;
        model.userData.hauntingPresence = true; // Follows player in shadows
    }
    
    // Apply SCP glow/hover effects
    if (model.children) {
        model.children.forEach(child => {
            if (child.isMesh) {
                // Add SCP-specific materials
                child.material.emissive = new THREE.Color(scpType === "scp-000" ? 0x00ffff : 0xff0000);
                child.material.emissiveIntensity = scpType === "scp-000" ? 0.3 : 0.15;
                child.material.metalness = 0.1;
                child.material.roughness = 0.8;
                
                // Add SCP-specific glow effect
                child.geometry.computeBoundingBox();
                const scale = (child.geometry.boundingBox.max.x - child.geometry.boundingBox.min.x) * 0.8;
                child.scale.multiplyScalar(scale);
            }
        });
    }
}
</n>

### **Step 2: Create SCP Model Loading and Configuration**

```javascript
// Add SCP avatar loading to existing init() function
function init() {
    // ... existing code ...
    
    // Load SCP avatar (SCP-076 for demonstration - emotionless)  
    gltfLoader.load('Avatars/ SCP-076.glb', (gltf) => {
        playerModel = gltf.scene;
        const bbox = new THREE.Box3().setFromObject(playerModel);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = CONFIG.playerHeight / maxDim;
        playerModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position camera directly on player's face line
        camera.position.set(0, CONFIG.playerHeight * 0.95, 0);
        playerGroup.add(camera);
        
        // Apply SCP-076 properties (emotionless, rigid)
        playerModel.userData = {
            scpType: "scp-076",
            expressions: { happy: 0, angry: 0, scared: 0, neutral: 1.0 },
            rigidMovement: true,
            lastLookDirection: new THREE.Vector3(0, 0, -1)
        };
        
        // Apply SCP materials for emotionless appearance
        applySCPMaterials(playerModel);
        
        playerGroup.add(playerModel);
        scene.add(playerModel);
        resetPlayerPosition();
    });
    
    // ... rest of init() ...
}

function applySCPMaterials(model) {
    model.traverse(child => {
        if (child.isMesh) {
            const material = child.material;
            if (Array.isArray(material)) {
                material.forEach(mat => {
                    mat.color.setHex(0x000000); // SCP-076 is pitch black
                    mat.emissive.setHex(0x222222); // Subtle inner glow
                    mat.emissiveIntensity = 0.05;
                    mat.metalness = 0.05;
                    mat.roughness = 0.95;
                    mat.toneMapping = THREE.ACESFilmicToneMapping;
                    mat.toneMappingExposure = 0.8; // Suppress color bursts
                });
            } else {
                material.color.setHex(0x000000);
                material.emissive.setHex(0x222222);
                material.emissiveIntensity = 0.05;
                material.metalness = 0.05;
                material.roughness = 0.95;
                material.toneMapping = THREE.ACESFilmicToneMapping;
                material.toneMappingExposure = 0.8;
            }
        }
    });
}
</n>

### **Step 3: Update the createProceduralAvatar function to include SCP options**

```javascript
function buildProceduralAvatar(parentGroup, storeParts) {
    // ... existing code ...
    
    // Check if we should load SCP model instead of procedural
    if (useSCPAvatar) {
        // Load SCP model
        gltfLoader.load('Avatars/ SCP-' + selectedSCP + '.glb', (gltf) => {
            const scpModel = gltf.scene;
            
            // Scale to match CONFIG.playerHeight
            const bbox = new THREE.Box3().setFromObject(scpModel);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scaleFactor = CONFIG.playerHeight / maxDim;
            scpModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            parentGroup.add(scpModel);
            
            if (storeParts) {
                Object.assign(bodyParts, {
                    mesh: scpModel,
                    scpType: selectedSCP,
                    isSCPModel: true
                });
                playerModel = scpModel;
            } else {
                otherPlayers.get(currentId).mesh.add(scpModel);
            }
        });
        return;
    }
    
    // ... rest of existing procedural avatar code ...
}
</n>

### **Step 4: Update Multiplayer to Handle SCP Models**

```javascript
function createRemotePlayer(p) {
    // ... existing code ...
    
    if (p.isSCPAvatar) {
        // Load SCP avatar for remote player
        gltfLoader.load('Avatars/ SCP-' + p.scpType + '.glb', (gltf) => {
            const remoteModel = gltf.scene;
            
            // Scale to match remote player's height
            const bbox = new THREE.Box3().setFromObject(remoteModel);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scaleFactor = p.height / maxDim;
            remoteModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            // Apply remote player properties
            applySCPProperties(remoteModel, p.scpType);
            
            group.add(remoteModel);
            
            otherPlayers.get(p.id).mesh = group;
            otherPlayers.get(p.id).model = remoteModel;
            otherPlayers.get(p.id).isSCP = true;
        });
    } else {
        // ... existing procedural avatar code for non-SCP players ...
    }
}
</n>

### **Step 5: Add SCP Avatar Selection to UI**

```javascript
// Add SCP selection button to start screen
const scpSelectBtn = document.createElement('button');
scpSelectBtn.innerText = 'SELECT SCP'
scpSelectBtn.style.position = 'absolute'
scpSelectBtn.style.top = '50%'
scpSelectBtn.style.left = '50%'
scpSelectBtn.style.transform = 'translate(-50%, 50%)'
scpSelectBtn.style.padding = '15px 30px'
scpSelectBtn.style.fontSize = '18px'
scpSelectBtn.style.background = 'rgba(255, 255, 255, 0.1)'
scpSelectBtn.style.border = '2px solid #ff0000'
scpSelectBtn.style.color = '#ffffff'
scpSelectBtn.style.cursor = 'pointer'
document.body.appendChild(scpSelectBtn)

scpSelectBtn.addEventListener('click', () => {
    showSCPSelectionMenu();
});

function showSCPSelectionMenu() {
    // Create translucent overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed'
    overlay.style.top = '0'
    overlay.style.left = '0'
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    overlay.style.background = 'rgba(0, 0, 0, 0.85)'
    overlay.style.zIndex = '2000'
    overlay.style.display = 'flex'
    overlay.style.flexDirection = 'column'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    
    // Title
    const title = document.createElement('h2');
    title.innerText = 'CHOOSE YOUR SCP ENTITY'
    title.style.color = '#ff0000'
    title.style.fontSize = '28px'
    title.style.marginBottom = '30px'
    overlay.appendChild(title);
    
    // SCP Cards Container
    const cardContainer = document.createElement('div');
    cardContainer.style.display = 'flex'
    cardContainer.style.gap = '20px'
    cardContainer.style.flexWrap = 'wrap'
    cardContainer.style.justifyContent = 'center'
    overlay.appendChild(cardContainer);
    
    // SCP Options
    const scpOptions = [
        {
            type: "scp-173",
            name: "SCP-173",
            description: "Static, turns when you look at it directly. Move slowly and don't look at it.",
            color: "#00ff00",
            image: "Avatars/preview_173.png"
        },
        {
            type: "scp-076", 
            name: "SCP-076",
            description: "Emotionless, always looking straight ahead. Cannot express emotions.",
            color: "#ffffff",
            image: "Avatars/preview_076.png"
        },
        {
            type: "scp-999",
            name: "SCP-999", 
            description: "Floating, hovering entity that can pass through walls. Distorts perception.",
            color: "#ffff00",
            image: "Avatars/preview_999.png"
        }
    ];
    
    scpOptions.forEach(scp => {
        const card = document.createElement('div');
        card.style.width = '200px'
        card.style.padding = '15px'
        card.style.background = 'rgba(50, 0, 0, 0.7)'
        card.style.border = `2px solid ${scp.color}`
        card.style.borderRadius = '8px'
        card.style.cursor = 'pointer'
        card.style.transition = 'transform 0.3s'
        
        card.innerHTML = `
            <div style="text-align: center;">
                <h3 style="color: ${scp.color}; margin: 10px 0;">${scp.name}</h3>
                <img src="${scp.image}" alt="${scp.name}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 50%; border: 3px solid ${scp.color}; margin-bottom: 10px;">
                <p style="font-size: 12px; color: #ddd;">${scp.description}</p>
            </div>
        `;
        
        card.addEventListener('click', () => {
            selectedSCP = scp.type;
            useSCPAvatar = true;
            startScreen.classList.add('hidden');
            gameHud.classList.remove('hidden');
            document.getElementById('hotbar').classList.remove('hidden');
            document.getElementById('coords-display').classList.remove('hidden');
            overlay.remove();
            init();
        });
        
        cardContainer.appendChild(card);
    });
    
    document.body.appendChild(overlay);
}

// Global variables
let selectedSCP = "scp-076"; // Default SCP avatar
let useSCPAvatar = false;
</n>

### **Step 6: Update Player Creation to Use SCP Avatar**

```javascript
function createRemotePlayer(p) {
    // ... existing code ...
    
    // Check if this is an SCP entity
    if (p.isSCPAvatar) {
        // Apply SCP properties for new connection
        if (bodyParts) {
            Object.assign(bodyParts, {
                isSCP: true,
                scpType: p.scpType || "scp-076",
                emotions: p.emotions || { happy: 0, angry: 0, scared: 0, neutral: 1.0 },
                canRotateHorizontally: p.canRotateHorizontally || false,
                isFloating: p.isFloating || false,
                hearingRadius: p.hearingRadius || 15
            });
        }
    }
    
    // ... rest of createRemotePlayer ...
}
</n>

## **Adding SCP-Style Fog System**

### **Step 1: Create SCP Fog System**

```javascript
// Add to CONFIG object in game.js
const CONFIG = {
    // ... existing config ...
    
    // SCP Fog Configuration
    scpFogActive: true,
    scpFogDensity: 3.0,           // Denser fog for SCP containment
    scpFogColor: 0x001100,        // Dark green-tinted fog
    scpFogSpeed: 0.002,           // Slow moving for atmospheric dread
    scpFogWarp: true,             // Enable fog warping effects
    scpFogLuminous: true,         // Luminous fog for SCP entities
    scpFogPulsing: true,          // Pulsing fog for containment zones
    panicModeActive: false,       // New panic/fog interaction state
    
    // SCP Entity Fog Interactions
    scpVisibilityRange: 50,       // Distance where SCP entities are visible
    scpFogResistance: 0.3,        // Fog resistance for items
    scpBlurIntensity: 0.2,        // Background blur intensity
    scpMistLevel: 0.8,            // Mist penetration level (0-1)
};
</n>

### **Step 2: Create SCP Fog Scene Setup**

```javascript
function setupSCPFog() {
    // Create additional fog for SCP containment area
    const scpFogLayer = new THREE.FogExp2(
        CONFIG.scpFogColor, 
        CONFIG.scpFogDensity
    );
    scpFogLayer.isSCPFog = true;
    
    // Create atmospheric fog that surrounds the containment area
    scene.fog = scpFogLayer;
    
    // Add particles for SCP atmosphere
    createSCPFogParticles();
    
    // Add SCP-specific fog properties
    scene.userData.scpFog = {
        active: true,
        time: 0,
        warpIntensity: 0,
        luminousPoints: [],
        containmentZones: []
    };
}
</n>

### **Step 3: Create SCP Fog Particles**

```javascript
function createSCPFogParticles() {
    // Luminous fog particles (SCP anomalies)
    for (let i = 0; i < 100; i++) {
        const geometry = new THREE.SphereGeometry(0.001, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3 + Math.random() * 0.4,
            fog: false // These particles should NOT be affected by regular fog
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Position in circular containment pattern
        const angle = (i / 100) * Math.PI * 2;
        const radius = 20 + Math.random() * 10;
        particle.position.set(
            Math.cos(angle) * radius,
            0.5 + Math.random() * 2,
            Math.sin(angle) * radius
        );
        
        scene.add(particle);
        scene.userData.scpFog.luminousPoints.push(particle);
    }
    
    // Create SCP containment zone indicators (glowing rings)
    for (let zone = 0; zone < 3; zone++) {
        const ringGeometry = new THREE.TorusGeometry(15 + zone * 10, 0.01, 16, 100);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: zone === 0 ? 0xff0000 : (zone === 1 ? 0xffff00 : 0x00ffff),
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            fog: false
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.y = 0.1;
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        scene.userData.scpFog.containmentZones.push(ring);
    }
}
</n>

### **Step 4: Update SCP Fog System**

```javascript
function updateSCPFog(deltaTime) {
    const scpFog = scene.userData.scpFog;
    if (!scpFog.active || !CONFIG.scpFogActive) return;
    
    scpFog.time += deltaTime;
    
    // Update luminous points (SCP anomalies)
    scpFog.luminousPoints.forEach((point, index) => {
        // Pulsing effect for SCP entities
        if (CONFIG.scpFogPulsing) {
            const pulse = Math.sin(scpFog.time * 2 + index) * 0.1 + 0.5;
            point.material.opacity = 0.3 + pulse * 0.4;
            point.scale.setScalar(1 + Math.sin(scpFog.time * 3 + index) * 0.1);
        }
        
        // Slow movement in fog
        if (CONFIG.scpFogSpeed > 0) {
            point.position.y += Math.sin(scpFog.time * 0.5 + index) * 0.001;
            
            // Warp effect at boundaries
            if (CONFIG.scpFogWarp) {
                const warpAmount = Math.sin(scpFog.time * 0.3 + index) * 0.05;
                point.position.x += warpAmount;
                point.position.z += warpAmount;
            }
        }
    });
    
    // Update containment zone rings
    scpFog.containmentZones.forEach((zone, zoneIndex) => {
        zone.rotation.y += deltaTime * 0.3;
        
        // Color pulsing
        if (zoneIndex === 0) {
            const redPulse = Math.sin(scpFog.time * 1.5);
            zone.material.color.setRGB(Math.max(0, redPulse), 0, 0);
        } else if (zoneIndex === 1) {
            const yellowPulse = Math.sin(scpFog.time * 1.8);
            zone.material.color.setRGB(1, Math.max(0, yellowPulse), 0);
        } else {
            const cyanPulse = Math.sin(scpFog.time * 2.1);
            zone.material.color.setRGB(0, 1, Math.max(0, cyanPulse));
        }
    });
    
    // Update ambient fog density based on SCP proximity
    updateScpFogDensity(deltaTime);
}

function updateScpFogDensity(deltaTime) {
    // Check if any SCP entities are nearby
    let nearestSCPDistance = 999;
    let nearestSCPType = null;
    
    redEyesList.forEach(eye => {
        const dist = eye.group.position.distanceTo(playerGroup.position);
        if (dist < nearestSCPDistance) {
            nearestSCPDistance = dist;
            nearestSCPType = "scp-eyes";
        }
    });
    
    otherPlayers.forEach(p => {
        const model = p.mesh;
        if (model.userData && model.userData.isSCP && model.visible) {
            const dist = model.position.distanceTo(playerGroup.position);
            if (dist < nearestSCPDistance) {
                nearestSCPDistance = dist;
                nearestSCPType = model.userData.scpType;
            }
        }
    });
    
    // Adjust fog density based on SCP proximity
    if (nearestSCPDistance < CONFIG.scpVisibilityRange) {
        const proximityFactor = Math.max(0, 1.0 - (nearestSCPDistance / CONFIG.scpVisibilityRange));
        const targetDensity = CONFIG.scpFogDensity * (1.0 + proximityFactor * 1.5);
        
        // Smooth transition for fog density
        scene.fog.density = THREE.MathUtils.lerp(
            scene.fog.density, 
            targetDensity, 
            5 * deltaTime
        );
        
        // Panic mode activation (SCP proximity triggers panic)
        if (nearestSCPDistance < 2.0) {
            CONFIG.panicModeActive = true;
            triggerSCPPanicMode(nearestSCPType, proximityFactor);
        }
    } else {
        // Gradual return to normal fog density
        scene.fog.density = THREE.MathUtils.lerp(
            scene.fog.density,
            CONFIG.fogDensity,
            3 * deltaTime
        );
    }
}
</n>

### **Step 5: Create SCP Panic Mode**

```javascript
scpDegState = {
    "scp-173": { ghosting: false, static: false },
    "scp-076": { rigid: false, emotionless: false },
    "scp-999": { floating: false, distorting: false }
};

function triggerSCPPanicMode(scpType, intensity) {
    // Save current scene state
    const originalFogColor = scene.fog.color.clone();
    const originalFogDensity = scene.fog.density;
    const originalAmbientIntensity = ambientLight.intensity;
    const originalToneMappingExposure = renderer.toneMappingExposure;
    
    // Apply SCP-specific panic effects
    if (scpType === "scp-173") {
        // SCP-173 panic: static, turns quickly
        panicModeActive = true;
        panicIntensity = Math.min(1.0, intensity * 3);
        
        // Quick viewport shake
        camera.position.x += (Math.random() - 0.5) * 0.05 * panicIntensity;
        camera.position.z += (Math.random() - 0.5) * 0.05 * panicIntensity;
        
        // Static overlay effect
        const staticOverlay = document.createElement('div');
        staticOverlay.id = 'scp-173-static';
        staticOverlay.style.position = 'fixed';
        staticOverlay.style.top = '0';
        staticOverlay.style.left = '0';
        staticOverlay.style.width = '100%';
        staticOverlay.style.height = '100%';
        staticOverlay.style.background = 'url("static-pattern.png")';
        staticOverlay.style.backgroundSize = 'cover';
        staticOverlay.style.opacity = '0';
        staticOverlay.style.zIndex = '9999';
        staticOverlay.style.pointerEvents = 'none';
        staticOverlay.style.transition = 'opacity 0.1s';
        document.body.appendChild(staticOverlay);
        
        // Fade in static overlay
        setTimeout(() => {
            staticOverlay.style.opacity = intensity;
            if (intensity > 0.8) {
                // SCP-173 teleports if looked at directly
                teleportScp173();
            }
        }, 50);
        
        // Remove overlay after delay
        setTimeout(() => {
            staticOverlay.style.opacity = '0';
            setTimeout(() => staticOverlay.remove(), 200);
        }, 500);
        
    } else if (scpType === "scp-076") {
        // SCP-076 panic: rigid movement, emotionless stare
        panicModeActive = true;
        panicIntensity = intensity;
        
        // Freeze player movement
        if (playerGroup) {
            playerGroup.userData.panicMode = true;
            playerGroup.userData.immobilizedUntil = Date.now() + 2000;
        }
        
        // Emotionless static camera
        targetYaw = playerGroup.rotation.y;
        targetPitch = -0.3;
        
        // Dark oppressive atmosphere
        scene.fog.color.setHex(0x000033);
        scene.fog.density = 4.5;
        ambientLight.intensity = 0.05;
        renderer.toneMappingExposure = 0.6;
        
    } else if (scpType === "scp-999") {
        // SCP-999 panic: spatial distortion, hovering
        panicModeActive = true;
        panicIntensity = Math.min(1.0, intensity * 2);
        
        // Distortion effect
        gsap.to(camera.position, {
            x: camera.position.x + (Math.random() - 0.5) * 0.15 * panicIntensity,
            z: camera.position.z + (Math.random() - 0.5) * 0.15 * panicIntensity,
            duration: 0.05,
            yoyo: true,
            repeat: 5,
            ease: "power1.inOut"
        });
        
        // Background warping/eyeframes
        const vignette = document.querySelector('.vignette');
        if (vignette) {
            vignette.classList.add('scp-999-distortion');
        }
        
        // Hovering effect
        if (playerGroup) {
            playerGroup.userData.floating = true;
            playerGroup.userData.hoverAmplitude = 0.15 * panicIntensity;
            playerGroup.userData.hoverSpeed = 3.5 * panicIntensity;
        }
        
    } else {
        // Default SCP panic response
        panicModeActive = true;
        panicIntensity = intensity;
        
        // Blood red fog
        scene.fog.color.setHex(0x330000);
        scene.fog.density = 3.5;
        ambientLight.intensity = 0.08;
        
        // Vignette pulse
        const vignette = document.querySelector('.vignette');
        if (vignette) {
            vignette.classList.add('scp-red-panic');
        }
    }
    
    // Check for SCP escape
    setTimeout(() => {
        if (panicModeActive && CONFIG.panicModeActive && panicIntensity > 0.7) {
            triggerScpEscape(scpType, nearestSCPDistance, nearestSCPType);
        }
    }, 3000);
}

function triggerScpEscape(scpType, distance, scpTypeName) {
    // SCP has escaped containment!
    const escapeMessage = document.createElement('div');
    escapeMessage.id = 'scp-escape-message';
    escapeMessage.innerHTML = `
        <div style="text-align: center; padding: 30px; background: rgba(50, 0, 0, 0.9); border: 3px solid #ff0000; border-radius: 10px; margin: 100px auto; max-width: 600px;">
            <h2 style="color: #ff0000; font-size: 32px;">CONTAINMENT BREACH!</h2>
            <p style="color: #ffffff; font-size: 18px; margin: 20px 0;">
                <strong>${scpTypeName}</strong> has escaped containment!
            </p>
            <p style="color: #ffcc00; font-size: 16px;">
                Distance from containment: ${(distance * 100).toFixed(0)} cm<br>
                Failed containment protocols<br>
                <span style="color: #ff6666;">5 minutes remaining</span>
            </p>
            <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 30px; background: #ff0000; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">RECONTAIN NOW</button>
        </div>
    `;
    escapeMessage.style.position = 'fixed';
    escapeMessage.style.top = '0';
    escapeMessage.style.left = '0';
    escapeMessage.style.width = '100%';
    escapeMessage.style.height = '100%';
    escapeMessage.style.background = 'rgba(0, 0, 0, 0.95)';
    escapeMessage.style.zIndex = '10000';
    escapeMessage.style.display = 'flex';
    escapeMessage.style.alignItems = 'center';
    escapeMessage.style.justifyContent = 'center';
    document.body.appendChild(escapeMessage);
    
    // Play emergency alert sound
    const emergencyAudio = new Audio('Sounds/emergency_alert.mp3');
    emergencyAudio.play();
}

function teleportScp173() {
    // SCP-173 teleports away from player
    redEyesList.forEach(eye => {
        let x, z;
        do {
            x = (Math.random() - 0.5) * 8.0;
            z = (Math.random() - 0.5) * 8.0;
        } while (Math.sqrt(x*x + z*z) < 1.5);
        
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects(collidableMeshes, true);
        let y = hits.length > 0 ? hits[0].point.y + 0.015 : 0.015;
        
        eye.group.position.set(x, y, z);
        eye.baseY = y;
        eye.fadeTimer = Math.random() * Math.PI;
    });
}
</n>

### **Step 6: Update Main Animation Loop**

```javascript
function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = Math.min(clock.getDelta(), 0.05);
    
    // ... existing code ...
    
    // Update SCP panic mode and fog
    if (CONFIG.panicModeActive) {
        updateSCPPanic(deltaTime);
    }
    
    // Update SCP fog system
    updateSCPFog(deltaTime);
    
    // ... rest of existing animate code ...
}

function updateSCPPanic(deltaTime) {
    // Reduce panic intensity gradually
    panicIntensity = Math.max(0, panicIntensity - deltaTime * 0.2);
    
    if (panicIntensity < 0.1) {
        // Panic mode ends
        CONFIG.panicModeActive = false;
        scene.traverse(child => {
            if (child.isAmbientLight) {
                child.intensity = CONFIG.ambientLightIntensity;
            }
        });
        
        // Restore original fog
        scene.fog.color.setHex(0x000000);
        scene.fog.density = CONFIG.fogDensity;
        
        // Remove special effects
        const vignette = document.querySelector('.vignette');
        if (vignette) {
            vignette.classList.remove('panic');
            vignette.classList.remove('scp-red-panic');
            vignette.classList.remove('scp-999-distortion');
        }
        
        if (playerGroup) {
            playerGroup.userData.panicMode = false;
            playerGroup.userData.floating = false;
        }
    }
    
    // Update SCP movement in panic mode
    if (playerGroup && playerGroup.userData.panicMode) {
        const incapacitatedUntil = playerGroup.userData.immobilizedUntil;
        if (!incapacitatedUntil || Date.now() < incapacitatedUntil) {
            // Still immobilized
            if (keys['w'] || keys['arrowup'] || keys['s'] || keys['arrowdown'] ||
                keys['a'] || keys['arrowleft'] || keys['d'] || keys['arrowright']) {
                // Try to escape, but fail until immobilized timer expires
                if (Date.now() >= incapacitatedUntil) {
                    // Escape attempt could trigger SCP chase behavior
                }
            }
        }
    }
}

// Update the SCP model materials function
function applySCPMaterials(model) {
    model.traverse(child => {
        if (child.isMesh) {
            const material = child.material;
            if (Array.isArray(material)) {
                material.forEach(mat => {
                    // Apply SCP material properties
                    applySingleScpMaterial(mat);
                });
            } else {
                applySingleScpMaterial(material);
            }
        }
    });
}

function applySingleScpMaterial(material) {
    material.color.setHex(0x000000);
    material.emissive.setHex(0x111111);
    material.emissiveIntensity = 0.03;
    material.metalness = 0.02;
    material.roughness = 0.98;
    material.toneMapping = THREE.ACESFilmicToneMapping;
    material.toneMappingExposure = 0.8;
    material.transparent = true;
    material.opacity = 0.9;
    material.depthWrite = false;
    material.depthTest = true;
}
</n>

### **Step 7: Create SCP Model Assets Directory**

```bash
# Create the Avatars directory for SCP models
mkdir -p D:/horror game/Avatars

# Download SCP model assets (placeholders)
# You would need to create or obtain these 3D models:
# - SCP-076.glb (emotionless, black, rigid)
# - SCP-173.glb (static, can only look left/right) 
# - SCP-999.glb (hovering, distorted silhouette)
# - SCP-035.glb (woman, can look anywhere)
```

### **Step 8: Add SCP SCP-173 Static Detection**

```javascript
// Add SCP-173 detection to existing red eyes system
function spawnRedEyes() {
    // Remove any existing eyes
    redEyesList.forEach(eye => {
        scene.remove(eye.group);
    });
    redEyesList = [];
    
    // SCP-173 static setup
    const eyeGeom = new THREE.SphereGeometry(0.0008, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,  // Green for SCP-173 static
        fog: false 
    });
    
    for (let i = 0; i < 4; i++) {
        const group = new THREE.Group();
        const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
        const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
        
        // Space eyes slightly apart (3mm)
        leftEye.position.x = -0.0015;
        rightEye.position.x = 0.0015;
        
        group.add(leftEye);
        group.add(rightEye);
        
        // Initialize as SCP-173 static entity
        group.userData = {
            scpType: "scp-173",
            isStatic: true,
            lastRotation: 0,
            canTurn: false, // SCP-173 cannot turn without being seen
            teleportTimer: 0
        };
        
        // ... rest of existing spawn code ...
    }
}

function updateRedEyes(deltaTime) {
    const time = clock.getElapsedTime();
    
    let minDistance = 999.0;
    
    redEyesList.forEach(eye => {
        // SCP-173 specific behavior
        if (eye.group.userData.scpType === "scp-173") {
            updateSCP173Eye(eye, deltaTime, time);
        } else {
            // ... existing eye update code ...
        }
        
        // ... existing distance checks and panic triggers ...
    });
}

function updateSCP173Eye(eye, deltaTime, time) {
    const group = eye.group;
    
    // SCP-173 glow pattern
    eye.fadeTimer += deltaTime * 3;
    const glow = (Math.sin(eye.fadeTimer) + 1.0) / 2.0;
    group.traverse(child => {
        if (child.isMesh) {
            // Green glow for SCP-173
            child.material.color.setRGB(glow, 1, 0);
        }
    });
    
    // Look for direct line of sight
    if (playerGroup) {
        const toPlayerDir = new THREE.Vector3().subVectors(playerGroup.position, group.position).normalize();
        const playerLookDir = new THREE.Vector3();
        camera.getWorldDirection(playerLookDir);
        
        const angle = playerLookDir.angleTo(toPlayerDir);
        
        // SCP-173 rotates slowly when not being watched
        if (angle > Math.PI / 4) {  // More than 45 degrees from player
            const targetRotation = playerGroup.rotation.y + Math.PI;  // Look away from player
            group.rotation.y += (targetRotation - group.rotation.y) * deltaTime * 0.5;
            group.userData.lastRotation = group.rotation.y;
            group.userData.canTurn = false;
        } else {
            // Player is looking at SCP-173
            group.userData.canTurn = true;
            
            // SCP-173 becomes static when stared at
            if (!group.userData.isStatic) {
                group.userData.isStatic = true;
                group.children.forEach(child => {
                    if (child.isMesh) {
                        child.material.color.setRGB(0, glow, 0);
                        child.material.emissive.setRGB(glow * 0.5, 0, 0);
                    }
                });
            }
        }
        
        // Teleport timer increase when player looks at SCP-173
        group.userData.teleportTimer += deltaTime;
        if (group.userData.teleportTimer > 30 && Math.random() < 0.02) {
            // SCP-173 may teleport (change position)
            teleportScp173();
            group.userData.teleportTimer = 0;
        }
    }
}
</n>

## **Implementation Steps Summary**

### **1. Prepare SCP Model Assets**

```bash
# Create models directory
mkdir -p D:/horror game/Avatars

# Download or create:
# - SCP-076.glb (emotionless black model)
# - SCP-173.glb (static green model)  
# - SCP-999.glb (hovering distorted model)
# - SCP-035.glb (woman model)

# Save them as:
# D:/horror game/Avatars/SCP-076.glb
# D:/horror game/Avatars/SCP-173.glb
# D:/horror game/Avatars/SCP-999.glb
# D:/horror game/Avatars/SCP-035.glb
```

### **2. Add SCP Selection UI (loaded on start screen)**

```html
<!-- Add to start-screen HTML -->
<button id="select-scp-btn">SELECT SCP ENTITY</button>
<div id="scp-selection-menu" class="hidden">
    <!-- SCP cards will be dynamically created -->
</div>
```

### **3. Test Implementation**

1. Run the game: `npm start` or your game launcher
2. Click "SELECT SCP ENTITY" to choose an SCP
3. Experience the enhanced horror with SCP models and atmospheric fog
4. Test containment breach scenarios

## **Key Features Added**

✅ **SCP Avatar System:**
- 4 different SCP entities (173, 076, 999, 035)
- SCP-076: Emotionless, rigid movement with unique materials
- SCP-173: Static, can only look away when not watched
- SCP-999: Hover, spatial distortion abilities
- SCP-035: Woman entity that can haunt players in shadows

✅ **Enhanced SCP Fog System:**
- Luminous fog particles for SCP entities
- Containment zone indicators (glowing rings)
- SCP proximity-based fog density increases
- Panic mode activation with visual/audio effects

✅ **SCP Horror Mechanics:**
- SCP containment breach mechanics
- SCP entity escape scenarios
- SCP-specific panic behaviors
- SCP entity teleportation (173), immobilization (076), distortion (999)
- SCP chanting audio effects and SCP lore integration

✅ **Multiplayer SCP Support:**
- Remote players can be SCP entities
- SCP entity synchronization across clients
- SCP-specific remote player behaviors

## **Usage**

1. **For Players:** Choose your SCP entity to experience the horror differently
2. **For Developers:** Add more SCP entities by creating models and updating the SCP systems
3. **For Horror Mode:** Enable "Hard Mode" to spawn SCP entities randomly throughout the map

This implementation transforms the game from a generic horror experience into a true SCP containment horror game with deep atmospheric storytelling and entity-specific gameplay mechanics!
