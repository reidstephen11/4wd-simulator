import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { vehicleLooks } from '../src/render/vehicleLooks';
import { vehicles } from '../src/data/vehicles';
import type { VehicleId } from '../src/data/vehicle';
import { mirrorSurfaces } from '../src/render/mirrorSurfaces';
import { fitMirrorView, WorkingMirrors } from '../src/render/workingMirrors';
import { VehicleModel } from '../src/render/vehicleModel';
import { qualityPresets } from '../src/data/quality';

describe('working mirrors', () => {
  for (const id of Object.keys(vehicleLooks) as VehicleId[]) {
    it(`${id}: extracts each rear-facing glass face after the body's final transforms`, () => {
      const tuning = vehicles[id].tuning;
      const wheel = vehicleLooks[id].wheel(tuning);
      const body = vehicleLooks[id].body(tuning, wheel);
      const faces = mirrorSurfaces(body);
      const expected =
        id === 'unimog' ? 4 : ['hilux', 'xtracab', 'hj60', 'mq', 'rangie', 'patrol'].includes(id) ? 3 : 2;
      expect(faces.length).toBe(expected);
      const outer = faces.filter((f) => Math.abs(f.position.x) > 0.7);
      expect(outer.some((f) => f.position.x < -0.7)).toBe(true);
      expect(outer.some((f) => f.position.x > 0.7)).toBe(true);
      for (const face of faces) {
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(face.rotation);
        expect(normal.z).toBeGreaterThan(0.7);
        face.geometry.computeBoundingBox();
        const size = face.geometry.boundingBox!.getSize(new THREE.Vector3());
        expect(size.x).toBeGreaterThan(0.08);
        expect(size.y).toBeGreaterThan(0.025);
        expect(size.z).toBeLessThan(0.0001);
        face.geometry.dispose();
      }
      body.dispose();
      wheel.dispose();
    });
  }

  it('crops the rearward camera to the entire glass while preserving the driver lens', () => {
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.04, 1800);
    camera.position.set(0.4, 1.1, 0.2);
    camera.updateMatrixWorld();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.14));
    glass.position.set(1, 1, -0.4);
    glass.rotation.y = -0.15;
    glass.updateMatrixWorld();
    const eye = new THREE.PerspectiveCamera();
    fitMirrorView(camera, glass, eye);
    expect(eye.aspect).toBe(camera.aspect);
    expect(eye.far).toBe(180);
    expect(eye.view!.width).toBeLessThan(0.5);
    expect(eye.view!.height).toBeLessThan(0.5);
    expect(eye.position.toArray()).toEqual(camera.position.toArray());
    glass.geometry.dispose();
  });

  it('allocates only in cockpit, budgets captures, hides recursive glass and frees swapped targets', () => {
    const model = new VehicleModel(vehicles.hilux.tuning);
    const scene = new THREE.Scene();
    scene.add(model.root);
    const camera = new THREE.PerspectiveCamera(110, 2, 0.04, 1800);
    camera.position.copy(vehicles.hilux.cabin.eye);
    scene.add(camera);
    const mirrors = new WorkingMirrors();
    mirrors.setVehicle(model);
    mirrors.update(null!, scene, camera, false, 0);
    expect(mirrors.targetCount).toBe(0);
    // Reflector only needs this WebGLRenderer surface; inspect what it tries to draw.
    const render = vi.fn(() => {
      scene.traverse((o) => {
        if (o.name === 'working-mirror') expect(o.visible).toBe(false);
      });
    });
    const renderer = {
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
      render,
      xr: { enabled: false },
      shadowMap: { autoUpdate: true },
      autoClear: true,
      state: { buffers: { depth: { setMask: vi.fn() } } },
    } as unknown as THREE.WebGLRenderer;
    mirrors.update(renderer, scene, camera, true, 0);
    expect(mirrors.targetCount).toBe(3);
    expect(render.mock.calls.length).toBe(1);
    mirrors.update(renderer, scene, camera, true, 1);
    expect(render.mock.calls.length).toBe(2);
    mirrors.update(renderer, scene, camera, false, 1000);
    expect(render.mock.calls.length).toBe(2);
    const disposed: ReturnType<typeof vi.fn>[] = [];
    model.bodyGroup.traverse((o) => {
      if (o.name !== 'working-mirror') return;
      const fn = vi.fn();
      o.addEventListener('removed', fn);
      disposed.push(fn);
    });
    mirrors.setQuality(qualityPresets.low);
    expect(mirrors.targetCount).toBe(0);
    expect(disposed.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    mirrors.setVehicle(null);
    model.dispose();
  });
});
