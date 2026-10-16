import * as THREE from 'three';
import { plankTuning } from '../data/tools';
import type { VehicleTools } from '../sim/tools/tools';
import type { PlankPose, GroundProbe } from '../sim/tools/planks';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';

const SEGMENTS = 24;
const RADIAL = 5;
const CABLE_R = 0.028;

/**
 * Winch cable, tree strap, placed planks and the see-through plank preview.
 * Everything is driven from sim state each frame.
 */
export class ToolsView {
  readonly group = new THREE.Group();
  private readonly cable: THREE.Mesh;
  private readonly cablePos: Float32Array;
  private readonly strap: THREE.Mesh;
  private readonly plankGeo: THREE.BufferGeometry;
  private readonly plankMat: THREE.MeshLambertMaterial;
  private readonly ghostMat: THREE.MeshBasicMaterial;
  private readonly planks = new Map<number, THREE.Mesh>();
  private readonly ghosts: THREE.Mesh[] = [];
  private readonly highlight: THREE.Mesh;
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

    this.strap = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.06, 4, 10),
      patchFog(new THREE.MeshLambertMaterial({ color: pal('barkOchre'), flatShading: true }), 'strap'),
    );
    this.strap.rotation.x = Math.PI / 2;
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
  }

  update(v: Vehicle, tools: VehicleTools, probe: GroundProbe, time: number): void {
    this.updateCable(v, tools);
    this.updatePlanks(tools);
    this.updatePreview(v, tools, probe);
    this.updateHighlight(tools, time);
  }

  private updateCable(v: Vehicle, tools: VehicleTools): void {
    const w = tools.winch;
    if (!w.anchor) {
      this.cable.visible = false;
      this.strap.visible = false;
      return;
    }
    const t = v.tuning;
    const a = v.localToWorld(t.winchMount.x, t.winchMount.y, t.winchMount.z);
    const b = w.anchorPos;
    this.tmpA.set(a.x, a.y, a.z);
    this.tmpB.set(b.x, b.y, b.z);
    const d = this.tmpA.distanceTo(this.tmpB);
    // Sag when slack: a parabola deep enough to use up the extra cable.
    const slack = Math.max(0, w.length - d);
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
        this.cablePos[o] = p.x + (side.x * Math.cos(ang) + up.x * Math.sin(ang)) * CABLE_R;
        this.cablePos[o + 1] = p.y + (side.y * Math.cos(ang) + up.y * Math.sin(ang)) * CABLE_R;
        this.cablePos[o + 2] = p.z + (side.z * Math.cos(ang) + up.z * Math.sin(ang)) * CABLE_R;
      }
    }
    const attr = this.cable.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.cable.geometry.computeVertexNormals();
    this.cable.visible = true;
    // Strap round trees and the fallen log.
    const anc = w.anchor;
    this.strap.visible = anc.kind === 'tree' || anc.kind === 'object';
    if (this.strap.visible) {
      this.strap.position.copy(this.tmpB);
      const r = anc.radius + 0.04;
      this.strap.scale.set(r, r, 1);
    }
  }

  private updatePlanks(tools: VehicleTools): void {
    const live = new Set<number>();
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
      const p = pl.body.translation();
      const q = pl.body.rotation();
      m.position.set(p.x, p.y, p.z);
      m.quaternion.set(q.x, q.y, q.z, q.w);
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

  private updateHighlight(tools: VehicleTools, time: number): void {
    const list = tools.targeting;
    if (!list || list.length === 0) {
      this.highlight.visible = false;
      return;
    }
    const a = list[Math.min(list.length - 1, tools.targetIndex)];
    this.highlight.visible = true;
    this.highlight.position.set(a.point.x, a.point.y + 0.3 + Math.sin(time * 4) * 0.1, a.point.z);
    const r = Math.max(0.5, a.radius + 0.4);
    this.highlight.scale.set(r, r, 1);
  }
}
