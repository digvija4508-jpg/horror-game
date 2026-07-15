import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Scene Setup ---
let scene, camera, renderer;
let orbitControls, transformControls;
let mapModel = null;
let campfireModel = null;

// Raycasting & selection
let raycaster, mouse;
let selectedObject = null;
let collidableMeshes = [];
let movableObjects = []; // Overrides targets

// Original transforms lookup (for resetting)
let defaultTransforms = {};

// Overrides dictionary
let overrides = {};

// UI References
const loaderOverlay = document.getElementById('editor-loader');
const selectedNameLabel = document.getElementById('selected-object-name');
const propertiesContainer = document.getElementById('properties-container');

// Numeric Inputs
const posInputs = {
    x: document.getElementById('pos-x'),
    y: document.getElementById('pos-y'),
    z: document.getElementById('pos-z')
};
const rotInputs = {
    x: document.getElementById('rot-x'),
    y: document.getElementById('rot-y'),
    z: document.getElementById('rot-z')
};
const scaleInputs = {
    x: document.getElementById('scale-x'),
    y: document.getElementById('scale-y'),
    z: document.getElementById('scale-z')
};

// Toolbar Buttons
const toolBtnSelect = document.getElementById('tool-select');
const toolBtnTranslate = document.getElementById('tool-translate');
const toolBtnRotate = document.getElementById('tool-rotate');
const toolBtnScale = document.getElementById('tool-scale');
const btnToggleSnap = document.getElementById('toggle-snap');

// Action Buttons
const btnSnapGround = document.getElementById('btn-snap-ground');
const btnResetSelected = document.getElementById('btn-reset-selected');
const btnClearAll = document.getElementById('btn-clear-all');
const btnSave = document.getElementById('btn-save');
const btnImport = document.getElementById('btn-import');
const btnExport = document.getElementById('btn-export');
const btnLaunch = document.getElementById('btn-launch');

// Modal Elements
const jsonModal = document.getElementById('json-modal');
const modalTitle = document.getElementById('modal-title');
const modalTextarea = document.getElementById('modal-textarea');
const modalBtnCancel = document.getElementById('modal-btn-cancel');
const modalBtnAction = document.getElementById('modal-btn-action');

let isSnapActive = true;
let modalMode = 'export'; // 'export' or 'import'

// Initialize everything
function init() {
    // 1. Scene & Camera Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2130);
    
    // Add grid helper & axes helper for professional editor look
    const gridHelper = new THREE.GridHelper(20, 100, 0xff7f50, 0x4f5a6f);
    gridHelper.position.y = -0.05; // slightly below ground
    scene.add(gridHelper);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(0, 3, 5);

    // 2. Renderer Setup
    const canvas = document.getElementById('editor-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. Lighting (Bright studio lighting for editing)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Faint blue fill light
    const fillLight = new THREE.DirectionalLight(0x7fb3ff, 0.5);
    fillLight.position.set(-10, 5, -10);
    scene.add(fillLight);

    // 4. Controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = true;

    // Gizmo controls
    transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);

    transformControls.addEventListener('change', () => {
        if (selectedObject) {
            updateSidebarInputs();
        }
    });

    transformControls.addEventListener('dragging-changed', (e) => {
        orbitControls.enabled = !e.value;
    });

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Load saved overrides
    loadLocalStorageOverrides();

    // 5. Assets loading manager
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onLoad = () => {
        loaderOverlay.style.display = 'none';
        
        // Dynamic map center calculations
        if (mapModel) {
            const mapBox = new THREE.Box3().setFromObject(mapModel);
            const mapCenter = new THREE.Vector3();
            mapBox.getCenter(mapCenter);
            orbitControls.target.copy(mapCenter);
            camera.position.set(mapCenter.x, mapCenter.y + 4, mapCenter.z + 6);
            orbitControls.update();
        }
    };

    // Load textures
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const groundDiff = textureLoader.load('forest_ground_texture/textures/forest_ground_04_diff_1k.jpg');
    const groundNor = textureLoader.load('forest_ground_texture/textures/forest_ground_04_nor_gl_1k.jpg');
    const groundRough = textureLoader.load('forest_ground_texture/textures/forest_ground_04_rough_1k.jpg');
    const groundAO = textureLoader.load('forest_ground_texture/textures/forest_ground_04_ao_1k.jpg');

    [groundDiff, groundNor, groundRough, groundAO].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(16, 16);
    });
    groundDiff.colorSpace = THREE.SRGBColorSpace;

    // Load map
    const gltfLoader = new GLTFLoader(loadingManager);
    gltfLoader.load('leaves_in_the_garden.glb', (gltf) => {
        mapModel = gltf.scene;
        scene.add(mapModel);

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

                        // Fix material transparency test
                        if (sub.material) {
                            const materials = Array.isArray(sub.material) ? sub.material : [sub.material];
                            materials.forEach(mat => {
                                if (mat.transparent) {
                                    mat.depthWrite = true;
                                    mat.alphaTest = 0.5;
                                }
                            });
                        }
                    }
                });

                const name = child.name.toLowerCase();
                const isGround = name.includes('ground');
                const isLeaf = name.includes('s_list') && !name.includes('plants');

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
                        }
                    });
                    collidableMeshes.push(child);
                }

                // Add moveable objects (anything that is a leaf cluster or tree)
                if (isLeaf) {
                    movableObjects.push(child);
                    // Store default layout values
                    storeDefaultTransforms(child);
                    // Apply saved overrides (if any)
                    applySingleOverride(child);
                }
            });
        }
    });

    // Load Campfire
    gltfLoader.load('camp_fire.glb', (gltf) => {
        campfireModel = gltf.scene;
        
        // Scale campfire to fit micro scale (0.029m / 2.9cm - slightly larger than character)
        const box = new THREE.Box3().setFromObject(campfireModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scaleFactor = 0.029 / maxDim;
        campfireModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position at open clearing (-0.060, -0.020) clear of leaf canopy and dirt mounds
        let x = -0.060, z = -0.020;
        campfireModel.position.set(x, 0.025, z);
        campfireModel.name = "camp_fire";
        scene.add(campfireModel);

        campfireModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Store default
        storeDefaultTransforms(campfireModel);
        
        // Add to selectable list
        movableObjects.push(campfireModel);

        // Apply saved overrides
        applySingleOverride(campfireModel);

        // Place pointlight just to show visual placement in editor
        const warmLight = new THREE.PointLight(0xff6611, 2.0, 0.45);
        warmLight.position.set(0, 0.02, 0);
        campfireModel.add(warmLight);
    });

    setupSnapping();

    // 6. Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    // UI Wire-up
    setupUIListeners();
}

// Store default parameters
function storeDefaultTransforms(obj) {
    defaultTransforms[obj.name] = {
        position: obj.position.clone(),
        rotation: obj.rotation.clone(),
        scale: obj.scale.clone()
    };
}

// Apply single loaded override on load
function applySingleOverride(obj) {
    if (overrides[obj.name]) {
        const o = overrides[obj.name];
        if (o.position) obj.position.set(o.position.x, o.position.y, o.position.z);
        if (o.rotation) obj.rotation.set(o.rotation.x, o.rotation.y, o.rotation.z);
        // Exclude campfire scale override from loading in editor
        if (o.scale && obj.name !== 'camp_fire') obj.scale.set(o.scale.x, o.scale.y, o.scale.z);
    }
}

// Save all modifications
function saveOverrides() {
    overrides = {};
    movableObjects.forEach(obj => {
        const def = defaultTransforms[obj.name];
        if (!def) return;

        const isPosDiff = obj.position.distanceTo(def.position) > 0.0001;
        const isRotDiff = Math.abs(obj.rotation.x - def.rotation.x) > 0.001 ||
                          Math.abs(obj.rotation.y - def.rotation.y) > 0.001 ||
                          Math.abs(obj.rotation.z - def.rotation.z) > 0.001;
        const isScaleDiff = obj.name !== 'camp_fire' && obj.scale.distanceTo(def.scale) > 0.001;

        if (isPosDiff || isRotDiff || isScaleDiff) {
            overrides[obj.name] = {
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }
            };
            if (obj.name !== 'camp_fire') {
                overrides[obj.name].scale = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
            }
        }
    });

    localStorage.setItem('horror_game_map_overrides', JSON.stringify(overrides));
    alert("Overrides saved successfully! Changes will load in-game.");
}

function loadLocalStorageOverrides() {
    const raw = localStorage.getItem('horror_game_map_overrides');
    if (raw) {
        try {
            overrides = JSON.parse(raw);
        } catch (e) {
            console.error("Failed to parse local storage overrides:", e);
        }
    }
}

// Selection & Raycasting
function onPointerDown(e) {
    // Only select on left click and when not interacting with UI or transform controls gizmo
    if (e.button !== 0 || transformControls.dragging || isMouseOverUI(e)) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(movableObjects, true);

    if (intersects.length > 0) {
        let hitObj = intersects[0].object;

        // Traverse up to find either the campfire root group or a child of RootNode
        let selected = hitObj;
        const rootNode = mapModel ? mapModel.getObjectByName("RootNode") : null;
        while (selected.parent && selected.parent !== scene && selected.parent !== mapModel && selected.parent !== rootNode) {
            selected = selected.parent;
        }

        selectObject(selected);
    } else {
        // Clicking in empty air deselects
        deselectObject();
    }
}

function isMouseOverUI(e) {
    // Check if clicked element lies inside head, aside, or footer panels
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    for (let el of elements) {
        if (el.classList.contains('interactive') || el.tagName === 'HEADER' || el.tagName === 'ASIDE' || el.tagName === 'FOOTER') {
            return true;
        }
    }
    return false;
}

function selectObject(obj) {
    selectedObject = obj;
    selectedNameLabel.innerText = obj.name || "unnamed";
    propertiesContainer.style.display = 'block';

    transformControls.attach(obj);
    updateSidebarInputs();
}

function deselectObject() {
    if (transformControls.dragging) return;
    selectedObject = null;
    selectedNameLabel.innerText = "None Selected";
    propertiesContainer.style.display = 'none';
    transformControls.detach();
}

// Set up snapping settings
function setupSnapping() {
    if (isSnapActive) {
        transformControls.setTranslationSnap(0.01);
        transformControls.setRotationSnap(15 * Math.PI / 180); // 15 degrees snap
        transformControls.setScaleSnap(0.05);
        btnToggleSnap.classList.add('active');
    } else {
        transformControls.setTranslationSnap(null);
        transformControls.setRotationSnap(null);
        transformControls.setScaleSnap(null);
        btnToggleSnap.classList.remove('active');
    }
}

// Side bar synchronization
function updateSidebarInputs() {
    if (!selectedObject) return;
    
    // Position
    posInputs.x.value = selectedObject.position.x.toFixed(4);
    posInputs.y.value = selectedObject.position.y.toFixed(4);
    posInputs.z.value = selectedObject.position.z.toFixed(4);

    // Rotation (convert to degrees)
    rotInputs.x.value = Math.round(selectedObject.rotation.x * 180 / Math.PI);
    rotInputs.y.value = Math.round(selectedObject.rotation.y * 180 / Math.PI);
    rotInputs.z.value = Math.round(selectedObject.rotation.z * 180 / Math.PI);

    // Scale
    scaleInputs.x.value = selectedObject.scale.x.toFixed(2);
    scaleInputs.y.value = selectedObject.scale.y.toFixed(2);
    scaleInputs.z.value = selectedObject.scale.z.toFixed(2);
}

function onSidebarInput() {
    if (!selectedObject) return;

    // Position
    const px = parseFloat(posInputs.x.value) || 0;
    const py = parseFloat(posInputs.y.value) || 0;
    const pz = parseFloat(posInputs.z.value) || 0;
    selectedObject.position.set(px, py, pz);

    // Rotation (degrees to radians)
    const rx = (parseFloat(rotInputs.x.value) || 0) * Math.PI / 180;
    const ry = (parseFloat(rotInputs.y.value) || 0) * Math.PI / 180;
    const rz = (parseFloat(rotInputs.z.value) || 0) * Math.PI / 180;
    selectedObject.rotation.set(rx, ry, rz);

    // Scale
    const sx = parseFloat(scaleInputs.x.value) || 1;
    const sy = parseFloat(scaleInputs.y.value) || 1;
    const sz = parseFloat(scaleInputs.z.value) || 1;
    selectedObject.scale.set(sx, sy, sz);
}

// Snap object Y position to ground terrain
function snapToGround() {
    if (!selectedObject || collidableMeshes.length === 0) return;
    
    // Position raycast starting 5 meters directly above selected object
    const startPos = new THREE.Vector3(selectedObject.position.x, 10, selectedObject.position.z);
    const dir = new THREE.Vector3(0, -1, 0);

    const snapRay = new THREE.Raycaster(startPos, dir);
    // Ignore selected object itself
    const hits = snapRay.intersectObjects(collidableMeshes, true);
    
    if (hits.length > 0) {
        let groundY = hits[0].point.y;
        
        // Campfire model offset (bottom sits exactly on ground)
        if (selectedObject.name === "camp_fire") {
            selectedObject.position.y = groundY + 0.0175;
        } else {
            selectedObject.position.y = groundY;
        }
        
        updateSidebarInputs();
    }
}

// Reset selected transforms
function resetSelectedTransforms() {
    if (!selectedObject) return;
    const def = defaultTransforms[selectedObject.name];
    if (def) {
        selectedObject.position.copy(def.position);
        selectedObject.rotation.copy(def.rotation);
        selectedObject.scale.copy(def.scale);
        updateSidebarInputs();
    }
}

// Wire up UI
function setupUIListeners() {
    // Gizmo modes bindings
    toolBtnSelect.addEventListener('click', () => {
        transformControls.detach();
        toolBtnSelect.classList.add('active');
        toolBtnTranslate.classList.remove('active');
        toolBtnRotate.classList.remove('active');
        toolBtnScale.classList.remove('active');
    });

    toolBtnTranslate.addEventListener('click', () => {
        if (selectedObject) transformControls.attach(selectedObject);
        transformControls.setMode('translate');
        toolBtnSelect.classList.remove('active');
        toolBtnTranslate.classList.add('active');
        toolBtnRotate.classList.remove('active');
        toolBtnScale.classList.remove('active');
    });

    toolBtnRotate.addEventListener('click', () => {
        if (selectedObject) transformControls.attach(selectedObject);
        transformControls.setMode('rotate');
        toolBtnSelect.classList.remove('active');
        toolBtnTranslate.classList.remove('active');
        toolBtnRotate.classList.add('active');
        toolBtnScale.classList.remove('active');
    });

    toolBtnScale.addEventListener('click', () => {
        if (selectedObject) transformControls.attach(selectedObject);
        transformControls.setMode('scale');
        toolBtnSelect.classList.remove('active');
        toolBtnTranslate.classList.remove('active');
        toolBtnRotate.classList.remove('active');
        toolBtnScale.classList.add('active');
    });

    btnToggleSnap.addEventListener('click', () => {
        isSnapActive = !isSnapActive;
        setupSnapping();
    });

    // Inputs update
    [posInputs.x, posInputs.y, posInputs.z, 
     rotInputs.x, rotInputs.y, rotInputs.z, 
     scaleInputs.x, scaleInputs.y, scaleInputs.z].forEach(inp => {
        inp.addEventListener('input', onSidebarInput);
    });

    // Actions
    btnSnapGround.addEventListener('click', snapToGround);
    btnResetSelected.addEventListener('click', resetSelectedTransforms);
    
    btnClearAll.addEventListener('click', () => {
        if (confirm("Are you sure you want to delete ALL custom placements and reset the map?")) {
            localStorage.removeItem('horror_game_map_overrides');
            overrides = {};
            movableObjects.forEach(obj => {
                const def = defaultTransforms[obj.name];
                if (def) {
                    obj.position.copy(def.position);
                    obj.rotation.copy(def.rotation);
                    obj.scale.copy(def.scale);
                }
            });
            deselectObject();
            alert("All map overrides wiped and reset!");
        }
    });

    btnSave.addEventListener('click', saveOverrides);

    btnImport.addEventListener('click', () => {
        modalMode = 'import';
        modalTitle.innerText = "Import Layout JSON";
        modalTextarea.value = "";
        modalTextarea.placeholder = 'Paste exported overrides JSON here...';
        jsonModal.style.display = 'flex';
    });

    btnExport.addEventListener('click', () => {
        modalMode = 'export';
        modalTitle.innerText = "Export Layout JSON";
        
        // Generate current JSON
        const tempOverrides = {};
        movableObjects.forEach(obj => {
            const def = defaultTransforms[obj.name];
            if (!def) return;
            const isPosDiff = obj.position.distanceTo(def.position) > 0.0001;
            const isRotDiff = Math.abs(obj.rotation.x - def.rotation.x) > 0.001 ||
                              Math.abs(obj.rotation.y - def.rotation.y) > 0.001 ||
                              Math.abs(obj.rotation.z - def.rotation.z) > 0.001;
            const isScaleDiff = obj.name !== 'camp_fire' && obj.scale.distanceTo(def.scale) > 0.001;

            if (isPosDiff || isRotDiff || isScaleDiff) {
                tempOverrides[obj.name] = {
                    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                    rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }
                };
                if (obj.name !== 'camp_fire') {
                    tempOverrides[obj.name].scale = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
                }
            }
        });

        modalTextarea.value = JSON.stringify(tempOverrides, null, 2);
        modalTextarea.select();
        jsonModal.style.display = 'flex';
    });

    modalBtnCancel.addEventListener('click', () => {
        jsonModal.style.display = 'none';
    });

    modalBtnAction.addEventListener('click', () => {
        if (modalMode === 'export') {
            // Copy to clipboard
            modalTextarea.select();
            document.execCommand('copy');
            alert("Config JSON copied to clipboard!");
            jsonModal.style.display = 'none';
        } else {
            // Import
            try {
                const text = modalTextarea.value.trim();
                if (!text) return;
                const parsed = JSON.parse(text);
                
                // Wipe current
                movableObjects.forEach(obj => {
                    const def = defaultTransforms[obj.name];
                    if (def) {
                        obj.position.copy(def.position);
                        obj.rotation.copy(def.rotation);
                        obj.scale.copy(def.scale);
                    }
                });

                overrides = parsed;
                movableObjects.forEach(obj => {
                    applySingleOverride(obj);
                });
                
                localStorage.setItem('horror_game_map_overrides', JSON.stringify(overrides));
                deselectObject();
                alert("Overrides imported and loaded successfully!");
                jsonModal.style.display = 'none';
            } catch (e) {
                alert("Invalid JSON format! Please check the structure.");
            }
        }
    });

    btnLaunch.addEventListener('click', () => {
        window.open('index.html', '_blank');
    });
}

// Hotkey bindings (W / E / R / Esc)
function onKeyDown(e) {
    const key = e.key.toLowerCase();
    
    // Ignore if typing inside input fields or textareas
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    if (key === 'w') {
        transformControls.setMode('translate');
        toolBtnSelect.classList.remove('active');
        toolBtnTranslate.classList.add('active');
        toolBtnRotate.classList.remove('active');
        toolBtnScale.classList.remove('active');
    } else if (key === 'e') {
        transformControls.setMode('rotate');
        toolBtnSelect.classList.remove('active');
        toolBtnTranslate.classList.remove('active');
        toolBtnRotate.classList.add('active');
        toolBtnScale.classList.remove('active');
    } else if (key === 'r') {
        transformControls.setMode('scale');
        toolBtnSelect.classList.remove('active');
        toolBtnTranslate.classList.remove('active');
        toolBtnRotate.classList.remove('active');
        toolBtnScale.classList.add('active');
    } else if (e.key === 'Escape') {
        deselectObject();
        toolBtnSelect.classList.add('active');
        toolBtnTranslate.classList.remove('active');
        toolBtnRotate.classList.remove('active');
        toolBtnScale.classList.remove('active');
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);

    orbitControls.update();
    renderer.render(scene, camera);
}

init();
animate();
