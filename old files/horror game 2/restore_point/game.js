import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as QUARKS from 'three.quarks';

// Global error logger to display runtime exceptions directly on the screen
window.onerror = function(message, source, lineno, colno, error) {
    const errDiv = document.getElementById('debug-error');
    if (errDiv) {
        errDiv.style.display = 'block';
        errDiv.innerText = `JS ERROR DETECTED:\n${message}\nFile: ${source ? source.split('/').pop() : 'unknown'}\nLine: ${lineno}:${colno}\nStack: ${error && error.stack ? error.stack.substring(0, 150) : 'none'}`;
    }
    console.error("Game error:", message, "at", source, ":", lineno, ":", colno, error);
    return false;
};

// --- Game Configurations & State ---
const CONFIG = {
    playerSpeed: 0.54,         // 3x Faster speed for competitive hide-and-seek gameplay
    gravity: -22.0,            // Heavy, snappy gravity (no moon-like floatiness)
    jumpForce: 1.05,           // Realistic jump height proportional to 7cm character scale
    raycastHeightOffset: 0.30, // Elevated to support high step climbs
    stepLimit: 0.22,           // Generous climb limit to walk up sloped leaves and grass smoothly
    playerHeight: 0.07,        // Scale player to 7cm
    fogDensity: 4.5,           // Balanced fog density for playable visible distance at night
    ambientLightIntensity: 0.12 // Playable midnight ambient level (can see outlines of grass)
};

let scene, camera, renderer, canvas, ambientLight;
let clock = new THREE.Clock();

// Game entities
let mapModel = null;
let playerModel = null;
let playerGroup = null; // Group holding the player mesh for easier rotation/positioning
let collidableMeshes = [];

// Smooth Mouse Look Rotation (Yaw & Pitch)
let yaw = 0, pitch = 0;
let targetYaw = 0, targetPitch = 0;

// Asset Loader
let gltfLoader = null;
let flashlightGLTF = null; // References the loaded 3D flashlight mesh

// Flashlight & Inventory state
let torchMesh = null;
let torchLight = null;
let torchTarget = null;
let selectedSlot = 1;
let flickerTimer = 0; // State timer for horror flashlight malfunctions
let panicIntensity = 0; // Horror tension factor when red eyes are near

// Creepy Red Eyes state
let redEyesList = [];

// Deterministic insect and firefly particles
let fireflies = [];
let bugSwarms = [];

// Campfire variables
let campfireModel = null;
let campfireLight = null;
let fireParticles = [];
let smokeParticles = [];
let campfireBaseY = 0;

// Map center coordinates (dynamic fallback for shifted Blender models)
let mapCenterX = 0;
let mapCenterZ = 0;

// Creative Mode debug toggles
let flyMode = false;
let dayMode = false;
let sunLight = null;

// Campfire locator aura beacon
// Quarks particle engine references
let quarksRenderer = null;
let quarksFireSystem = null;
let quarksSparksSystem = null;
let quarksSmokeSystem = null;

// Texture Anisotropy limit
let maxAnisotropy = 1;

// Minimap variables
let minimapRenderer = null;
let minimapCamera = null;
let minimapHudCanvas = null;
let minimapHudCtx = null;

// Movement state
let keys = {};
let verticalVelocity = 0;
let isGrounded = false;
let spawnPosition = new THREE.Vector3(0, 0.15, 0);

// Animation state
let mixer = null;
let mapMixer = null;
let animationsMap = {};
let currentAction = null;
let walkCycle = 0;

// UI Elements
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const loadingFile = document.getElementById('loading-file');
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const gameHud = document.getElementById('game-hud');
const resetButton = document.getElementById('reset-button');

// --- Initialization ---
function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pitch black night
    // Add Exp2 Fog for a dark horror night
    scene.fog = new THREE.FogExp2(0x000000, CONFIG.fogDensity); // Playable dark fog

    // 2. Camera Setup (First-Person View)
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.005, 100);

    // 3. Renderer Setup
    canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1; // Balanced exposure to prevent color blowout

    // Get max anisotropy supported (capped at 4 for high FPS performance)
    maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

    // 3b. Minimap Renderer & Camera Setup
    const minimapWebglCanvas = document.getElementById('minimap-webgl-canvas');
    if (minimapWebglCanvas) {
        // Orthographic camera covering 35cm viewSize centered on player
        minimapCamera = new THREE.OrthographicCamera(-0.175, 0.175, 0.175, -0.175, 0.01, 10);
        minimapCamera.position.set(0, 2.0, 0);
        minimapCamera.lookAt(0, 0, 0);

        minimapRenderer = new THREE.WebGLRenderer({ 
            canvas: minimapWebglCanvas, 
            antialias: true,
            alpha: false 
        });
        minimapRenderer.setSize(120, 120);
        minimapRenderer.shadowMap.enabled = true;
        minimapRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        minimapRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        minimapRenderer.toneMappingExposure = 1.1;
    }

    minimapHudCanvas = document.getElementById('minimap-hud-canvas');
    if (minimapHudCanvas) {
        minimapHudCtx = minimapHudCanvas.getContext('2d');
    }

    // 6. Loading Manager & Loaders Setup (Declared early to prevent ReferenceError)
    const loadingManager = new THREE.LoadingManager();
    
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        const progress = Math.round((itemsLoaded / itemsTotal) * 100);
        loadingBar.style.width = `${progress}%`;
        loadingText.innerText = `Loading: ${progress}%`;
        
        // Show file basename
        const filename = url.split('/').pop().split('?')[0];
        loadingFile.innerText = `Loading asset: ${filename}`;
    };

    loadingManager.onLoad = () => {
        console.log("All assets loaded successfully.");
        // Hide loading screen and show start screen
        loadingScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    };

    loadingManager.onError = (url) => {
        console.error('Error loading asset:', url);
        loadingFile.innerText = `Error loading: ${url.split('/').pop()}`;
    };

    // 7. Load Textures
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const groundDiff = textureLoader.load('forest_ground_texture/textures/forest_ground_04_diff_1k.jpg');
    const groundNor = textureLoader.load('forest_ground_texture/textures/forest_ground_04_nor_gl_1k.jpg');
    const groundRough = textureLoader.load('forest_ground_texture/textures/forest_ground_04_rough_1k.jpg');
    const groundAO = textureLoader.load('forest_ground_texture/textures/forest_ground_04_ao_1k.jpg');

    [groundDiff, groundNor, groundRough, groundAO].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(16, 16); // Tile 16x16 times for sharp close-up resolution
        tex.anisotropy = maxAnisotropy; // Maximum texture resolution at angles
    });
    groundDiff.colorSpace = THREE.SRGBColorSpace;

    // 8. Load Assets
    gltfLoader = new GLTFLoader(loadingManager);

    // 5. Lighting
    // Faint slate-blue ambient light so outlines are visible in the dark
    ambientLight = new THREE.AmbientLight(0x0e0e14, CONFIG.ambientLightIntensity);
    scene.add(ambientLight);

    // Modern Flashlight Setup (SpotLight - soft warm light to preserve leaf/grass color)
    torchLight = new THREE.SpotLight(0xfff8ee, 1.0, 4.0, Math.PI / 5.0, 0.4, 1.5); 
    torchLight.castShadow = true;
    torchLight.shadow.mapSize.width = 1024; // Optimized for high FPS rendering
    torchLight.shadow.mapSize.height = 1024;
    torchLight.shadow.camera.near = 0.005;
    torchLight.shadow.camera.far = 4.0;
    torchLight.shadow.bias = -0.0005;
    camera.add(torchLight);

    // Spotlight target pointing tilted forward in camera space to match the flashlight handle orientation
    torchTarget = new THREE.Object3D();
    camera.add(torchTarget);
    torchLight.target = torchTarget;

    // Create and attach the sleek, dark slate-blue procedural flashlight
    createProceduralFlashlight();

    // Load Map
    gltfLoader.load('leaves_in_the_garden.glb', (gltf) => {
        mapModel = gltf.scene;
        collidableMeshes = [];
        const rootNode = mapModel.getObjectByName("RootNode");
        if (rootNode) {
            let childIdx = 0;
            rootNode.children.forEach((child) => {
                // Assign a unique persistent name based on children array index to handle duplicate names in GLTF
                child.name = child.name + "_" + childIdx;
                childIdx++;

                child.traverse((sub) => {
                    if (sub.isMesh) {
                        sub.castShadow = true;
                        sub.receiveShadow = true;
                        
                        // Fix alpha sorting / depth buffer overlap issues for leaves/grass
                        const fixMaterial = (mat) => {
                            if (mat.transparent) {
                                mat.depthWrite = true;
                                mat.alphaTest = 0.5; // Discard pixels below 0.5 alpha to write depth correctly
                                mat.needsUpdate = true;
                            }
                            mat.shadowSide = THREE.DoubleSide;
                            
                            // High-quality gloss and anisotropy updates for premium looks
                            mat.roughness = 0.55; 
                            mat.metalness = 0.05;
                            if (mat.map) mat.map.anisotropy = maxAnisotropy;
                            if (mat.normalMap) mat.normalMap.anisotropy = maxAnisotropy;
                        };
                        if (Array.isArray(sub.material)) {
                            sub.material.forEach(fixMaterial);
                        } else if (sub.material) {
                            fixMaterial(sub.material);
                        }
                    }
                });
                
                // Exclude grass and micro plants to prevent standing in the air
                const name = child.name.toLowerCase();
                const isGround = name.includes('ground');
                // Match all leaf meshes (contain 's_list' even if they have 'forest' prefixes)
                const isLeaf = name.includes('s_list') && !name.includes('plants');
                if (isGround || isLeaf) {
                    collidableMeshes.push(child);
                }

                // Apply forest ground texture to the ground mesh
                if (isGround) {
                    child.traverse((sub) => {
                        if (sub.isMesh) {
                            sub.material = new THREE.MeshStandardMaterial({
                                map: groundDiff,
                                normalMap: groundNor,
                                roughnessMap: groundRough,
                                aoMap: groundAO,
                                roughness: 0.9,
                                metalness: 0.05
                            });
                            sub.material.needsUpdate = true;
                        }
                    });
                }
            });
        }
        scene.add(mapModel);
        
        // Play map animations (like moving leaves/grass)
        if (gltf.animations && gltf.animations.length > 0) {
            mapMixer = new THREE.AnimationMixer(mapModel);
            gltf.animations.forEach((clip) => {
                mapMixer.clipAction(clip).play();
            });
            console.log("Map animations playing:", gltf.animations.length);
        }
        
        // Get center of map dynamically to handle shifted origins
        const mapBox = new THREE.Box3().setFromObject(mapModel);
        const mapCenter = new THREE.Vector3();
        mapBox.getCenter(mapCenter);
        mapCenterX = mapCenter.x;
        mapCenterZ = mapCenter.z;
        console.log("Dynamically detected map center:", mapCenterX, mapCenterZ);

        // Apply custom editor map overrides (positions, rotations, scales of leaves)
        applyMapOverrides(mapModel);

        // Find safe spawn point based on map center & bounds
        calculateSpawnPoint();
        resetPlayerPosition();
        
        // Snap campfire once map collisions are loaded
        snapCampfireToGround();
    });

    // Load Player Avatar
    gltfLoader.load('stick_man_generic_model.glb', (gltf) => {
        playerModel = gltf.scene;
        
        // Setup shadows for player
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.emissive = new THREE.Color(0x222222);
                }
            }
        });

        // Set up player group to rotate/translate cleanly
        playerGroup = new THREE.Group();
        playerGroup.add(playerModel);
        
        // Group the first-person camera directly on the head of the player group
        camera.position.set(0, CONFIG.playerHeight * 0.95, 0.005);
        // Face forward (180 degrees rotated so it faces positive Z direction)
        camera.rotation.set(0, Math.PI, 0); 
        playerGroup.add(camera);
        
        scene.add(playerGroup);

        // Scale player dynamically to configured height (CONFIG.playerHeight)
        const box = new THREE.Box3().setFromObject(playerModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log("Player original size:", size);

        // Adjust scale factor
        const scaleFactor = CONFIG.playerHeight / (size.y || 1);
        playerModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Center the local playerModel within the group
        const playerCenter = new THREE.Vector3();
        box.getCenter(playerCenter);
        playerModel.position.x = -playerCenter.x * scaleFactor;
        playerModel.position.y = -box.min.y * scaleFactor; // Align feet with group origin Y=0
        playerModel.userData.baseY = playerModel.position.y;
        playerModel.position.z = -playerCenter.z * scaleFactor;

        // Setup Animations
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(playerModel);
            console.log("Found animations:", gltf.animations.map(a => a.name));
            
            gltf.animations.forEach((clip) => {
                const name = clip.name.toLowerCase();
                const action = mixer.clipAction(clip);
                animationsMap[name] = action;
            });

            // Map animations by index as fallbacks
            for (let i = 0; i < gltf.animations.length; i++) {
                animationsMap[`anim_${i}`] = mixer.clipAction(gltf.animations[i]);
            }

            // Standardize Idle and Walk references
            const idleAction = animationsMap['idle'] || animationsMap['idle_action'] || animationsMap['anim_0'];
            const walkAction = animationsMap['walk'] || animationsMap['walk_action'] || animationsMap['run'] || animationsMap['anim_1'];

            if (walkAction) {
                walkAction.timeScale = 0.65; // Slow down step rate to match microscopic speed
            }

            if (idleAction) {
                currentAction = idleAction;
                currentAction.play();
            }
        }
        
        // Place player group at spawn
        resetPlayerPosition();
        spawnRedEyes();
    });

    // Load Campfire Model at map center
    gltfLoader.load('camp_fire.glb', (gltf) => {
        campfireModel = gltf.scene;
        
        // Scale campfire to fit micro scale (0.029m / 2.9cm - slightly larger than character)
        const box = new THREE.Box3().setFromObject(campfireModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scaleFactor = 0.029 / maxDim;
        campfireModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position at (-0.060, -0.020) clear of leaf canopy and dirt mounds
        const x = -0.060;
        const z = -0.020;
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
        const groundMeshes = collidableMeshes.filter(m => m.name.toLowerCase().includes('ground'));
        const hits = ray.intersectObjects(groundMeshes, true);
        let y = hits.length > 0 ? hits[0].point.y : 0.015;
        
        campfireModel.position.set(x, y + 0.025, z); // Lifted by 7.5mm so stones are fully visible
        scene.add(campfireModel);
        
        campfireModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        setupCampfireLight(x, y + 0.015, z);
        setupCampfireQuarksParticles(x, y + 0.002, z);
        
        // Apply custom editor campfire overrides (if moved in editor)
        applyCampfireOverrides();

        // Ensure snap is correct once all assets are loaded
        snapCampfireToGround();

        // Re-calculate spawn point and snap player beside the loaded campfire
        calculateSpawnPoint();
        if (playerGroup) {
            playerGroup.position.copy(spawnPosition);
            console.log("Teleported player beside campfire at:", playerGroup.position);
        }
    }, undefined, (error) => {
        console.error("Failed to load camp_fire.glb:", error);
    });

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => { 
        keys[e.key.toLowerCase()] = true; 
        
        // Slot Hotbar selection (1-9)
        if (e.key >= '1' && e.key <= '9') {
            selectSlot(parseInt(e.key));
        }

        // V key toggles fly mode
        if (e.key.toLowerCase() === 'v') {
            flyMode = !flyMode;
            console.log("Fly mode toggled:", flyMode);
            const flyStatus = document.getElementById('fly-status') || createFlyStatusUI();
            flyStatus.innerText = flyMode ? "FLY MODE ACTIVE [WASD + Space/Shift]" : "";
            // Clear velocities when toggling fly mode
            verticalVelocity = 0;
        }

        // C key toggles day mode
        if (e.key.toLowerCase() === 'c') {
            dayMode = !dayMode;
            updateTimeOfDay();
        }

        // Flashlight rotation debug controls (Press K/L/M to adjust live)
        if (flashlightGLTF) {
            if (e.key.toLowerCase() === 'k') {
                flashlightGLTF.rotation.x += 0.087; // +5 degrees
                printFlashlightRotation();
            }
            if (e.key.toLowerCase() === 'l') {
                flashlightGLTF.rotation.y += 0.087;
                printFlashlightRotation();
            }
            if (e.key.toLowerCase() === 'm') {
                flashlightGLTF.rotation.z += 0.087;
                printFlashlightRotation();
            }
        }
    });
    window.addEventListener('keyup', (e) => { 
        keys[e.key.toLowerCase()] = false; 
    });

    // Custom Pointer Lock Events for smooth looking without buttons held
    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const promise = canvas.requestPointerLock();
        if (promise && promise.catch) {
            promise.catch((err) => {
                console.warn("Pointer lock request blocked or deferred:", err);
            });
        }
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            startScreen.classList.add('hidden');
            gameHud.classList.remove('hidden');
            document.getElementById('hotbar').classList.remove('hidden');
            document.getElementById('coords-display').classList.remove('hidden');
            clock.getDelta(); // reset clock delta
        } else {
            startScreen.classList.remove('hidden');
            gameHud.classList.add('hidden');
            document.getElementById('hotbar').classList.add('hidden');
            document.getElementById('coords-display').classList.add('hidden');
            
            const title = startScreen.querySelector('.main-title');
            title.innerText = "Game Paused";
            const btn = startScreen.querySelector('#start-button');
            btn.innerText = "RESUME";
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas) {
            // Increased mouse looking sensitivity (0.0035) for snappy seeker/hider responses
            targetYaw -= e.movementX * 0.0035;
            targetPitch -= e.movementY * 0.0035;
            targetPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, targetPitch));
        }
    });

    resetButton.addEventListener('click', (e) => {
        e.stopPropagation();
        resetPlayerPosition();
    });

    // Auto-select Flashlight (slot 1) at start
    selectSlot(1);

    // Setup client-side deterministic ambient particles (fireflies, swarming bugs)
    spawnAmbientParticles();

    // Setup creepy spider cocoon egg sacs
    spawnSpookyCocoons();

    // Start rendering loop!
    animate();
}

// --- Spawn logic ---
function calculateSpawnPoint() {
    let targetX = -0.060;
    let targetZ = -0.020;
    if (campfireModel) {
        targetX = campfireModel.position.x;
        targetZ = campfireModel.position.z;
    }
    // Spawn right next to the campfire (0.016m / 1.6cm, very close!)
    spawnPosition.set(targetX + 0.016, 0.015, targetZ + 0.016);
    console.log("Calculated dynamic spawn position beside campfire:", spawnPosition);
}

// --- Ambient Deterministic Particle Simulation ---
// Simple seedable pseudo-random number generator (Mulberry32) for 100% synchronized layouts
function createDeterministicRandom(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function spawnAmbientParticles() {
    const random = createDeterministicRandom(8888); // Fixed seed for matching coords

    // 1. Fireflies Setup
    const fireflyCount = 60; // Increased count for density
    const fireflyGeom = new THREE.SphereGeometry(0.0015, 6, 6);
    const fireflyMat = new THREE.MeshBasicMaterial({
        color: 0xdfff80, // Bright glowing green-yellow firefly color
        transparent: true,
        opacity: 0.95,
        fog: false // Disable fog so they glow in the distance!
    });

    for (let i = 0; i < fireflyCount; i++) {
        const mesh = new THREE.Mesh(fireflyGeom, fireflyMat);
        scene.add(mesh);

        // Base coordinates in garden (concentrated around dynamic map center)
        const baseX = mapCenterX + (random() - 0.5) * 10.0;
        const baseY = 0.05 + random() * 0.8;
        const baseZ = mapCenterZ + (random() - 0.5) * 10.0;

        fireflies.push({
            mesh: mesh,
            baseX: baseX,
            baseY: baseY,
            baseZ: baseZ,
            freqX: 0.4 + random() * 0.6,
            freqY: 0.3 + random() * 0.5,
            freqZ: 0.4 + random() * 0.6,
            ampX: 0.3 + random() * 0.6,
            ampY: 0.15 + random() * 0.25,
            ampZ: 0.3 + random() * 0.6,
            phaseX: random() * Math.PI * 2,
            phaseY: random() * Math.PI * 2,
            phaseZ: random() * Math.PI * 2
        });
    }

    // 2. Swarming Bugs Setup (3 swarm groups shifted near player spawn (0,0) for visibility)
    const swarmCount = 3;
    const bugsPerSwarm = 20;
    const bugGeom = new THREE.SphereGeometry(0.0010, 4, 4); // Increased size to 1.0mm for visibility
    const bugMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const swarmCenters = [
        new THREE.Vector3(mapCenterX + 0.12, 0.04, mapCenterZ + 0.15),
        new THREE.Vector3(mapCenterX - 0.22, 0.05, mapCenterZ - 0.2),
        new THREE.Vector3(mapCenterX + 0.2, 0.06, mapCenterZ - 0.35)
    ];

    for (let s = 0; s < swarmCount; s++) {
        const center = swarmCenters[s];
        const bugs = [];

        for (let b = 0; b < bugsPerSwarm; b++) {
            const mesh = new THREE.Mesh(bugGeom, bugMat);
            scene.add(mesh);

            bugs.push({
                mesh: mesh,
                freqX: 1.8 + random() * 3.5,
                freqY: 2.2 + random() * 3.0,
                freqZ: 1.8 + random() * 3.5,
                ampX: 0.04 + random() * 0.12,
                ampY: 0.03 + random() * 0.08,
                ampZ: 0.04 + random() * 0.12,
                phaseX: random() * Math.PI * 2,
                phaseY: random() * Math.PI * 2,
                phaseZ: random() * Math.PI * 2
            });
        }

        bugSwarms.push({
            center: center,
            bugs: bugs
        });
    }
}

function updateAmbientParticles() {
    // Synchronize to absolute Date milliseconds so all hiders & seekers see identical coords
    const t = Date.now() / 1000;

    // 1. Update Fireflies
    fireflies.forEach(f => {
        f.mesh.position.x = f.baseX + Math.sin(t * f.freqX + f.phaseX) * f.ampX;
        f.mesh.position.y = f.baseY + Math.cos(t * f.freqY + f.phaseY) * f.ampY;
        f.mesh.position.z = f.baseZ + Math.sin(t * f.freqZ + f.phaseZ) * f.ampZ;
    });

    // 2. Update Swarming Bugs
    bugSwarms.forEach(s => {
        s.bugs.forEach(b => {
            b.mesh.position.x = s.center.x + Math.sin(t * b.freqX + b.phaseX) * b.ampX;
            b.mesh.position.y = s.center.y + Math.cos(t * b.freqY + b.phaseY) * b.ampY;
            b.mesh.position.z = s.center.z + Math.sin(t * b.freqZ + b.phaseZ) * b.ampZ;
        });
    });
}

function resetPlayerPosition() {
    if (playerGroup) {
        playerGroup.position.copy(spawnPosition);
        verticalVelocity = 0;
        isGrounded = true;
        
        // Reset look rotations to face directly at the campfire (diagonal look heading!)
        yaw = -3 * Math.PI / 4;
        pitch = -0.3; // look slightly downwards at the fire
        targetYaw = yaw;
        targetPitch = pitch;
        
        playerGroup.rotation.y = yaw; // Apply yaw directly to body
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitch, 0, 0); // Keep camera local yaw at 0 to fix inverted movement!
        
        selectSlot(1); // Select flashlight by default
    }
}

// --- Window resizing ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Crossfade Animations ---
function fadeToAction(nextAction, duration = 0.25) {
    if (nextAction && currentAction !== nextAction) {
        const prevAction = currentAction;
        currentAction = nextAction;
        
        currentAction.reset();
        currentAction.setEffectiveTimeScale(1);
        currentAction.setEffectiveWeight(1);
        currentAction.crossFadeFrom(prevAction, duration, true);
        currentAction.play();
    } else if (!currentAction && nextAction) {
        currentAction = nextAction;
        currentAction.play();
    }
}

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(clock.getDelta(), 0.05);

    // Update ambient deterministic insects and fireflies
    updateAmbientParticles();

    // Update campfire fire/smoke particles and light flickering
    updateCampfire(deltaTime);
    
    // Update quarks particle systems in animation loop
    if (quarksRenderer) {
        quarksRenderer.update(deltaTime);
    }

    // Only update movement if menu is closed (hud is active)
    if (!startScreen.classList.contains('hidden') && playerGroup && mapModel) {
        // Pause updates if menu is open
    } else if (playerGroup && mapModel) {
        updatePlayerMovement(deltaTime);
        updateCollisions(deltaTime);
        updateRedEyes(deltaTime); // Update glowing red eyes
    }

    // Update map animations (foliage wind swaying)
    if (mapMixer) {
        mapMixer.update(deltaTime);
    }

    // Reduced camera look lag (increased lerp from 8 to 24) for snappy competitive aiming
    yaw = THREE.MathUtils.lerp(yaw, targetYaw, 24 * deltaTime);
    pitch = THREE.MathUtils.lerp(pitch, targetPitch, 24 * deltaTime);

    // 1. Head Roll: Tilt camera roll (Z-axis) slightly when strafing A/D
    let targetRoll = 0;
    if (keys['a'] || keys['arrowleft']) targetRoll = 0.024;  // tilt left
    if (keys['d'] || keys['arrowright']) targetRoll = -0.024; // tilt right
    camera.rotation.order = 'YXZ'; // Order to prevent pitch/yaw distortion
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, targetRoll, 6 * deltaTime);

    // 2. Flashlight Drag & Inertia: Sway flashlight slightly lagging behind camera movement
    if (torchMesh) {
        const yawDiff = targetYaw - yaw;
        const pitchDiff = targetPitch - pitch;
        const targetTorchRotY = -0.1 - THREE.MathUtils.clamp(yawDiff * 0.45, -0.15, 0.15);
        const targetTorchRotX = 0.1 - THREE.MathUtils.clamp(pitchDiff * 0.45, -0.15, 0.15);
        torchMesh.rotation.y = THREE.MathUtils.lerp(torchMesh.rotation.y, targetTorchRotY, 18 * deltaTime);
        torchMesh.rotation.x = THREE.MathUtils.lerp(torchMesh.rotation.x, targetTorchRotX, 18 * deltaTime);

        // Sync SpotLight and its target direction to match the current swayed flashlight position/rotation!
        if (torchLight && torchTarget) {
            // Lens center is at Z = -0.0038 relative to torchMesh local origin
            const lensOffset = new THREE.Vector3(0, 0, -0.0038);
            lensOffset.applyEuler(torchMesh.rotation); // apply current sway rotation
            torchLight.position.copy(torchMesh.position).add(lensOffset); // update light position in camera coordinates
            
            const targetOffset = new THREE.Vector3(0, 0, -1.0);
            targetOffset.applyEuler(torchMesh.rotation); // apply current sway rotation
            torchTarget.position.copy(torchMesh.position).add(targetOffset); // update target position in camera coordinates
        }
    }

    // Yaw rotates the player body horizontally
    if (playerGroup) {
        playerGroup.rotation.y = yaw;
    }
    // Pitch rotates the camera vertically inside the body
    if (camera) {
        camera.rotation.x = pitch;
    }

    // Flashlight flicker effect (creepy atmospheric horror detail - 100% deterministic/synchronized for multiplayer)
    if (selectedSlot === 1 && torchLight) {
        // Use epoch date time so the flicker state matches perfectly on all players' screens!
        const timeSync = Date.now() / 1000;
        
        // Constant micro-jitter of the cheap bulb filaments
        const jitter = (Math.sin(timeSync * 25) * Math.cos(timeSync * 14) + Math.sin(timeSync * 8)) * 0.08;
        let targetIntensity = 1.0 * (1.0 + jitter); // Base intensity 1.0 with wobbly light jitter

        // Synced malfunction stutters using prime frequencies
        const malfunctionWave = Math.sin(timeSync * 0.3) * Math.cos(timeSync * 0.7);
        if (malfunctionWave > 0.42) {
            // We are in a malfunction stutter window! Generate rapid deterministic flickering
            const stutterVal = Math.sin(timeSync * 50) * Math.cos(timeSync * 30);
            if (stutterVal > 0.2) {
                targetIntensity = 0.08; // pitch black drop
            } else if (stutterVal > -0.3) {
                targetIntensity = 0.5;  // faint glowing coil
            }
        }

        torchLight.intensity = THREE.MathUtils.lerp(torchLight.intensity, targetIntensity, 0.35);
    }

    // Hide avatar model in first person
    if (playerModel) {
        playerModel.visible = false;
    }

    // Update real-time coordinates overlay
    if (playerGroup) {
        const coordsValues = document.getElementById('coords-values');
        if (coordsValues) {
            coordsValues.innerHTML = `
                X: ${playerGroup.position.x.toFixed(4)}<br>
                Y: ${playerGroup.position.y.toFixed(4)}<br>
                Z: ${playerGroup.position.z.toFixed(4)}<br>
                Grounded: ${isGrounded ? 'Yes' : 'No (Air)'}
            `;
        }
    }

    // Draw the top-left Sensory Radar Minimap
    updateMinimap();

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

    renderer.render(scene, camera);
}

// --- Player Controls & Physics ---
function updatePlayerMovement(deltaTime) {
    if (flyMode) {
        const speed = keys['q'] ? CONFIG.playerSpeed * 5.0 : CONFIG.playerSpeed * 2.5; // Sprint while flying
        const flyDir = new THREE.Vector3();
        if (keys['w'] || keys['arrowup']) flyDir.z -= 1; // Corrected forward direction (negative Z)
        if (keys['s'] || keys['arrowdown']) flyDir.z += 1; // Corrected backward direction (positive Z)
        if (keys['a'] || keys['arrowleft']) flyDir.x -= 1; // Corrected left direction (negative X)
        if (keys['d'] || keys['arrowright']) flyDir.x += 1; // Corrected right direction (positive X)
        
        // Up / Down
        if (keys[' '] || keys['spacebar']) playerGroup.position.y += speed * deltaTime;
        if (keys['shift']) playerGroup.position.y -= speed * deltaTime;
        
        if (flyDir.lengthSq() > 0) {
            flyDir.normalize();
            flyDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            playerGroup.position.addScaledVector(flyDir, speed * deltaTime);
        }
        
        // Stabilize camera height bobs
        camera.position.y = CONFIG.playerHeight * 0.95;
        camera.position.x = 0;
        return;
    }

    // 1. Gather local directional input (forward is negative Z relative to yaw)
    const moveDir = new THREE.Vector3();
    if (keys['w'] || keys['arrowup']) moveDir.z -= 1; // Corrected forward direction (negative Z)
    if (keys['s'] || keys['arrowdown']) moveDir.z += 1; // Corrected backward direction (positive Z)
    if (keys['a'] || keys['arrowleft']) moveDir.x -= 1; // Corrected left direction (negative X)
    if (keys['d'] || keys['arrowright']) moveDir.x += 1; // Corrected right direction (positive X)

    let isMoving = moveDir.lengthSq() > 0;

    // Save previous position in case we hit walls and need to revert
    playerGroup.userData.prevPosition = playerGroup.position.clone();

    if (isMoving) {
        moveDir.normalize();

        // Check for W+Q sprint
        const isSprinting = (keys['w'] || keys['arrowup']) && keys['q'];
        const currentSpeed = isSprinting ? CONFIG.playerSpeed * 2.2 : CONFIG.playerSpeed;
        
        // Rotate local move direction into world space based on current yaw heading
        moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        // Move player group horizontally
        playerGroup.position.addScaledVector(moveDir, currentSpeed * deltaTime);

        // Bob camera and held torch slightly (faster bobbing when sprinting!)
        const bobFrequency = isSprinting ? 20 : 12;
        const bobAmplitude = isSprinting ? 0.08 : 0.05;
        walkCycle += deltaTime * bobFrequency;
        
        camera.position.y = CONFIG.playerHeight * 0.95 + Math.abs(Math.sin(walkCycle)) * CONFIG.playerHeight * bobAmplitude;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 10 * deltaTime);
        
        if (torchMesh) {
            const time = clock.getElapsedTime() * bobFrequency;
            torchMesh.position.y = -0.006 + Math.abs(Math.sin(time)) * 0.0003;
            torchMesh.position.x = 0.008 + Math.cos(time) * 0.00015;
        }
    } else {
        walkCycle = 0;
        // Breathing Camera movement when standing still
        const breatheTime = clock.getElapsedTime() * 1.5;
        const breatheY = Math.sin(breatheTime) * 0.0003;
        const breatheX = Math.cos(breatheTime * 0.75) * 0.0002;
        
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, CONFIG.playerHeight * 0.95 + breatheY, 10 * deltaTime);
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, breatheX, 10 * deltaTime);
        
        if (torchMesh) {
            torchMesh.position.set(0.008, -0.006, -0.015);
        }
    }

    // 5. Jump logic (only if grounded)
    if ((keys[' '] || keys['spacebar']) && isGrounded) {
        verticalVelocity = CONFIG.jumpForce;
        isGrounded = false;
        keys[' '] = false; // Reset jump key so it's a single trigger
    }
}

function updateCollisions(deltaTime) {
    if (flyMode) {
        // Skip collisions and gravity in fly mode
        isGrounded = false;
        verticalVelocity = 0;
        return;
    }
    const prevPosition = playerGroup.userData.prevPosition;
    if (!prevPosition) return;

    // Apply gravity to vertical velocity
    if (!isGrounded) {
        verticalVelocity += CONFIG.gravity * deltaTime;
    }
    
    // Update player vertical position
    playerGroup.position.y += verticalVelocity * deltaTime;

    // Downward raycast to detect ground below the player
    // Ray origin is slightly above the player's new position
    const rayOrigin = playerGroup.position.clone().add(new THREE.Vector3(0, CONFIG.raycastHeightOffset, 0));
    const rayDirection = new THREE.Vector3(0, -1, 0);

    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
    const intersects = raycaster.intersectObjects(collidableMeshes, true);

    if (intersects.length > 0) {
        // Ground Y level is the highest intersection point below the ray origin
        const groundY = intersects[0].point.y;
        const heightDifference = groundY - prevPosition.y;

        // Collisions: Wall vs. Ground Slopes
        if (heightDifference > CONFIG.stepLimit && isGrounded) {
            // Obstacle is too steep/high to step up. Block XZ movement and keep previous XZ
            playerGroup.position.x = prevPosition.x;
            playerGroup.position.z = prevPosition.z;
            
            // Re-raycast at reverted position to snap height properly
            const revOrigin = playerGroup.position.clone().add(new THREE.Vector3(0, CONFIG.raycastHeightOffset, 0));
            raycaster.set(revOrigin, rayDirection);
            const revHits = raycaster.intersectObjects(collidableMeshes, true);
            if (revHits.length > 0) {
                playerGroup.position.y = revHits[0].point.y;
            }
            verticalVelocity = 0;
            isGrounded = true;
        } else {
            // Ground is a valid walk height (flat or gentle slope)
            if (playerGroup.position.y < groundY) {
                // If they clipped under the floor, snap them onto the ground
                playerGroup.position.y = groundY;
                verticalVelocity = 0;
                isGrounded = true;
            } else if (playerGroup.position.y > groundY) {
                // Player is above the ground, meaning they are falling/jumping
                isGrounded = false;
            } else {
                // Exact alignment
                isGrounded = true;
                verticalVelocity = 0;
            }
        }
    } else {
        // No ground below the player (walked off cliff edge)
        isGrounded = false;
        
        // Reset player if they fall into the abyss
        if (playerGroup.position.y < -40) {
            resetPlayerPosition();
        }
    }
}

// --- Hotbar Inventory Selection ---
function selectSlot(slotIndex) {
    selectedSlot = slotIndex;
    document.querySelectorAll('.hotbar-slot').forEach((slot, idx) => {
        if (idx === slotIndex - 1) {
            slot.classList.add('selected');
        } else {
            slot.classList.remove('selected');
        }
    });
    
    // Slot 1: Flashlight
    if (selectedSlot === 1) {
        if (torchLight) torchLight.visible = true;
        if (torchMesh) torchMesh.visible = true;
    } else {
        if (torchLight) torchLight.visible = false;
        if (torchMesh) torchMesh.visible = false;
    }
}

// --- Creepy Red Eyes Spawner & Interaction ---
function spawnRedEyes() {
    // Remove any existing eyes
    redEyesList.forEach(eye => {
        scene.remove(eye.group);
    });
    redEyesList = [];

    const eyeGeom = new THREE.SphereGeometry(0.0008, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000, fog: false });

    for (let i = 0; i < 4; i++) {
        const group = new THREE.Group();
        const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
        const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
        
        // Space eyes slightly apart (3mm)
        leftEye.position.x = -0.0015;
        rightEye.position.x = 0.0015;
        
        group.add(leftEye);
        group.add(rightEye);
        
        // Place randomly in the forest, but at least 1.5 units away from spawn to prevent immediate start-screen panic
        let x, z;
        do {
            x = mapCenterX + (Math.random() - 0.5) * 8.0;
            z = mapCenterZ + (Math.random() - 0.5) * 8.0;
        } while (Math.sqrt((x - mapCenterX)*(x - mapCenterX) + (z - mapCenterZ)*(z - mapCenterZ)) < 1.5);
        
        // Snap Y to ground
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects(collidableMeshes, true);
        let y = hits.length > 0 ? hits[0].point.y + 0.015 : 0.015;
        
        group.position.set(x, y, z);
        scene.add(group);
        
        redEyesList.push({
            group: group,
            baseY: y,
            fadeTimer: Math.random() * Math.PI
        });
    }
}

function spawnSpookyCocoons() {
    const sacGeom = new THREE.SphereGeometry(0.012, 12, 12);
    sacGeom.scale(1, 1.8, 1); // Oval cocoon shape

    const sacMat = new THREE.MeshStandardMaterial({
        color: 0xe0e6ed,
        emissive: 0x272b20, // Creepy bioluminescent glow
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.8
    });

    const sacCoords = [
        new THREE.Vector3(mapCenterX + 1.5, 0.015, mapCenterZ + 1.0),
        new THREE.Vector3(mapCenterX - 1.0, 0.015, mapCenterZ - 2.5),
        new THREE.Vector3(mapCenterX - 3.2, 0.015, mapCenterZ + 0.8),
        new THREE.Vector3(mapCenterX + 2.5, 0.015, mapCenterZ - 3.0),
        new THREE.Vector3(mapCenterX + 0.5, 1.25, mapCenterZ + 2.0) // Hanging under leaf
    ];

    sacCoords.forEach(pos => {
        const cocoon = new THREE.Mesh(sacGeom, sacMat);
        cocoon.position.copy(pos);
        cocoon.castShadow = true;
        cocoon.receiveShadow = true;
        scene.add(cocoon);

        // Add some thin creepy web strands using lines
        const lineMat = new THREE.LineBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.35 });
        const points = [];
        points.push(new THREE.Vector3(0, 0, 0));
        points.push(new THREE.Vector3(0.02, 0.05, 0.02));
        points.push(new THREE.Vector3(-0.02, 0.05, -0.02));
        points.push(new THREE.Vector3(0, -0.05, 0));

        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const webStrands = new THREE.LineSegments(lineGeom, lineMat);
        webStrands.position.copy(pos);
        scene.add(webStrands);
    });
}

function updateRedEyes(deltaTime) {
    const time = clock.getElapsedTime();
    
    let minDistance = 999.0;
    
    redEyesList.forEach(eye => {
        // Glow breathing rate
        eye.fadeTimer += deltaTime * 2;
        const glow = (Math.sin(eye.fadeTimer) + 1.0) / 2.0;
        eye.group.traverse(child => {
            if (child.isMesh) {
                child.material.color.setRGB(glow, 0, 0);
            }
        });
        
        // Look at player
        eye.group.lookAt(playerGroup.position);
        
        // Check distance to player for panic triggers
        if (playerGroup) {
            const dist = eye.group.position.distanceTo(playerGroup.position);
            if (dist < minDistance) {
                minDistance = dist;
            }
            
            // If flashlight shines on them, fade out/teleport away (scare factor!)
            if (selectedSlot === 1) {
                // Raycast vector from player to eye
                const toEyeDir = new THREE.Vector3().subVectors(eye.group.position, playerGroup.position).normalize();
                const lookDir = new THREE.Vector3();
                camera.getWorldDirection(lookDir);
                
                const angle = lookDir.angleTo(toEyeDir);
                if (angle < Math.PI / 8 && dist < 0.8) {
                    // Flashlight is pointing directly at them! Quickly teleport them somewhere else in the dark (at least 1.5m away from player)!
                    let x, z;
                    do {
                        x = (Math.random() - 0.5) * 8.0;
                        z = (Math.random() - 0.5) * 8.0;
                    } while (Math.sqrt(x*x + z*z) < 1.5);
                    
                    // Snap Y
                    const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
                    const hits = ray.intersectObjects(collidableMeshes, true);
                    let y = hits.length > 0 ? hits[0].point.y + 0.015 : 0.015;
                    
                    eye.group.position.set(x, y, z);
                    eye.baseY = y;
                    eye.fadeTimer = Math.random() * Math.PI;
                }
            }
        }
    });

    // Update panic factor based on closest red eyes distance (trigger range: 0.65 units / 65cm)
    if (minDistance < 0.65) {
        panicIntensity = Math.max(0, (0.65 - minDistance) / 0.65);
    } else {
        panicIntensity = 0;
    }
}

function updateMinimap() {
    if (!minimapRenderer || !minimapCamera || !playerGroup || !mapModel) return;

    // 1. Position camera directly above the player
    const px = playerGroup.position.x;
    const pz = playerGroup.position.z;
    minimapCamera.position.set(px, 1.0, pz); // 1m overhead height
    minimapCamera.lookAt(px, 0.0, pz);

    // 2. Temporarily switch scene settings to DAYLIGHT
    const originalFog = scene.fog;
    const originalAmbientIntensity = ambientLight.intensity;
    const originalTorch = torchLight.intensity;
    const originalCampfire = campfireLight ? campfireLight.intensity : 0;
    
    // Ensure sunLight exists for the minimap daylight shadow pass
    if (!sunLight) {
        sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
        sunLight.position.set(20, 40, 20);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 512;
        sunLight.shadow.mapSize.height = 512;
        sunLight.shadow.bias = -0.0005;
        scene.add(sunLight);
    }
    const originalSunVisible = sunLight.visible;
    const originalSunIntensity = sunLight.intensity;

    // Temporarily hide night lights and vignettes
    scene.fog = null;
    ambientLight.intensity = 1.4; // Bright daylight
    sunLight.visible = true;
    sunLight.intensity = 1.8;     // Bright sun
    torchLight.intensity = 0.0;   // Flashlight off
    if (campfireLight) campfireLight.intensity = 0.4;

    // Hide spooky red eyes during the minimap render pass
    redEyesList.forEach(eye => {
        if (eye.group) eye.group.visible = false;
    });

    // Render the 3D top-down view
    minimapRenderer.render(scene, minimapCamera);

    // Restore original night settings immediately after rendering minimap
    scene.fog = originalFog;
    ambientLight.intensity = originalAmbientIntensity;
    torchLight.intensity = originalTorch;
    if (campfireLight) campfireLight.intensity = originalCampfire;
    sunLight.visible = originalSunVisible;
    sunLight.intensity = originalSunIntensity;
    
    // Re-enable spooky elements
    redEyesList.forEach(eye => {
        if (eye.group) eye.group.visible = true;
    });

    // 3. Draw 2D HUD overlays (Player arrow, campfire marker)
    const ctx = minimapHudCtx;
    const w = minimapHudCanvas.width;
    const h = minimapHudCanvas.height;
    
    ctx.clearRect(0, 0, w, h);

    // Draw circular border ring on HUD canvas for clean Minecraft radar look
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Draw custom indicators (Campfire direction/spot)
    if (campfireModel) {
        const cx = campfireModel.position.x;
        const cz = campfireModel.position.z;
        const dx = cx - px;
        const dz = cz - pz;
        
        const viewSize = 0.35; // Matches camera width/height
        const viewHalfSize = viewSize / 2;
        
        // If campfire is within the Orthographic camera viewport bounds, draw it directly!
        if (Math.abs(dx) < viewHalfSize && Math.abs(dz) < viewHalfSize) {
            // Map relative coordinates (-viewHalfSize to viewHalfSize) to Canvas pixels (0 to w)
            const mapX = w / 2 + (dx / viewSize) * w;
            const mapY = h / 2 + (dz / viewSize) * h;
            
            ctx.shadowColor = '#ff6b00';
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#ff6b00';
            ctx.beginPath();
            ctx.arc(mapX, mapY, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0; // Reset shadow
            
            // Outer glowing ring
            ctx.strokeStyle = 'rgba(255, 107, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mapX, mapY, 7.5, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Draw a pointer marker on the border edge pointing to the campfire
            const angle = Math.atan2(dz, dx);
            const edgeR = w / 2 - 8;
            const edgeX = w / 2 + Math.cos(angle) * edgeR;
            const edgeY = h / 2 + Math.sin(angle) * edgeR;
            
            ctx.fillStyle = '#ff6b00';
            ctx.beginPath();
            ctx.arc(edgeX, edgeY, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw Minecraft Player Marker in the exact center of the scrolling map
    const mx = w / 2;
    const my = h / 2;

    // Get player's look direction
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    const heading = Math.atan2(lookDir.z, lookDir.x);

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(heading); // Rotate arrow mesh to face look direction

    // Draw Minecraft-style player arrow (white triangle with a shadow and dark border)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff'; // White arrow body
    ctx.strokeStyle = '#1e272e'; // Dark border
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(8, 0);       // Pointer nose
    ctx.lineTo(-6, -5.5);   // Back left wing
    ctx.lineTo(-3, 0);      // Inner notch
    ctx.lineTo(-6, 5.5);    // Back right wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
}

// --- Campfire Helpers & Particle Simulation ---
function setupCampfireLight(x, y, z) {
    // Warm soft firelight glow extending a few steps (1.8m range)
    campfireLight = new THREE.PointLight(0xff6611, 1.1, 1.8, 1.5);
    campfireLight.position.set(x, y, z);
    campfireLight.castShadow = true;
    campfireLight.shadow.mapSize.width = 512; // Small shadow map for pointlight to keep FPS high
    campfireLight.shadow.mapSize.height = 512;
    campfireLight.shadow.bias = -0.002;
    scene.add(campfireLight);
}

// Note: Fire particles are handled by setupCampfireQuarksParticles() using three.quarks.
// Old helper function definitions are removed.

function updateCampfire(deltaTime) {
    const t = Date.now() / 1000;

    // 1. PointLight flickering
    if (campfireLight) {
        // High frequency fire crackle intensity modulation
        const flicker = Math.sin(t * 32) * Math.cos(t * 18) * 0.18 + Math.sin(t * 8) * 0.08;
        campfireLight.intensity = 1.1 * (1.0 + flicker);
    }

    // 2. Update Particles
    // (All fire, sparks, and smoke particles are simulated by three.quarks in the main loop!)

    // 5. Force Campfire Scale to correct size every frame to protect against bad overrides!
    if (campfireModel) {
        const maxDim = 61.89;
        const scaleFactor = 0.029 / maxDim; // 0.000468 (slightly larger than character height)
        campfireModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }
}

function snapCampfireToGround() {
    if (!campfireModel || collidableMeshes.length === 0 || !mapModel) return;
    
    // Snaps to its current X and Z coordinate
    const x = campfireModel.position.x;
    const z = campfireModel.position.z;
    
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    // Filter out floating leaf meshes so the campfire snaps exactly to the ground floor!
    const groundMeshes = collidableMeshes.filter(m => m.name.toLowerCase().includes('ground'));
    const hits = ray.intersectObjects(groundMeshes, true);
    if (hits.length > 0) {
        const y = hits[0].point.y;
        campfireModel.position.set(x, y + 0.025, z); // Lifted by 7.5mm so stones are fully visible
        if (campfireLight) campfireLight.position.set(x, y + 0.029, z);
        campfireBaseY = y + 0.017; // Particle spawn height - starts inside the woods!
        
        // Reposition quarks particle emitters immediately to ground level
        if (quarksFireSystem) quarksFireSystem.emitter.position.set(x, campfireBaseY + 0.001, z);
        if (quarksSparksSystem) quarksSparksSystem.emitter.position.set(x, campfireBaseY + 0.002, z);
        if (quarksSmokeSystem) quarksSmokeSystem.emitter.position.set(x, campfireBaseY + 0.005, z);
    }
}

function applyMapOverrides(model) {
    const raw = localStorage.getItem('horror_game_map_overrides');
    if (!raw) return;
    try {
        const overrides = JSON.parse(raw);
        const rootNode = model.getObjectByName("RootNode");
        if (rootNode) {
            rootNode.children.forEach(child => {
                if (overrides[child.name]) {
                    const over = overrides[child.name];
                    if (over.position) child.position.set(over.position.x, over.position.y, over.position.z);
                    if (over.rotation) child.rotation.set(over.rotation.x, over.rotation.y, over.rotation.z);
                    if (over.scale) child.scale.set(over.scale.x, over.scale.y, over.scale.z);
                }
            });
        }
        console.log("Map overrides applied successfully.");
    } catch (e) {
        console.error("Failed to parse map overrides:", e);
    }
}

function applyCampfireOverrides() {
    const raw = localStorage.getItem('horror_game_map_overrides');
    if (!raw || !campfireModel) return;
    try {
        const overrides = JSON.parse(raw);
        if (overrides['camp_fire']) {
            const over = overrides['camp_fire'];
            if (over.position) campfireModel.position.set(over.position.x, over.position.y, over.position.z);
            if (over.rotation) campfireModel.rotation.set(over.rotation.x, over.rotation.y, over.rotation.z);
            
            // Adjust light and base positions to match the overridden position
            const x = campfireModel.position.x;
            const y = campfireModel.position.y;
            const z = campfireModel.position.z;
            if (campfireLight) campfireLight.position.set(x, y + 0.004, z); // Light slightly above logs
            campfireBaseY = y - 0.008; // Particle base inside the wood pile
            
            // Reposition quarks particle emitters immediately to match
            if (quarksFireSystem) quarksFireSystem.emitter.position.set(x, campfireBaseY + 0.001, z);
            if (quarksSparksSystem) quarksSparksSystem.emitter.position.set(x, campfireBaseY + 0.002, z);
            if (quarksSmokeSystem) quarksSmokeSystem.emitter.position.set(x, campfireBaseY + 0.005, z);
        }
    } catch (e) {
        console.error("Failed to apply campfire overrides:", e);
    }
}

// --- Day / Night Toggle Helpers ---
function updateTimeOfDay() {
    const timeStatus = document.getElementById('time-status') || createTimeStatusUI();
    timeStatus.innerText = dayMode ? "DAYTIME ACTIVATED [C]" : "";

    if (dayMode) {
        scene.background = new THREE.Color(0xb0d5f8);
        scene.fog.color = new THREE.Color(0xb0d5f8);
        scene.fog.density = 0.015; // thin out fog
        
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
        scene.background = new THREE.Color(0x000000);
        scene.fog.color = new THREE.Color(0x000000);
        scene.fog.density = CONFIG.fogDensity;

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

function createTimeStatusUI() {
    const el = document.createElement('div');
    el.id = 'time-status';
    el.style.position = 'absolute';
    el.style.bottom = '130px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = 'rgba(46, 213, 115, 0.85)';
    el.style.color = '#000';
    el.style.fontFamily = 'Outfit, sans-serif';
    el.style.fontWeight = '800';
    el.style.fontSize = '12px';
    el.style.padding = '4px 12px';
    el.style.borderRadius = '4px';
    el.style.zIndex = '1000';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    return el;
}

function createFlyStatusUI() {
    const el = document.createElement('div');
    el.id = 'fly-status';
    el.style.position = 'absolute';
    el.style.bottom = '100px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = 'rgba(255, 127, 80, 0.85)';
    el.style.color = '#000';
    el.style.fontFamily = 'Outfit, sans-serif';
    el.style.fontWeight = '800';
    el.style.fontSize = '12px';
    el.style.padding = '4px 12px';
    el.style.borderRadius = '4px';
    el.style.zIndex = '1000';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    return el;
}

// --- Campfire Helpers & Particle Simulation ---

function createFireParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 64, 64);
    
    // Draw a teardrop flame shape
    ctx.beginPath();
    ctx.moveTo(32, 54); // Bottom center
    ctx.bezierCurveTo(12, 45, 18, 15, 32, 10); // Left curve to top point
    ctx.bezierCurveTo(46, 15, 52, 45, 32, 54); // Right curve back to bottom
    ctx.closePath();
    
    // Fill with a vertical linear gradient (white-hot base, yellow body, red tip)
    const gradient = ctx.createLinearGradient(32, 54, 32, 10);
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');     // White hot bottom
    gradient.addColorStop(0.25, 'rgba(255, 220, 50, 0.95)');    // Yellow inner body
    gradient.addColorStop(0.6, 'rgba(255, 80, 0, 0.6)');        // Fiery orange-red
    gradient.addColorStop(0.9, 'rgba(180, 20, 0, 0.15)');       // Fading red tip
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function createSmokeParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Soft radial gradient for smoke puffs
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(220, 220, 220, 0.45)');
    gradient.addColorStop(0.3, 'rgba(160, 160, 160, 0.22)');
    gradient.addColorStop(0.7, 'rgba(100, 100, 100, 0.06)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function setupCampfireQuarksParticles(x, y, z) {
    if (!quarksRenderer) {
        quarksRenderer = new QUARKS.BatchedRenderer();
        scene.add(quarksRenderer);
    }
    
    const textureLoader = new THREE.TextureLoader();
    
    // Load the realistic fire sprite sheet (5x5 grid)
    const fireTexture = textureLoader.load('downloaded_assets/firespritesheet/fireSheet5x5.png');
    // Load Kenney's high quality particle pack textures
    const sparkTexture = textureLoader.load('downloaded_assets/kenney_particle-pack/PNG (Transparent)/spark_02.png');
    const smokeTexture = textureLoader.load('downloaded_assets/kenney_particle-pack/PNG (Transparent)/smoke_04.png');
    
    // 1. Core Flame System (Additive) - Large lush flame animation loop
    quarksFireSystem = new QUARKS.ParticleSystem({
        duration: 2.0,
        looping: true,
        uTileCount: 5, // 5 columns in fireSheet5x5
        vTileCount: 5, // 5 rows in fireSheet5x5
        renderMode: QUARKS.RenderMode.BillBoard,
        shape: new QUARKS.ConeEmitter({ 
            radius: 0.0035, // Broaden emission area
            angle: 0.08
        }),
        startLife: new QUARKS.IntervalValue(0.24, 0.48),
        startSpeed: new QUARKS.IntervalValue(0.038, 0.062),
        startSize: new QUARKS.IntervalValue(0.024, 0.038), // Enlarge flames significantly!
        startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),
        worldSpace: true,
        maxParticle: 140, // Increased particle limit for denser fire core
        material: new THREE.MeshBasicMaterial({
            map: fireTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }),
        behaviors: [
            new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.9, 0.4, 0), 0]])),
            new QUARKS.ColorOverLife(new QUARKS.Gradient([
                [new THREE.Vector4(1, 1, 1, 1), 0],
                [new THREE.Vector4(1, 0.85, 0.4, 0.9), 0.3],
                [new THREE.Vector4(1, 0.25, 0, 0.45), 0.65],
                [new THREE.Vector4(0, 0, 0, 0), 1.0]
            ])),
            new QUARKS.RotationOverLife(new QUARKS.IntervalValue(-2.5, 2.5)),
            // Animates through all 25 frames of the 5x5 spritesheet over its lifetime
            new QUARKS.FrameOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 8, 16, 24), 0]]))
        ]
    });
    quarksFireSystem.emitter.position.set(x, y + 0.001, z);
    quarksFireSystem.emitter.rotation.x = -Math.PI / 2; // Shoot straight UP
    scene.add(quarksFireSystem.emitter);
    quarksRenderer.addSystem(quarksFireSystem);

    // 2. Sparks / Embers System (Additive, wide cone, high speed)
    quarksSparksSystem = new QUARKS.ParticleSystem({
        duration: 2.0,
        looping: true,
        renderMode: QUARKS.RenderMode.BillBoard,
        shape: new QUARKS.ConeEmitter({ 
            radius: 0.001,
            angle: 0.28
        }),
        startLife: new QUARKS.IntervalValue(0.42, 0.85),
        startSpeed: new QUARKS.IntervalValue(0.045, 0.075),
        startSize: new QUARKS.IntervalValue(0.0008, 0.0016),
        startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 0.75, 0.15, 1.0)),
        worldSpace: true,
        maxParticle: 45,
        material: new THREE.MeshBasicMaterial({
            map: sparkTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }),
        behaviors: [
            new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 1, 0.4, 0), 0]])),
            new QUARKS.ColorOverLife(new QUARKS.Gradient([
                [new THREE.Vector4(1, 0.65, 0.15, 1.0), 0],
                [new THREE.Vector4(0.9, 0.22, 0.0, 0.65), 0.45],
                [new THREE.Vector4(0, 0, 0, 0), 1.0]
            ]))
        ]
    });
    quarksSparksSystem.emitter.position.set(x, y + 0.002, z);
    quarksSparksSystem.emitter.rotation.x = -Math.PI / 2; // Shoot straight UP
    scene.add(quarksSparksSystem.emitter);
    quarksRenderer.addSystem(quarksSparksSystem);

    // 3. Realistic Rising Smoke System (Normal blending, slow expansion, grey)
    quarksSmokeSystem = new QUARKS.ParticleSystem({
        duration: 3.0,
        looping: true,
        renderMode: QUARKS.RenderMode.BillBoard,
        shape: new QUARKS.ConeEmitter({ 
            radius: 0.0015,
            angle: 0.18
        }),
        startLife: new QUARKS.IntervalValue(1.8, 2.8),
        startSpeed: new QUARKS.IntervalValue(0.012, 0.026),
        startSize: new QUARKS.IntervalValue(0.010, 0.020),
        startColor: new QUARKS.ConstantColor(new THREE.Vector4(0.42, 0.42, 0.42, 0.22)),
        worldSpace: true,
        maxParticle: 50,
        material: new THREE.MeshBasicMaterial({
            map: smokeTexture,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false
        }),
        behaviors: [
            new QUARKS.SizeOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 2.2, 3.4, 4.5), 0]])),
            new QUARKS.ColorOverLife(new QUARKS.Gradient([
                [new THREE.Vector4(0.48, 0.48, 0.48, 0.24), 0],
                [new THREE.Vector4(0.38, 0.38, 0.38, 0.15), 0.45],
                [new THREE.Vector4(0.28, 0.28, 0.28, 0.04), 0.85],
                [new THREE.Vector4(0, 0, 0, 0), 1.0]
            ])),
            new QUARKS.RotationOverLife(new QUARKS.IntervalValue(-0.6, 0.6))
        ]
    });
    quarksSmokeSystem.emitter.position.set(x, y + 0.005, z);
    quarksSmokeSystem.emitter.rotation.x = -Math.PI / 2; // Shoot straight UP
    scene.add(quarksSmokeSystem.emitter);
    quarksRenderer.addSystem(quarksSmokeSystem);
}

function createProceduralFlashlight() {
    const torchMeshGroup = new THREE.Group();
    const bodyGeom = new THREE.CylinderGeometry(0.0004, 0.0004, 0.005, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222f3e, metalness: 0.8, roughness: 0.2 });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.rotation.x = Math.PI / 2;
    torchMeshGroup.add(bodyMesh);

    const headGeom = new THREE.CylinderGeometry(0.0007, 0.0004, 0.0015, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x57606f, metalness: 0.9, roughness: 0.1 });
    const headMesh = new THREE.Mesh(headGeom, headMat);
    headMesh.position.set(0, 0, -0.003);
    headMesh.rotation.x = Math.PI / 2;
    torchMeshGroup.add(headMesh);

    const lensGeom = new THREE.CylinderGeometry(0.0006, 0.0006, 0.0001, 12);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lensMesh = new THREE.Mesh(lensGeom, lensMat);
    lensMesh.position.set(0, 0, -0.0038);
    lensMesh.rotation.x = Math.PI / 2;
    torchMeshGroup.add(lensMesh);

    torchMesh = torchMeshGroup;
    // Positioned at the bottom-right corner of screen, tilted slightly inward
    torchMesh.position.set(0.013, -0.012, -0.018);
    torchMesh.rotation.set(0.18, -0.22, 0.0);
    camera.add(torchMesh);

    torchLight.position.set(0.013, -0.012, -0.021);
    torchTarget.position.set(0.013 - 0.05, -0.012 - 0.05, -1.0);

    // Load and overlay the realistic 3D Flashlight GLTF Model
    gltfLoader.load('realistic_flashlight__low_poly_game_ready.glb', (gltf) => {
        const gltfMesh = gltf.scene;
        flashlightGLTF = gltfMesh; // Save reference for key rotations debugger
        
        // Compute bounding box size to scale it to fit hand (0.0055m / 5.5mm length)
        const box = new THREE.Box3().setFromObject(gltfMesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = 0.0055 / maxDim;
        gltfMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Center on hand pivot and point forward (Y axis rotated to point to negative Z)
        gltfMesh.position.set(0, 0, -0.001);
        gltfMesh.rotation.set(0, -Math.PI / 2, 0); // Reset X rotation, only use Y horizontal turn!
        
        gltfMesh.traverse(child => {
            if (child.isMesh) {
                // Swap to an unlit MeshBasicMaterial so it shows its normal colors/textures and is completely unaffected by darkness or light!
                if (child.material) {
                    const oldMat = child.material;
                    child.material = new THREE.MeshBasicMaterial({
                        map: oldMat.map,
                        color: oldMat.color,
                        opacity: oldMat.opacity,
                        transparent: oldMat.transparent,
                        depthWrite: true,
                        depthTest: true
                    });
                }
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });
        
        // Attach to the main torch group
        torchMeshGroup.add(gltfMesh);
        
        // Hide the dark cylinder fallback meshes
        bodyMesh.visible = false;
        headMesh.visible = false;
        lensMesh.visible = false;
        
        console.log("3D Flashlight asset loaded and overlaid successfully.");
    }, undefined, (error) => {
        console.warn("Failed to load 3D flashlight asset, using dark cylinder fallback.", error);
    });
}

function printFlashlightRotation() {
    if (flashlightGLTF) {
        const rx = (flashlightGLTF.rotation.x * 180 / Math.PI).toFixed(0);
        const ry = (flashlightGLTF.rotation.y * 180 / Math.PI).toFixed(0);
        const rz = (flashlightGLTF.rotation.z * 180 / Math.PI).toFixed(0);
        console.log(`FLASHLIGHT ROTATION DEGS -> X: ${rx}, Y: ${ry}, Z: ${rz}`);
    }
}

// Start everything
init();
