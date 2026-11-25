/** Optical regression rig: npm run dev, then node scripts/check-mirrors.mjs [baseURL] [screenshot]. */
import { chromium } from '@playwright/test';
const [baseURL = 'http://localhost:5173/', screenshot] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.STUDIO_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => console.log('ERROR', e.message));
await page.goto(new URL('scripts/studio/?vehicle=ute40', baseURL).href);
await page.waitForFunction(() => window.studio?.ready);
const result = await page.evaluate(async () => {
  const T = await import('/node_modules/.vite/deps/three.js');
  const { WorkingMirrors } = await import('/src/render/workingMirrors.ts');
  const { VehicleBuilder, VehicleMaterial } = await import('/src/render/vehicleGeometry.ts');
  const scene = new T.Scene();
  scene.background = new T.Color('black');
  const renderer = new T.WebGLRenderer();
  renderer.setSize(1000, 700);
  document.body.replaceChildren(renderer.domElement);
  const camera = new T.PerspectiveCamera(60, 1000 / 700, 0.04, 1000);
  camera.position.set(0, 0, 3);
  camera.updateMatrixWorld();
  const builder = new VehicleBuilder();
  builder.block(0, 0, 0, 1, 1, 0.01, new T.Color('white'), VehicleMaterial.Mirror);
  const body = new T.Mesh(builder.build(), new T.MeshBasicMaterial({ color: 'gray' }));
  const bodyGroup = new T.Group();
  bodyGroup.add(body);
  scene.add(bodyGroup);
  const model = { body, bodyGroup };
  const markers = new T.Group();
  for (const [x, c] of [
    [-0.7, 0xff0000],
    [0.7, 0x0000ff],
  ]) {
    const m = new T.Mesh(new T.BoxGeometry(0.6, 2, 0.1), new T.MeshBasicMaterial({ color: c }));
    m.position.set(x, 0, 5);
    markers.add(m);
  }
  scene.add(markers);
  // A green object behind the glass must be clipped out of its reflected view.
  const wrongSide = new T.Mesh(new T.BoxGeometry(4, 4, 0.1), new T.MeshBasicMaterial({ color: 0x00ff00 }));
  wrongSide.position.z = -1;
  scene.add(wrongSide);
  const mirrors = new WorkingMirrors();
  mirrors.setVehicle(model);
  mirrors.update(renderer, scene, camera, true, 0);
  renderer.render(scene, camera);

  const read = async () => {
    const mesh = bodyGroup.children.find((o) => o.name === 'working-mirror');
    const target = mesh.getRenderTarget();
    const p = new Uint16Array(target.width * target.height * 4);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, p);
    let red = 0,
      blue = 0,
      green = 0;
    let rx = 0,
      bx = 0;
    for (let i = 0; i < p.length; i += 4) {
      const r = T.DataUtils.fromHalfFloat(p[i]),
        g = T.DataUtils.fromHalfFloat(p[i + 1]),
        b = T.DataUtils.fromHalfFloat(p[i + 2]);
      if (r > 0.4 && b < 0.1 && g < 0.1) {
        red++;
        rx += (i / 4) % target.width;
      }
      if (b > 0.4 && r < 0.1 && g < 0.1) {
        blue++;
        bx += (i / 4) % target.width;
      }
      if (g > 0.4 && r < 0.1 && b < 0.1) green++;
    }
    return { red, blue, green, redX: rx / red, blueX: bx / blue };
  };
  const straight = await read();
  camera.position.x = 0.3;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  mirrors.update(renderer, scene, camera, true, 100);
  renderer.render(scene, camera);
  const moved = await read();
  return { straight, moved, captures: mirrors.captures };
});
console.log(JSON.stringify(result));
if (screenshot) await page.screenshot({ path: screenshot });
await browser.close();
if (
  result.straight.red < 200 ||
  result.straight.blue < 200 ||
  result.straight.green !== 0 ||
  result.straight.redX < result.straight.blueX ||
  Math.abs(result.moved.redX - result.straight.redX) < 2
)
  process.exit(1);
