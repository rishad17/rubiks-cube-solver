/**
 * cube3d.js — the interactive Three.js Rubik's Cube.
 *
 * The cube is built from 26 real "cubie" objects (black rounded boxes with
 * colored sticker tiles). A face turn is a genuine 3D rotation: the nine
 * cubies of the layer are attached to a temporary pivot, the pivot is
 * rotated, and the cubies are re-attached with their new positions and
 * orientations. Colors are never repainted to fake a move.
 *
 * Axes match cube-state.js: +x = Right, +y = Up, +z = Front.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import {
  COLOR_HEX, FACE_TURNS, FACE_NORMALS, FACE_ORDER, faceletIndexAt, moveAngle, parseMove,
} from './cube-state.js';

const CUBIE_SIZE = 0.95;
const STICKER_SIZE = 0.8;
const UNSET_COLOR = '#3b4457';
const BODY_COLOR = '#0c0f16';
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(5.4, 4.6, 7.0);
const AXIS_VECTORS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A flat rounded square used for every sticker. */
function createStickerGeometry(size, radius) {
  const h = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  const geometry = new THREE.ShapeGeometry(shape, 6);
  // ShapeGeometry uses raw x/y as UVs; remap them to 0..1 so textures fit the tile.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + h) / size, (uv.getY(i) + h) / size);
  return geometry;
}

/** Texture with a face letter, used on center stickers (white background is tinted by the sticker color). */
function createLabelTexture(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.font = 'bold 72px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class Cube3D {
  /** @param {HTMLElement} container element that will hold the canvas */
  constructor(container) {
    this.container = container;
    this.cubies = [];
    this.stickers = [];
    this.animationQueue = Promise.resolve();
    this.pendingAnimations = 0;
    this.activeAnimation = null;
    this.generation = 0; // bumped on reset so queued animations are dropped
    this.turnDuration = 320; // ms for a quarter turn
    this.cameraTween = null;
    this.labelTextures = {};
    this.showLabels = true;
    this.editable = true;        // stickers can be clicked to change their color
    this.onStickerClick = null;  // (faceletIndex, clientX, clientY) => void
    this.hoveredSticker = null;
    this.pickTargets = [];       // sticker + body meshes, for raycasting
    this.raycaster = new THREE.Raycaster();

    this.#setupScene();
    this.#buildCube();
    this.#watchSize();
    this.#setupPicking();
    this.renderer.setAnimationLoop((time) => this.#tick(time));
  }

  /* ---------------------------------------------------------------- setup */

  #setupScene() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.copy(DEFAULT_CAMERA_POSITION);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd9ff, 0.6);
    fill.position.set(-6, -3, -4);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 18;
    this.controls.rotateSpeed = 0.9;
    // Stop the camera tween as soon as the user grabs the cube.
    this.controls.addEventListener('start', () => { this.cameraTween = null; });

    this.cubeRoot = new THREE.Group();
    this.scene.add(this.cubeRoot);
  }

  #buildCube() {
    const bodyGeometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 3, 0.09);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.55, metalness: 0.1 });
    const stickerGeometry = createStickerGeometry(STICKER_SIZE, 0.11);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue; // hidden core
          const cubie = new THREE.Group();
          cubie.position.set(x, y, z);
          cubie.userData.home = [x, y, z];
          const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
          cubie.add(body);
          this.pickTargets.push(body);

          // One sticker for each outward-facing side of this cubie.
          for (const face of FACE_ORDER) {
            const normal = FACE_NORMALS[face];
            const isOutward = normal.every((n, axis) => n === 0 || n === [x, y, z][axis]);
            if (!isOutward) continue;
            const material = new THREE.MeshStandardMaterial({ color: UNSET_COLOR, roughness: 0.35, metalness: 0.0 });
            const sticker = new THREE.Mesh(stickerGeometry, material);
            const n = new THREE.Vector3(...normal);
            sticker.position.copy(n).multiplyScalar(CUBIE_SIZE / 2 + 0.002);
            sticker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
            sticker.userData.homeNormal = normal;
            sticker.userData.faceletIndex = faceletIndexAt([x, y, z], normal);
            sticker.userData.isCenter = Math.abs(x) + Math.abs(y) + Math.abs(z) === 1;
            sticker.userData.face = face;
            sticker.userData.colorKey = null;
            cubie.add(sticker);
            this.stickers.push(sticker);
            this.pickTargets.push(sticker);
          }
          this.cubeRoot.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }
    this.#applyLabels();
  }

  #watchSize() {
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = this.container;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // Pull the camera back a little on tall/narrow screens so the cube fits.
      this.camera.fov = w / h < 0.9 ? 40 : 32;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(this.container);
    resize();
  }

  /**
   * Clicking a sticker (a press and release without dragging) reports its
   * facelet index. Bodies are raycast too so a ray slipping between two
   * stickers can't pick one on the far side of the cube.
   */
  #setupPicking() {
    const canvas = this.renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', (event) => {
      down = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, time: performance.now() } : null;
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const quick = performance.now() - down.time < 600;
      down = null;
      if (moved > 6 || !quick) return; // that was a camera drag
      const sticker = this.#pickSticker(event);
      if (sticker) this.onStickerClick?.(sticker.userData.faceletIndex, event.clientX, event.clientY);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons) return; // dragging the camera
      this.#setHovered(this.#pickSticker(event));
    });
    canvas.addEventListener('pointerleave', () => this.#setHovered(null));
  }

  /** The editable (non-center) sticker under the pointer, if any. */
  #pickSticker(event) {
    if (!this.editable || this.isAnimating || !this.onStickerClick) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const object = this.raycaster.intersectObjects(this.pickTargets, false)[0]?.object;
    return object && this.stickers.includes(object) && !object.userData.isCenter ? object : null;
  }

  #setHovered(sticker) {
    if (sticker === this.hoveredSticker) return;
    this.hoveredSticker?.material.emissive.setHex(0x000000);
    this.hoveredSticker = sticker;
    sticker?.material.emissive.setHex(0x2a2a2a);
    this.renderer.domElement.style.cursor = sticker ? 'pointer' : '';
  }

  /** Allow or block editing colors by clicking stickers (blocked while showing a solution). */
  setEditable(editable) {
    this.editable = editable;
    if (!editable) this.#setHovered(null);
  }

  /* ---------------------------------------------------------- render loop */

  #tick(time) {
    if (this.activeAnimation) this.#stepAnimation(time);
    if (this.cameraTween) {
      const t = Math.min(1, (time - (this.cameraTween.start ??= time)) / 600);
      this.camera.position.lerpVectors(this.cameraTween.from, DEFAULT_CAMERA_POSITION, easeInOutCubic(t));
      if (t >= 1) this.cameraTween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /* --------------------------------------------------------------- state */

  /**
   * Show a cube state. `colors` is an array of 54 color keys (or null for
   * stickers not yet entered), indexed like the facelet string.
   * Any running or queued animation is cancelled first.
   */
  setColors(colors) {
    this.cancelAnimations();
    for (const cubie of this.cubies) {
      cubie.position.set(...cubie.userData.home);
      cubie.quaternion.identity();
    }
    for (const sticker of this.stickers) {
      const colorKey = colors[sticker.userData.faceletIndex] ?? null;
      sticker.userData.colorKey = colorKey;
      sticker.material.color.set(colorKey ? COLOR_HEX[colorKey] : UNSET_COLOR);
    }
  }

  /**
   * Read the colors back from the 3D scene by looking at where every sticker
   * currently is and which way it faces. Used to verify that the displayed
   * cube matches the logical state (e.g. that it is really solved at the end).
   */
  readColors() {
    const colors = new Array(54).fill(null);
    const normal = new THREE.Vector3();
    for (const sticker of this.stickers) {
      const cubie = sticker.parent;
      const position = cubie.position.toArray().map(Math.round);
      normal.set(...sticker.userData.homeNormal).applyQuaternion(cubie.quaternion);
      const index = faceletIndexAt(position, normal.toArray().map(Math.round));
      if (index >= 0) colors[index] = sticker.userData.colorKey;
    }
    return colors;
  }

  /* ----------------------------------------------------------- animation */

  /** Queue a face-turn animation. Resolves when this move has finished animating. */
  animateMove(move) {
    const generation = this.generation;
    this.pendingAnimations++;
    const run = () => (generation === this.generation ? this.#animate(move) : undefined);
    this.animationQueue = this.animationQueue.then(run).finally(() => { this.pendingAnimations--; });
    return this.animationQueue;
  }

  /** Resolves when all queued animations have finished. */
  whenIdle() {
    return this.animationQueue;
  }

  get isAnimating() {
    return this.pendingAnimations > 0;
  }

  #animate(move) {
    const { face, quarterTurns } = parseMove(move);
    const { axis, layer } = FACE_TURNS[face];
    const angle = moveAngle(move);

    // Pick the 9 cubies currently in the turning layer and attach them to a pivot.
    const pivot = new THREE.Group();
    this.cubeRoot.add(pivot);
    for (const cubie of this.cubies) {
      if (Math.round(cubie.position[axis]) === layer) pivot.attach(cubie);
    }

    // Speed up when the user queues several moves quickly.
    const backlogFactor = this.pendingAnimations > 2 ? 0.45 : 1;
    const duration = this.turnDuration * (quarterTurns === 2 ? 1.5 : 1) * backlogFactor;

    return new Promise((resolve) => {
      this.activeAnimation = { pivot, axis: AXIS_VECTORS[axis], angle, duration, start: null, resolve };
    });
  }

  #stepAnimation(time) {
    const anim = this.activeAnimation;
    anim.start ??= time;
    const t = anim.duration > 0 ? Math.min(1, (time - anim.start) / anim.duration) : 1;
    anim.pivot.quaternion.setFromAxisAngle(anim.axis, anim.angle * easeInOutCubic(t));
    if (t >= 1) this.#finishAnimation();
  }

  /** Bake the pivot rotation into the cubies and snap them to the exact grid. */
  #finishAnimation() {
    const anim = this.activeAnimation;
    if (!anim) return;
    anim.pivot.quaternion.setFromAxisAngle(anim.axis, anim.angle);
    anim.pivot.updateMatrixWorld(true);
    for (const cubie of [...anim.pivot.children]) {
      this.cubeRoot.attach(cubie);
      cubie.position.set(Math.round(cubie.position.x), Math.round(cubie.position.y), Math.round(cubie.position.z));
      // Remove floating-point drift: a cubie's orientation is always a
      // combination of 90° turns, so its rotation matrix contains only -1, 0, 1.
      const m = new THREE.Matrix4().makeRotationFromQuaternion(cubie.quaternion);
      m.elements.forEach((value, i) => { m.elements[i] = Math.round(value); });
      cubie.quaternion.setFromRotationMatrix(m);
    }
    this.cubeRoot.remove(anim.pivot);
    this.activeAnimation = null;
    anim.resolve();
  }

  /** Drop queued animations and stop the current one immediately. */
  cancelAnimations() {
    this.generation++;
    if (this.activeAnimation) this.#finishAnimation();
  }

  /* -------------------------------------------------------------- view */

  /** Smoothly return the camera to the default view (Front, Up and Right visible). */
  resetView() {
    this.controls.target.set(0, 0, 0);
    this.cameraTween = { from: this.camera.position.clone(), start: null };
  }

  setAnimationSpeed(quarterTurnMs) {
    this.turnDuration = quarterTurnMs;
  }

  /** Show or hide the U/R/F/D/L/B letters on the center stickers. */
  setLabelsVisible(visible) {
    this.showLabels = visible;
    this.#applyLabels();
  }

  #applyLabels() {
    for (const sticker of this.stickers) {
      if (!sticker.userData.isCenter) continue;
      const face = sticker.userData.face;
      this.labelTextures[face] ??= createLabelTexture(face);
      sticker.material.map = this.showLabels ? this.labelTextures[face] : null;
      sticker.material.needsUpdate = true;
    }
  }
}
