import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../sim/vehicle/math';
import type { VehicleTuning } from '../data/vehicle';
import { FJ40_BODY_LIFT, FJ40_CAB_DROP, useFj40Cab, vehicles } from '../data/vehicles';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addVehicleInterior } from './vehicleInterior';
import { addFj40GlbEquipment } from './vehicleEquipment';
import { cleanGeometry } from './bodyRefinement';
import { standardLivery, type Livery } from './vehicleBody';

/**
 * The Blender-built FJ40 (public/models/fj40.glb, tools/blender/fj40) as the short-wheelbase
 * 40 Series' body and wheels. TEST BRANCH ONLY (fj40-blender-test): the GLB is loaded once
 * before the drive starts; ?fj40=code keeps the hand-coded body, and a failed load falls back
 * to it too. The GLB is Y-up, metres, nose to -Z: already the game's frame.
 *
 * Kept from the code car: the cabin and dials (the cockpit camera and instruments are laid out
 * on them), the roof rack the planks ride on, the roof spare and aerial, and the moving axles
 * and springs (VehicleSuspension). Left out of the GLB for the same reason: interior_*,
 * chassis_axle_*, chassis_spring_*; the wheel_* nodes become the shared wheel geometry.
 */

/**
 * GLB hubs are at y = -0.108 and the tyres meet the ground. The game parks its hubs at
 * y = -0.12, so 12 mm down would put the model's hubs on the axles. Since v1.86 the body
 * stands FJ40_BODY_LIFT above that (see its note). The +0.108 of v1.81 lined the roof up with
 * the code body and left a 120 mm gap above each tyre.
 */
const LIFT = -0.012 + FJ40_BODY_LIFT;
/**
 * The rear spare, as modelled, covered the left tail lamp. v1.83 moved it 0.22 m inboard, which
 * put it across the seam between the two barn doors, where no carrier could hold it. Since
 * v1.86 it is on the left door alone, 0.19 m higher: over the lamp and across the foot of that
 * door's window, as rear-34-left.jpg carries its spare, centred on the door so it stays inside
 * the body's side. 15 mm further off the door, the tyre clears the door's upper hinge.
 */
const SPARE_SHIFT = { x: 0.01, y: 0.19, z: 0.015 };
const GLB_TYRE_R = 0.392;

let gltfRoot: THREE.Object3D | null = null;
let loading: Promise<void> | null = null;

export function fj40GlbWanted(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('fj40') !== 'code';
}

/** Whether the GLB is loaded and the shortie is drawn from it. */
export function fj40GlbActive(): boolean {
  return gltfRoot !== null && fj40GlbWanted();
}

/** Load the GLB (once). Never rejects: on failure the code body is used. */
export function loadFj40Glb(): Promise<void> {
  if (!fj40GlbWanted()) return Promise.resolve();
  loading ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/fj40.glb`)
    .then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      gltfRoot = gltf.scene;
      useFj40Cab(true);
      console.info('[fj40] Blender GLB loaded');
    })
    .catch((err: unknown) => {
      console.warn('[fj40] GLB failed to load; using the code body', err);
    });
  return loading;
}

/** The named part a mesh belongs to (multi-material parts load as a group of meshes). */
function partName(o: THREE.Object3D): string {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (/^(body|trim|glass|wheel|spare|lamp|chassis|interior)_?/.test(p.name)) return p.name;
  }
  return o.name;
}

function zoneOf(part: string): number {
  if (part.startsWith('body_front')) return Z.Front;
  if (part.startsWith('body_sides')) return Z.Sides;
  if (part.startsWith('body_rear')) return Z.Rear;
  if (part.startsWith('body_roof')) return Z.Roof;
  if (part.startsWith('glass_')) return Z.Glass;
  return Z.Trim;
}

function slotAndColour(part: string, mat: THREE.MeshStandardMaterial, livery: Livery): [number, THREE.Color] {
  const name = mat.name;
  const c = mat.color ? mat.color.clone() : new THREE.Color(0.5, 0.5, 0.5);
  if (name === 'paint') return [M.Paint, livery.body.clone()];
  if (name === 'paint_roof') return [M.Paint, livery.roof.clone()];
  if (name === 'glass') return [part.startsWith('trim_mirror') ? M.Mirror : M.Glass, c];
  if (name === 'lamp_lens') return [part.startsWith('lamp_head') ? M.Headlamp : M.Lamp, c];
  if (name === 'lamp_red') return [M.Red, c];
  if (name === 'lamp_amber') return [M.Amber, c];
  if (name.startsWith('interior')) return [M.Fabric, c];
  if (name === 'trim_black' || name === 'tyre_rubber' || name === 'chassis_black') return [M.Rubber, c];
  if (name === 'trim_white' || name === 'wheel_white') return [M.Paint, c];
  return [M.Metal, c];
}

interface Soup {
  pos: number[];
  nrm: number[];
  col: number[];
  tag: number[];
  slot: number[];
}

function addMesh(
  soup: Soup,
  mesh: THREE.Mesh,
  part: string,
  livery: Livery,
  map: (v: THREE.Vector3) => void,
): void {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = geo.getAttribute('position'),
    n = geo.getAttribute('normal');
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: p.count, materialIndex: 0 }];
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const v = new THREE.Vector3(),
    nv = new THREE.Vector3();
  const zone = zoneOf(part);
  const first = soup.slot.length;
  for (const g of groups) {
    const [slot, colour] = slotAndColour(
      part,
      mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial,
      livery,
    );
    for (let i = g.start; i < Math.min(g.start + g.count, p.count); i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      map(v);
      soup.pos.push(v.x, v.y, v.z);
      if (n) nv.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      else nv.set(0, 1, 0);
      soup.nrm.push(nv.x, nv.y, nv.z);
      soup.col.push(colour.r, colour.g, colour.b);
      soup.tag.push(zone);
      soup.slot.push(slot);
    }
  }
  if (part.startsWith('trim_mirror')) markMirrorGlass(soup, first);
  if (geo !== mesh.geometry) geo.dispose();
}

/**
 * The door mirrors' glass is chrome in the model, so it loaded as plain metal and the working
 * mirrors (which look for the Mirror slot) found nothing on this car. The flat chrome face that
 * looks straight back is the glass; its bevels and the reflector's edge stay metal, or each
 * would count as a mirror of its own.
 */
function markMirrorGlass(soup: Soup, first: number): void {
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = first; i + 2 < soup.slot.length; i += 3) {
    if (soup.slot[i] !== M.Metal) continue;
    a.fromArray(soup.pos, i * 3);
    b.fromArray(soup.pos, i * 3 + 3).sub(a);
    c.fromArray(soup.pos, i * 3 + 6).sub(a);
    if (b.cross(c).normalize().z > 0.99) soup.slot[i] = soup.slot[i + 1] = soup.slot[i + 2] = M.Mirror;
  }
}

function soupGeometry(s: Soup): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((s.pos.length / 3) * 2), 2));
  geo.setAttribute('tag', new THREE.Float32BufferAttribute(s.tag, 1));
  geo.setAttribute('materialSlot', new THREE.Float32BufferAttribute(s.slot, 1));
  return geo;
}

/**
 * Wheels, the code cabin and the moving axles stay out. The stock bumpers are left out too:
 * the touring bull bar and the rear bar take their place, and the two together z-fought. So
 * is the model's door-mounted spare carrier: the spare hangs on the swing-away carrier in
 * vehicleEquipment.ts.
 */
const skipInBody =
  /^(wheel_|interior_|chassis_axle|chassis_spring|trim_bumper_|trim_reflector|trim_spare_carrier)/;

/** The GLB body in the game's attributes, with the code cabin, rack, roof spare and aerial. */
export function buildFj40GlbBody(
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
  livery: Livery = standardLivery,
): THREE.BufferGeometry {
  if (!gltfRoot) throw new Error('fj40.glb not loaded');
  // ?fj40paint=b22d1f tries another body colour (test branch only); otherwise the livery's.
  const paint = new URLSearchParams(location.search).get('fj40paint');
  if (paint && /^[0-9a-f]{6}$/i.test(paint)) livery = { ...livery, body: new THREE.Color(`#${paint}`) };
  const soup: Soup = { pos: [], nrm: [], col: [], tag: [], slot: [] };
  gltfRoot.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const part = partName(o);
    if (skipInBody.test(part)) return;
    addMesh(soup, o as THREE.Mesh, part, livery, (v) => {
      v.y += LIFT;
      if (part.startsWith('spare')) {
        v.x += SPARE_SHIFT.x;
        v.y += SPARE_SHIFT.y;
        v.z += SPARE_SHIFT.z;
      }
    });
  });
  const glb = soupGeometry(soup);
  const b = new VehicleBuilder();
  // The cab sits 0.12 m lower than in the code body, the tub is narrower (0.775 m a side) and
  // the screen's inner face is at z -0.29, so the dash stops there instead of 0.11 m ahead of it.
  addVehicleInterior(b, tuning.engine.redlineRpm, {
    cabin: vehicles.shortie.cabin,
    drop: FJ40_CAB_DROP,
    // The model has its own boxes over the rear wheels (chassis_tub_l/r).
    boxOuter: 0,
    dashDepth: 0.07,
    // The tubs' inner walls are at x 0.40; a wider floor showed in the arches as a bar.
    rearFloor: 0.78,
  });
  addFj40GlbEquipment(b, tuning, wheel);
  const code = b.build();
  const merged = mergeGeometries([glb, code]);
  glb.dispose();
  code.dispose();
  if (!merged) throw new Error('fj40: could not merge GLB and code geometry');
  return cleanGeometry(merged);
}

/**
 * The GLB's right front wheel (its outer face to +X) as the one wheel all four share: the outer
 * half mirrored onto the inner side, with the inner side's rim and hub dark, scaled to the
 * physics radius. The left wheels are turned round (VehicleLook.handedWheels).
 */
export function buildFj40GlbWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  if (!gltfRoot) throw new Error('fj40.glb not loaded');
  const node = gltfRoot.getObjectByName('wheel_fr');
  if (!node) throw new Error('fj40.glb has no wheel_fr');
  const hub = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
  const k = tuning.wheelRadius / GLB_TYRE_R;
  const half: Soup = { pos: [], nrm: [], col: [], tag: [], slot: [] };
  node.traverse((o) => {
    if ((o as THREE.Mesh).isMesh)
      addMesh(half, o as THREE.Mesh, 'wheel_fr', standardLivery, (v) => void v.sub(hub).multiplyScalar(k));
  });
  const out: Soup = { pos: [], nrm: [], col: [], tag: [], slot: [] };
  for (let t = 0; t < half.pos.length / 9; t++) {
    // Keep every triangle that reaches the outer half and flatten the rest of it onto the
    // centre plane. Dropping a triangle by its centre left half of each centre-rib quad
    // out, a see-through zig-zag round the tread.
    const xs = [half.pos[t * 9], half.pos[t * 9 + 3], half.pos[t * 9 + 6]];
    if (Math.max(...xs) <= 1e-6) continue;
    for (const mirror of [1, -1]) {
      const order = mirror === 1 ? [0, 1, 2] : [0, 2, 1];
      for (const j of order) {
        const i = t * 3 + j;
        out.pos.push(mirror * Math.max(0, half.pos[i * 3]), half.pos[i * 3 + 1], half.pos[i * 3 + 2]);
        out.nrm.push(mirror * half.nrm[i * 3], half.nrm[i * 3 + 1], half.nrm[i * 3 + 2]);
        // The inner side is the back of the wheel: the tyre as it is, the rest dark like a
        // brake drum, where it used to be a second white disc with its own hub cap.
        const back = mirror === -1 && half.slot[i] !== M.Rubber;
        if (back) out.col.push(0.06, 0.06, 0.055);
        else out.col.push(half.col[i * 3], half.col[i * 3 + 1], half.col[i * 3 + 2]);
        out.tag.push(Z.Trim);
        out.slot.push(back ? M.Metal : half.slot[i]);
      }
    }
  }
  return cleanGeometry(soupGeometry(out));
}

/** Headlamp lens centres on the GLB (lamp_head_l/r), in the game frame. */
export function fj40GlbHeadlamps(): Vec3[] {
  const out: Vec3[] = [];
  for (const name of ['lamp_head_l', 'lamp_head_r']) {
    const o = gltfRoot?.getObjectByName(name);
    if (!o) continue;
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    out.push({ x: c.x, y: c.y + LIFT, z: box.min.z });
  }
  return out;
}
