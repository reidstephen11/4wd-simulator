import * as THREE from 'three';
import { plankTuning } from '../data/tools';
import type { VehicleTools } from '../sim/tools/tools';
import { anchorPoint } from '../sim/tools/anchors';
import type { PlankPose, GroundProbe } from '../sim/tools/planks';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';
import { followBody } from './followBody';

const SEGMENTS = 24;
const RADIAL = 5;
const CABLE_R = 0.028;
/** The anchor chooser's bar along where the cable would run: its radius, and the cylinder's own axis. */
const PREVIEW_RADIUS = 0.035;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Winch cable, tree strap, placed planks and the see-through plank preview.
 * Everything is driven from sim state each frame.
 */
export class ToolsView {
  readonly group = new THREE.Group();
  private readonly cable: THREE.Mesh;
  private readonly cablePos: Float32Array;
  private readonly returnCable: THREE.Mesh;
  private readonly pulley: THREE.Mesh;
  private readonly strap: THREE.Mesh;
  private readonly plankGeo: THREE.BufferGeometry;
  private readonly plankMat: THREE.MeshLambertMaterial;
  private readonly ghostMat: THREE.MeshBasicMaterial;
  private readonly planks = new Map<number, THREE.Mesh>();
  private readonly livePlanks = new Set<number>();
  private readonly ghosts: THREE.Mesh[] = [];
  private readonly highlight: THREE.Mesh;
  /** Fainter rings on the other anchors in reach while choosing one. */
  private readonly others: THREE.Mesh[] = [];
  private readonly othersMat: THREE.MeshBasicMaterial;
  /** Dashed line from the winch to the anchor being chosen. */
  private readonly preview: THREE.Mesh;
  private readonly previewTo = new THREE.Vector3();
  private readonly tmpP = { x: 0, y: 0, z: 0 };
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor() {
    this.group.name = 'tools';
    // Cable: a thin tube rebuilt in place each frame.
    const ringCount = SEGMENTS + 1;
    this.cablePos = new Float32Array(ringCount * RADIAL * 3);
    const idx: number[] = [];
    for (let s = 0; s < SEGMENTS; s++)
      for (let r = 0; r < RADIAL; r++) {
        const a = s * RADIAL + r;
        const b = s * RADIAL + ((r + 1) % RADIAL);
        const c = (s + 1) * RADIAL + r;
        const d = (s + 1) * RADIAL + ((r + 1) % RADIAL);
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.cablePos, 3));
    geo.setIndex(idx);
    this.cable = new THREE.Mesh(
      geo,
      patchFog(new THREE.MeshLambertMaterial({ color: pal('vehicleTrim'), flatShading: true })),
    );
    this.cable.frustumCulled = false;
    this.cable.visible = false;
    this.cable.castShadow = true;
    this.group.add(this.cable);
    this.returnCable = this.cable.clone();
    this.returnCable.geometry = geo.clone();
    this.returnCable.name = 'snatch-block-return-line';
    this.group.add(this.returnCable);
    this.pulley = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.045, 6, 12),
      patchFog(new THREE.MeshLambertMaterial({ color: '#B34328' }), 'snatch-block'),
    );
    this.pulley.name = 'snatch-block';
    const sheave = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.055, 12),
      patchFog(new THREE.MeshLambertMaterial({ color: '#686C6A' }), 'snatch-sheave'),
    );
    sheave.rotation.x = Math.PI / 2;
    this.pulley.add(sheave);
    this.pulley.visible = false;
    this.group.add(this.pulley);

    this.strap = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.16, 12, 1, true),
      patchFog(
        new THREE.MeshLambertMaterial({ color: '#D69C37', side: THREE.DoubleSide, flatShading: true }),
        'strap',
      ),
    );
    this.strap.name = 'tree-protector';
    this.strap.visible = false;
    this.group.add(this.strap);

    const b = new MeshBuilder(12);
    b.box(plankTuning.width, plankTuning.thickness, plankTuning.length, pal('barkOchre'), [1, 1, 4]);
    // Cleats across the top for grip.
    for (let i = 0; i < 6; i++) {
      b.push().translate(0, plankTuning.thickness / 2 + 0.01, -plankTuning.length / 2 + 0.25 + i * 0.38);
      b.box(plankTuning.width * 0.95, 0.02, 0.05, pal('dirtDark'));
      b.pop();
    }
    this.plankGeo = b.build();
    this.plankMat = patchFog(new THREE.MeshLambertMaterial({ vertexColors: true }), 'plank');
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: pal('vehicleRoof'),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(plankTuning.width, plankTuning.thickness, plankTuning.length),
        this.ghostMat,
      );
      g.visible = false;
      g.renderOrder = 20;
      this.ghosts.push(g);
      this.group.add(g);
    }
    this.highlight = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.05, 4, 16),
      new THREE.MeshBasicMaterial({
        color: pal('vehicleRoof'),
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      }),
    );
    this.highlight.rotation.x = Math.PI / 2;
    this.highlight.renderOrder = 30;
    this.highlight.visible = false;
    this.group.add(this.highlight);
    this.othersMat = new THREE.MeshBasicMaterial({
      color: pal('vehicleRoof'),
      transparent: true,
      opacity: 0.35,
      depthTest: false,
    });
    // Where the cable would run: a bright bar 7 cm thick, drawn over everything, so the pull's
    // direction reads at a glance (a one-pixel dashed line until v2.19).
    this.preview = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ffc247',
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.preview.frustumCulled = false;
    this.preview.renderOrder = 30;
    this.preview.visible = false;
    this.group.add(this.preview);
  }

  /** `alpha`: where placed planks are drawn between physics steps (0 = before the last, 1 = after). */
  update(v: Vehicle, tools: VehicleTools, probe: GroundProbe, time: number, alpha = 1): void {
    this.updateCable(v, tools);
    this.updatePlanks(tools, alpha);
    this.updatePreview(v, tools, probe);
    this.updateHighlight(v, tools, time);
  }

  private updateCable(v: Vehicle, tools: VehicleTools): void {
    const w = tools.winch;
    if (!w.anchor) {
      this.cable.visible = false;
      this.returnCable.visible = false;
      this.pulley.visible = false;
      this.strap.visible = false;
      return;
    }
    const t = v.tuning;
    const a = v.localToWorld(t.winchMount.x, t.winchMount.y, t.winchMount.z);
    const b = w.anchorPos;
    this.tmpA.set(a.x, a.y, a.z);
    this.tmpB.set(b.x, b.y - (w.doubleLine ? 0.095 : 0), b.z);
    this.drawCable(this.cable, this.cablePos, w.length / (w.doubleLine ? 2 : 1));
    this.returnCable.visible = w.doubleLine;
    this.pulley.visible = w.doubleLine;
    if (w.doubleLine) {
      this.tmpA.set(w.returnMount.x, w.returnMount.y, w.returnMount.z);
      this.tmpB.y = b.y + 0.095;
      this.drawCable(
        this.returnCable,
        this.returnCable.geometry.getAttribute('position').array as Float32Array,
        w.length / 2,
      );
      this.pulley.position.set(b.x, b.y, b.z);
      this.pulley.rotation.y = Math.atan2(a.x - b.x, a.z - b.z) + Math.PI / 2;
    }
    // Strap round trees and the fallen log.
    const anc = w.anchor;
    this.strap.visible = anc.kind === 'tree' || anc.kind === 'object';
    if (this.strap.visible) {
      const centre = anchorPoint(anc, this.tmpP);
      this.strap.position.set(centre.x, centre.y, centre.z);
      const r = anc.radius + 0.04;
      this.strap.scale.set(r, 1, r);
    }
  }

  private drawCable(mesh: THREE.Mesh, positions: Float32Array, length: number): void {
    const d = this.tmpA.distanceTo(this.tmpB);
    // Sag when slack: a parabola deep enough to use up the extra cable.
    const slack = Math.max(0, length - d);
    const sag = slack > 0.01 ? Math.min(3, Math.sqrt(slack * d * 0.375)) : 0;
    const dir = this.tmpB.clone().sub(this.tmpA).normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    const p = new THREE.Vector3();
    for (let s = 0; s <= SEGMENTS; s++) {
      const u = s / SEGMENTS;
      p.copy(this.tmpA).lerp(this.tmpB, u);
      p.y -= sag * 4 * u * (1 - u);
      for (let r = 0; r < RADIAL; r++) {
        const ang = (r / RADIAL) * Math.PI * 2;
        const o = (s * RADIAL + r) * 3;
        positions[o] = p.x + (side.x * Math.cos(ang) + up.x * Math.sin(ang)) * CABLE_R;
        positions[o + 1] = p.y + (side.y * Math.cos(ang) + up.y * Math.sin(ang)) * CABLE_R;
        positions[o + 2] = p.z + (side.z * Math.cos(ang) + up.z * Math.sin(ang)) * CABLE_R;
      }
    }
    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.visible = true;
  }

  private updatePlanks(tools: VehicleTools, alpha: number): void {
    const live = this.livePlanks;
    live.clear();
    for (const pl of tools.planks.placed) {
      live.add(pl.id);
      let m = this.planks.get(pl.id);
      if (!m) {
        m = new THREE.Mesh(this.plankGeo, this.plankMat);
        m.castShadow = true;
        m.receiveShadow = true;
        this.planks.set(pl.id, m);
        this.group.add(m);
      }
      followBody(m, pl, alpha);
    }
    for (const [id, m] of this.planks)
      if (!live.has(id)) {
        this.group.remove(m);
        this.planks.delete(id);
      }
  }

  private updatePreview(v: Vehicle, tools: VehicleTools, probe: GroundProbe): void {
    const kit = tools.planks;
    const poses: PlankPose[] = kit.previewing ? kit.previewPoses(v, probe) : [];
    this.ghosts.forEach((g, i) => {
      const pose = poses[i];
      g.visible = !!pose;
      if (!pose) return;
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.set(0, 0, 0);
      g.rotateY(pose.yaw);
      g.rotateX(-pose.pitch);
    });
  }

  private updateHighlight(v: Vehicle, tools: VehicleTools, time: number): void {
    const list = tools.targeting;
    if (!list || list.length === 0) {
      this.highlight.visible = false;
      this.preview.visible = false;
      for (const o of this.others) o.visible = false;
      return;
    }
    const sel = Math.min(list.length - 1, tools.targetIndex);
    while (this.others.length < list.length) {
      const o = new THREE.Mesh(this.highlight.geometry, this.othersMat);
      o.rotation.x = Math.PI / 2;
      o.renderOrder = 29;
      this.others.push(o);
      this.group.add(o);
    }
    this.others.forEach((o, i) => {
      const a = list[i];
      o.visible = !!a && i !== sel;
      if (!o.visible) return;
      const p = anchorPoint(a, this.tmpP);
      o.position.set(p.x, p.y + 0.3, p.z);
      const r = Math.max(0.5, a.radius + 0.4);
      o.scale.set(r, r, 1);
    });
    const a = list[sel];
    const p = anchorPoint(a, this.tmpP);
    this.highlight.visible = true;
    this.highlight.position.set(p.x, p.y + 0.3 + Math.sin(time * 4) * 0.1, p.z);
    const r = Math.max(0.5, a.radius + 0.4);
    this.highlight.scale.set(r, r, 1);
    // Where the cable would run.
    const m = v.tuning.winchMount;
    const w = v.localToWorld(m.x, m.y, m.z);
    const to = this.previewTo.set(p.x - w.x, p.y + 0.3 - w.y, p.z - w.z);
    const length = Math.max(0.01, to.length());
    this.preview.position.set(w.x + to.x / 2, w.y + to.y / 2, w.z + to.z / 2);
    this.preview.quaternion.setFromUnitVectors(UP, to.divideScalar(length));
    this.preview.scale.set(PREVIEW_RADIUS, length, PREVIEW_RADIUS);
    this.preview.visible = true;
  }
}
