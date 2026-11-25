/**
 * Dev-only page: one vehicle on plain ground in the late-afternoon light, for checking a
 * model without loading a map. Open http://localhost:5173/scripts/studio/?vehicle=hilux
 * with the dev server running; scripts/studio-shots.ts photographs it from all round.
 * `?trailer=no5` (or `box6x4`) shows a trailer on its own at the origin; with `vehicle` as
 * well, the trailer stands hitched behind the vehicle. `?stock` draws the 80 Series without its
 * touring gear, and `?plain` puts the vehicle on a flat white backdrop, for laying its outline
 * over a reference photograph.
 */
import * as THREE from 'three';
import { lateAfternoon } from '../../src/data/environment';
import { isVehicleId, vehicles } from '../../src/data/vehicles';
import { hitchPoint, trailers, type TrailerTuning } from '../../src/data/trailers';
import type { Trailer } from '../../src/sim/trailer';
import { TrailerView } from '../../src/render/trailerView';
import { applyFogEnvironment } from '../../src/render/fog';
import { Lighting } from '../../src/render/lighting';
import { Sky } from '../../src/render/sky';
import { VehicleModel } from '../../src/render/vehicleModel';
import { WorkingMirrors } from '../../src/render/workingMirrors';
import { vehicleLooks } from '../../src/render/vehicleLooks';
import { loadFj40Glb } from '../../src/render/fj40Glb';
import { buildBodyCore } from '../../src/render/sooty80Body';

const params = new URLSearchParams(location.search);
const trailerId = params.get('trailer') as TrailerTuning['id'] | null;
const alone = trailerId !== null && !params.has('vehicle');
const id = params.get('vehicle') ?? 'shortie';
if (!isVehicleId(id)) throw new Error(`Unknown vehicle ${id}`);
const tuning = vehicles[id].tuning;
const env = lateAfternoon;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = env.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = env.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 2000);
const lighting = new Lighting(scene, env);
lighting.sun.shadow.mapSize.set(2048, 2048);
for (const k of ['left', 'bottom'] as const) lighting.sun.shadow.camera[k] = -8;
for (const k of ['right', 'top'] as const) lighting.sun.shadow.camera[k] = 8;
lighting.sun.shadow.camera.updateProjectionMatrix();
const sky = new Sky(env);
scene.add(sky.mesh);
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene();
skyScene.add(new Sky(env).mesh);
scene.environment = pmrem.fromScene(skyScene, 0.04, 0.1, 200, { size: 128 }).texture;
scene.environmentIntensity = 0.45;
applyFogEnvironment(scene, env, 2000);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#8B7355', roughness: 1 }),
);
// Derive the hub height from the suspension: lifted vehicles need not use -0.12 m.
const rest = tuning.suspensionRestLength - 0.12;
ground.position.y = tuning.wheels[0].y - rest - tuning.wheelRadius;
ground.receiveShadow = true;
scene.add(ground);
if (params.has('plain')) {
  sky.mesh.visible = ground.visible = false;
  scene.background = new THREE.Color('#ffffff');
}
if (params.has('stock') && id === 'sooty80')
  vehicleLooks.sooty80.body = (t, wheel) => buildBodyCore(t, wheel, false);

// The FJ40's body is the Blender model. Load it before the mesh is built, or the studio
// draws the hand-coded fallback and the photographs are of the wrong car.
if (id === 'shortie') await loadFj40Glb();

const model = new VehicleModel(tuning);
const mirrors = new WorkingMirrors();
mirrors.setVehicle(model);
const articulationBlocks = new THREE.Group();
scene.add(articulationBlocks);
// The stock body has no rack, so its recovery boards stay off.
if (params.has('stock')) model.rackPlanks.visible = false;
model.poseWheels(tuning.wheels.map((w) => w.y - rest));
if (!alone) scene.add(model.root);

/** A trailer standing still: on its own with its ground under the origin, or on the vehicle's hitch. */
if (trailerId) {
  const t = trailers[trailerId];
  if (!t) throw new Error(`Unknown trailer ${trailerId}`);
  const sag = (t.mass * 9.81) / (t.wheels.length * t.springRate);
  const susp = t.suspensionRestLength - sag;
  const groundBelowMount = susp + t.wheelRadius;
  let pos = new THREE.Vector3(0, ground.position.y + groundBelowMount, 0);
  let pitch = 0;
  if (!alone) {
    const h = hitchPoint(tuning);
    const axleY = ground.position.y + groundBelowMount;
    pitch = Math.atan2(h.y - (axleY + t.coupling.y), -t.coupling.z);
    // Coupling on the hitch: the axle sits `reach` behind it along the drawbar.
    const k = new THREE.Vector3(t.coupling.x, t.coupling.y, t.coupling.z).applyAxisAngle(
      new THREE.Vector3(1, 0, 0),
      pitch,
    );
    pos = new THREE.Vector3(h.x - k.x, h.y - k.y, h.z - k.z);
  }
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  const fake = {
    tuning: t,
    prevPosition: { x: pos.x, y: pos.y, z: pos.z },
    prevRotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    body: { translation: () => pos, rotation: () => q },
    wheels: t.wheels.map(() => ({ suspension: susp, rotation: 0 })),
    tyres: [1, 1],
    drums: 0,
    hitchedTo: alone ? null : {},
  } as unknown as Trailer;
  const view = new TrailerView(fake);
  view.setDrums(Number(params.get('drums') ?? 0));
  view.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  scene.add(view.root);
}

function view(x: number, y: number, z: number, tx = 0, ty = 0.3, tz = 0, fov = 45): void {
  camera.fov = fov;
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
  camera.updateProjectionMatrix();
  lighting.follow(new THREE.Vector3());
  sky.update(camera);
  mirrors.update(renderer, scene, camera, false);
  renderer.render(scene, camera);
}

declare global {
  interface Window {
    studio: {
      view: typeof view;
      articulate(height: number, steer?: number): void;
      cockpit(): void;
      flat(wheel: number, angle?: number, drop?: number): void;
      /** The vehicle's box, its hubs and the ground's height, for framing a camera on it. */
      bounds(): { min: number[]; max: number[]; hubs: number[][]; ground: number };
      ready: boolean;
    };
  }
}
window.studio = {
  view,
  /** Static diagonal blocks for inspecting live-axle movement without a full map. */
  articulate(height: number, steer = 0) {
    // Keep this a modest inspection pose. Larger strokes can reveal existing body
    // wheelhouse/tray clearance limits; the dev rig does not solve chassis collision.
    const amount = Math.max(0, Math.min(0.16, height));
    for (const child of [...articulationBlocks.children]) {
      const mesh = child as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
    model.root.position.y = amount / 2;
    model.poseWheels(
      tuning.wheels.map((w, i) => w.y - rest + (i === 0 || i === 3 ? amount / 2 : -amount / 2)),
      [steer, steer, 0, 0],
    );
    for (const i of [0, 3]) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, amount || 0.001, 0.9),
        new THREE.MeshStandardMaterial({ color: '#72766A', roughness: 1 }),
      );
      const hub = model.wheels[i].pivot.position;
      block.position.set(hub.x, ground.position.y + amount / 2, hub.z);
      articulationBlocks.add(block);
    }
  },
  /**
   * Wheel `wheel` as a flat tyre, turned `angle` about its axle: the flat must be at the bottom
   * whichever way the wheel is turned or mounted (left wheels with an inner face are turned round).
   */
  flat(wheel: number, angle = 1, drop = 0.07) {
    const w = model.wheels[wheel];
    w.spin.rotation.x = angle;
    const squash = model as unknown as {
      squashWheel(i: number, angle: number, drop: number, flat: number): THREE.BufferGeometry;
    };
    w.mesh.geometry = squash.squashWheel(wheel, w.turned ? -angle : angle, drop, 1);
    renderer.render(scene, camera);
  },
  /** From the driver's seat, as the game's cockpit view sees it. */
  cockpit() {
    const c = vehicles[id].cabin;
    model.setCockpitView(true);
    camera.fov = 70;
    camera.position.set(c.eye.x, c.eye.y, c.eye.z);
    camera.rotation.set(c.pitch, 0, 0, 'YXZ');
    camera.updateProjectionMatrix();
    // Populate all visible heads for a single still; normal gameplay budgets one per frame.
    for (let i = 0; i < 5; i++) mirrors.update(renderer, scene, camera, true, performance.now() + i);
    renderer.render(scene, camera);
    model.setCockpitView(false);
  },
  bounds() {
    const box = new THREE.Box3().setFromObject(model.root);
    return {
      min: box.min.toArray(),
      max: box.max.toArray(),
      hubs: model.wheels.map((w) => w.pivot.getWorldPosition(new THREE.Vector3()).toArray()),
      ground: ground.position.y,
    };
  },
  ready: true,
};
view(5, 2, -5);
