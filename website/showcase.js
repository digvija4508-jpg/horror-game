import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Configuration ---
const CONFIG = {
    playerSpeed: 0.1,
    sprintMultiplier: 1.6,
    playerHeight: 1.8, // Standard human scale for showcase
};

let scene, renderer, clock;
let playerModel = null;
let playerGroup = null;
let mixer = null;
let animationsMap = {};
let currentAction = null;

// Cameras
let fpvCamera, tpvCamera, spvCamera, bevCamera;

// State
let keys = {};

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc); // Neutral grey background

    clock = new THREE.Clock();

    // 1. Lighting Setup (Bright and Clear)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // 2. Environment: Large Open Plain
    const planeGeom = new THREE.PlaneGeometry(100, 100);
    const planeMat = new THREE.MeshStandardMaterial({
        color: 0x444444,
        transparent: false,
        opacity: 1.0
    });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 4. Cameras Setup
    const aspect = (window.innerWidth / 2) / window.innerHeight;
    
    fpvCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    tpvCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    spvCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    bevCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);

    // 5. Load Avatar
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/Avatars/Player-avatar.glb', (gltf) => {
        playerModel = gltf.scene;
        
        playerModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        playerGroup = new THREE.Group();
        
        // Calculate bounding box to ensure the avatar stands on the ground
        const bbox = new THREE.Box3().setFromObject(playerModel);
        const height = bbox.max.y - bbox.min.y;
        const centerOffset = bbox.min.y;
        
        // Shift the model up so its bottom (min.y) is at 0 relative to playerGroup
        // Shift the model up so its bottom (min.y) is at 0 relative to playerGroup,
        // plus a small manual offset to ensure it doesn't clip through the ground.
        const scale = 2.0;
        playerGroup.scale.set(scale, scale, scale);
        
        playerModel.position.y = (-centerOffset + 0.02) * scale;
        
        playerGroup.add(playerModel);
        scene.add(playerGroup);

        // Animation setup
        mixer = new THREE.AnimationMixer(playerModel);
        animationsMap = {};
        gltf.animations.forEach(clip => {
            const name = clip.name.toLowerCase();
            if (name.includes('idle')) animationsMap['idle'] = mixer.clipAction(clip);
            else if (name.includes('walk')) animationsMap['walk'] = mixer.clipAction(clip);
            else if (name.includes('run') || name.includes('sprint')) animationsMap['sprint'] = mixer.clipAction(clip);
        });

        if (animationsMap['idle']) {
            currentAction = animationsMap['idle'];
            currentAction.play();
        }

        // Attach FPV Camera to head
        const headBone = playerModel.getObjectByName('mixamorig_Head');
        if (headBone) {
            headBone.add(fpvCamera);
            fpvCamera.position.set(0, 0.05, 0);
            fpvCamera.rotation.set(0, 0, 0);
        } else {
            fpvCamera.position.set(0, CONFIG.playerHeight * 0.9, 0);
            playerGroup.add(fpvCamera);
        }

        animate();
    });

    // 6. Controls
    window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = (width / 2) / height;

    fpvCamera.aspect = aspect;
    fpvCamera.updateProjectionMatrix();
    tpvCamera.aspect = aspect;
    tpvCamera.updateProjectionMatrix();
    spvCamera.aspect = aspect;
    spvCamera.updateProjectionMatrix();
    bevCamera.aspect = aspect;
    bevCamera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

function fadeToAction(nextAction, duration = 0.2) {
    if (nextAction && currentAction !== nextAction) {
        const prevAction = currentAction;
        currentAction = nextAction;
        currentAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).crossFadeFrom(prevAction, duration, true).play();
    }
}

function updatePlayerMovement(dt) {
    if (!playerGroup) return;

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (keys['w']) moveDir.z -= 1;
    if (keys['s']) moveDir.z += 1;
    if (keys['a']) moveDir.x -= 1;
    if (keys['d']) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const isSprinting = keys['shift'];
        const speed = isSprinting ? CONFIG.playerSpeed * CONFIG.sprintMultiplier : CONFIG.playerSpeed;
        
        playerGroup.position.addScaledVector(moveDir, speed);
        
        // Rotate avatar to face movement direction
        const targetRotation = Math.atan2(moveDir.x, moveDir.z);
        playerGroup.rotation.y = THREE.MathUtils.lerp(playerGroup.rotation.y, targetRotation, 0.15);

        fadeToAction(isSprinting ? animationsMap['sprint'] : animationsMap['walk']);
    } else {
        fadeToAction(animationsMap['idle']);
    }


    document.getElementById('anim-state').innerText = currentAction ? currentAction.getClip().name : 'None';
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    updatePlayerMovement(dt);
    if (mixer) mixer.update(dt);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const halfWidth = width / 2;

    renderer.setScissorTest(true);

    // View 1: FPV (Top-Left)
    renderer.setViewport(0, height / 2, halfWidth, height / 2);
    renderer.setScissor(0, height / 2, halfWidth, height / 2);
    if (playerModel) playerModel.visible = false;
    renderer.render(scene, fpvCamera);

    // View 2: TPV (Top-Right)
    renderer.setViewport(halfWidth, height / 2, halfWidth, height / 2);
    renderer.setScissor(halfWidth, height / 2, halfWidth, height / 2);
    if (playerModel) playerModel.visible = true;
    const tpvOffset = new THREE.Vector3(0, 2, 5).applyQuaternion(playerGroup.quaternion);
    tpvCamera.position.copy(playerGroup.position).add(tpvOffset);
    tpvCamera.lookAt(playerGroup.position);
    renderer.render(scene, tpvCamera);

    // View 3: SPV Frontal (Bottom-Left)
    renderer.setViewport(0, 0, halfWidth, height / 2);
    renderer.setScissor(0, 0, halfWidth, height / 2);
    const spvOffset = new THREE.Vector3(0, 1, -5).applyQuaternion(playerGroup.quaternion);
    spvCamera.position.copy(playerGroup.position).add(spvOffset);
    spvCamera.lookAt(playerGroup.position);
    renderer.render(scene, spvCamera);

    // View 4: BEV (Bottom-Right)
    renderer.setViewport(halfWidth, 0, halfWidth, height / 2);
    renderer.setScissor(halfWidth, 0, halfWidth, height / 2);
    bevCamera.position.set(playerGroup ? playerGroup.position.x : 0, 10, playerGroup ? playerGroup.position.z : 0);
    bevCamera.lookAt(playerGroup ? playerGroup.position : new THREE.Vector3(0,0,0));
    renderer.render(scene, bevCamera);
}
