import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Game Configurations & State ---
const CONFIG = {
    playerSpeed: 0.04,         // Slowed waddle speed (micro scale)
    gravity: -5,
    jumpForce: 1.2,
    raycastHeightOffset: 0.12, // Height from which we raycast downward
    stepLimit: 0.04,           // Clear climb height for leaves
    playerHeight: 0.05         // Scale player to 5cm (small, as requested)
};

let scene, camera, renderer;
let clock = new THREE.Clock();

// Game entities
let mapModel = null;
let playerModel = null;
let playerGroup = null; // Group holding the player mesh for easier rotation/positioning
let collidableMeshes = [];

// Smooth Mouse Look Rotation (Yaw & Pitch)
let yaw = 0, pitch = 0;
let targetYaw = 0, targetPitch = 0;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Movement state
let keys = {};
let verticalVelocity = 0;
let isGrounded = false;
let spawnPosition = new THREE.Vector3(0, 10, 0);

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
    scene.background = new THREE.Color(0xb0ddff); // Bright afternoon sky blue
    // Add Exp2 Fog matching the bright afternoon sky
    scene.fog = new THREE.FogExp2(0xb0ddff, 0.010); // Less dense for clear sight

    // 2. Camera Setup (First-Person View)
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.005, 100);

    // 3. Renderer Setup
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // 5. Lighting
    // Bright Ambient Light (so underside of leaves and shadows aren't pitch black)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    // Directional Light (Warm Sun)
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 2.0); // Boosted sun brightness
    dirLight.position.set(20, 35, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    
    const d = 45;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Visual Sun Sphere in the sky
    const sunGeom = new THREE.SphereGeometry(1.5, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffbc4 }); // warm glowing white/yellow sun
    const sunMesh = new THREE.Mesh(sunGeom, sunMat);
    sunMesh.position.set(20, 35, 10);
    scene.add(sunMesh);

    // Hemisphere Light for soft natural sky-ground gradient
    const hemiLight = new THREE.HemisphereLight(0x70a1ff, 0x2f3542, 0.3);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // 6. Loading Manager
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
    });
    groundDiff.colorSpace = THREE.SRGBColorSpace;

    // 8. Load Assets
    const gltfLoader = new GLTFLoader(loadingManager);

    // Load Map
    gltfLoader.load('leaves_in_the_garden.glb', (gltf) => {
        mapModel = gltf.scene;
        collidableMeshes = [];
        mapModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Fix alpha sorting / depth buffer overlap issues for leaves/grass
                const fixMaterial = (mat) => {
                    if (mat.transparent) {
                        mat.depthWrite = true;
                        mat.alphaTest = 0.5; // Discard pixels below 0.5 alpha to write depth correctly
                        mat.needsUpdate = true;
                    }
                    mat.shadowSide = THREE.DoubleSide;
                };
                if (Array.isArray(child.material)) {
                    child.material.forEach(fixMaterial);
                } else if (child.material) {
                    fixMaterial(child.material);
                }
                
                // Exclude grass and micro plants to prevent standing in the air
                const name = child.name.toLowerCase();
                const isGround = name.includes('ground');
                const isLeaf = name.includes('s_list') && !name.includes('forest') && !name.includes('plants');
                if (isGround || isLeaf) {
                    collidableMeshes.push(child);
                }

                // Apply forest ground texture to the ground mesh
                if (isGround) {
                    child.material = new THREE.MeshStandardMaterial({
                        map: groundDiff,
                        normalMap: groundNor,
                        roughnessMap: groundRough,
                        aoMap: groundAO,
                        roughness: 0.9,
                        metalness: 0.05
                    });
                    child.material.needsUpdate = true;
                }
            }
        });
        scene.add(mapModel);
        
        // Play map animations (like moving leaves/grass)
        if (gltf.animations && gltf.animations.length > 0) {
            mapMixer = new THREE.AnimationMixer(mapModel);
            gltf.animations.forEach((clip) => {
                mapMixer.clipAction(clip).play();
            });
            console.log("Map animations playing:", gltf.animations.length);
        }
        
        // Find safe spawn point based on map center & bounds
        calculateSpawnPoint();
    });

    // Load Player Avatar
    gltfLoader.load('stick_man_generic_model.glb', (gltf) => {
        playerModel = gltf.scene;
        
        // Setup shadows for player
        playerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Set up player group to rotate/translate cleanly
        playerGroup = new THREE.Group();
        playerGroup.add(playerModel);
        
        // Group the first-person camera directly on the head of the player group
        camera.position.set(0, CONFIG.playerHeight * 0.85, 0.005);
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
    });

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    // Grab Mouse Drag look events
    window.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        
        // Rotate yaw & pitch (horizontal rotates targetYaw, vertical rotates targetPitch)
        targetYaw -= deltaX * 0.0025; // look speed sensitivity
        targetPitch -= deltaY * 0.0025;
        
        // Clamp vertical look pitch
        targetPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, targetPitch));
        
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        startScreen.classList.add('hidden');
        gameHud.classList.remove('hidden');
        
        clock.getDelta(); // Reset clock delta
        animate();
    });

    const pauseButton = document.getElementById('pause-button');
    pauseButton.addEventListener('click', (e) => {
        e.stopPropagation();
        startScreen.classList.remove('hidden');
        gameHud.classList.add('hidden');
        
        const title = startScreen.querySelector('.main-title');
        title.innerText = "Game Paused";
        const btn = startScreen.querySelector('#start-button');
        btn.innerText = "RESUME";
    });

    resetButton.addEventListener('click', (e) => {
        e.stopPropagation();
        resetPlayerPosition();
    });
}

// --- Spawn logic ---
function calculateSpawnPoint() {
    if (!mapModel) return;

    // Calculate map bounding box
    const mapBox = new THREE.Box3().setFromObject(mapModel);
    const mapCenter = new THREE.Vector3();
    mapBox.getCenter(mapCenter);
    
    // Default fallback
    spawnPosition.set(mapCenter.x, mapBox.max.y + 5, mapCenter.z);

    // Cast ray downward from sky center to find map surface
    const raycaster = new THREE.Raycaster(
        new THREE.Vector3(mapCenter.x, mapBox.max.y + 10, mapCenter.z),
        new THREE.Vector3(0, -1, 0)
    );
    const intersects = raycaster.intersectObjects(collidableMeshes, true);

    if (intersects.length > 0) {
        // Spawn right on the ground at center
        spawnPosition.copy(intersects[0].point);
    } else {
        // If center is empty, look for any intersection on a grid
        const gridOffset = 10;
        let found = false;
        
        for (let x = -30; x <= 30; x += gridOffset) {
            for (let z = -30; z <= 30; z += gridOffset) {
                const testPos = new THREE.Vector3(mapCenter.x + x, mapBox.max.y + 10, mapCenter.z + z);
                raycaster.set(testPos, new THREE.Vector3(0, -1, 0));
                const hits = raycaster.intersectObjects(collidableMeshes, true);
                if (hits.length > 0) {
                    spawnPosition.copy(hits[0].point);
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }
    
    console.log("Calculated spawn position:", spawnPosition);
}

function resetPlayerPosition() {
    if (playerGroup) {
        playerGroup.position.copy(spawnPosition);
        verticalVelocity = 0;
        isGrounded = true;
        
        // Reset look rotations
        yaw = 0;
        pitch = 0;
        targetYaw = 0;
        targetPitch = 0;
        playerGroup.rotation.set(0, 0, 0);
        camera.rotation.set(0, Math.PI, 0);
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

    // Only update movement if menu is closed (hud is active)
    if (!startScreen.classList.contains('hidden') && playerGroup && mapModel) {
        // Pause updates if menu is open
    } else if (playerGroup && mapModel) {
        updatePlayerMovement(deltaTime);
        updateCollisions(deltaTime);
    }

    // Update map animations (foliage wind swaying)
    if (mapMixer) {
        mapMixer.update(deltaTime);
    }

    // Smooth Human-like Yaw & Pitch rotation lerp (dampening)
    yaw = THREE.MathUtils.lerp(yaw, targetYaw, 10 * deltaTime);
    pitch = THREE.MathUtils.lerp(pitch, targetPitch, 10 * deltaTime);

    // Yaw rotates the player body horizontally
    if (playerGroup) {
        playerGroup.rotation.y = yaw;
    }
    // Pitch rotates the camera vertically inside the body
    if (camera) {
        camera.rotation.x = pitch;
    }

    // Hide avatar model in first person
    if (playerModel) {
        playerModel.visible = false;
    }

    renderer.render(scene, camera);
}

// --- Player Controls & Physics ---
function updatePlayerMovement(deltaTime) {
    // 1. Gather directional input
    const inputDirection = new THREE.Vector3();
    
    if (keys['w'] || keys['arrowup']) inputDirection.z -= 1;
    if (keys['s'] || keys['arrowdown']) inputDirection.z += 1;
    if (keys['a'] || keys['arrowleft']) inputDirection.x -= 1;
    if (keys['d'] || keys['arrowright']) inputDirection.x += 1;

    let isMoving = inputDirection.lengthSq() > 0;

    // Save previous position in case we hit walls and need to revert
    playerGroup.userData.prevPosition = playerGroup.position.clone();

    if (isMoving) {
        inputDirection.normalize();

        // 2. Combine inputs relative to playerGroup's horizontal orientation (yaw)
        // Note: forward in local coordinates is positive Z (matching model direction)
        const moveDir = new THREE.Vector3();
        if (keys['w'] || keys['arrowup']) moveDir.z += 1;
        if (keys['s'] || keys['arrowdown']) moveDir.z -= 1;
        if (keys['a'] || keys['arrowleft']) moveDir.x += 1;
        if (keys['d'] || keys['arrowright']) moveDir.x -= 1;
        
        moveDir.normalize();
        // Rotate local move direction into world space based on current yaw heading
        moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        // 3. Move player group
        playerGroup.position.addScaledVector(moveDir, CONFIG.playerSpeed * deltaTime);

        // Bob 1P camera slightly when moving (first-person step waddle)
        walkCycle += deltaTime * 12;
        camera.position.y = CONFIG.playerHeight * 0.85 + Math.abs(Math.sin(walkCycle)) * CONFIG.playerHeight * 0.05;
    } else {
        walkCycle = 0;
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, CONFIG.playerHeight * 0.85, 10 * deltaTime);
    }

    // 5. Jump logic (only if grounded)
    if ((keys[' '] || keys['spacebar']) && isGrounded) {
        verticalVelocity = CONFIG.jumpForce;
        isGrounded = false;
        keys[' '] = false; // Reset jump key so it's a single trigger
    }
}

function updateCollisions(deltaTime) {
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

// Start everything
init();
