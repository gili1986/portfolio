/* ── Hero · glass G ──────────────────────────────────────────────────
   The logo mark extruded from assets/brand/glogo.svg and rendered as
   clear glass. It leans toward the cursor, drifts a little when left
   alone, and casts a faint shadow on the page behind it.

   Clear glass on a near-white page has nothing to bend, so it would
   read as white plastic. A backdrop plane sits behind the mark with a
   studio horizon (light above, a fine dark line, grey below) and a
   faint wash of the accent. It is drawn only into three's transmission
   pass, the image the glass samples, and discarded on the visible
   pass: the page never shows it, only the glass does. Tilting the mark
   slides the horizon through it, which is what sells the glass. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const host = document.querySelector('.hero-logo');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (host) init().catch(() => host.remove());

async function init() {
  const svg = await fetch('/assets/brand/glogo.svg').then(r => r.text());

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 9);

  /* Mark */
  const shapes = new SVGLoader().parse(svg).paths.flatMap(p => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: 46, curveSegments: 7,
    // a negative offset insets the face so the bevel lands on the SVG outline
    bevelEnabled: true, bevelThickness: 16, bevelSize: 6, bevelOffset: -6, bevelSegments: 10,
  });
  geo.center();
  geo.rotateX(Math.PI);               // SVG y runs down; rotate (not mirror) to keep winding
  const s = 1.72 / 296;
  geo.scale(s, s, s);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 1.6,
    ior: 1.6,
    dispersion: 4,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    iridescence: 0.1,
    iridescenceIOR: 1.3,
    envMapIntensity: 1.1,
  });

  const mark = new THREE.Mesh(geo, glass);
  mark.castShadow = true;
  const rig = new THREE.Group();
  rig.add(mark);
  scene.add(rig);

  /* Light + shadow catcher (the "page" the mark floats above) */
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-3, 4, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 18;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
  scene.add(sun);

  const WALL_Z = -1.3;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShadowMaterial({ color: 0x1a1830, opacity: 0.06 })
  );
  wall.position.z = WALL_Z;
  wall.receiveShadow = true;
  scene.add(wall);

  /* Backdrop · seen only through the glass */
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: {
        uShow: { value: 0 },
        uTime: { value: 0 },
        uInk: { value: new THREE.Color('#5b3df5') },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uShow, uTime;
        uniform vec3 uInk;
        varying vec2 vUv;
        void main(){
          if (uShow < 0.5) discard;
          vec2 p = vUv - 0.5;
          float y = p.y + p.x * 0.12;
          // paper above, grey floor below, a fine dark horizon between
          vec3 c = mix(vec3(0.7, 0.695, 0.735), vec3(0.99, 0.988, 0.984), smoothstep(-0.1, 0.03, y));
          c = mix(c, vec3(0.36, 0.35, 0.42), exp(-pow((y + 0.03) / 0.005, 2.0)) * 0.75);
          c = mix(c, vec3(0.5, 0.49, 0.55), smoothstep(-0.08, -0.45, y) * 0.55);
          // a soft window of light on the left
          c = mix(c, vec3(1.0), exp(-pow((p.x + 0.18) / 0.02, 2.0)) * smoothstep(-0.02, 0.2, y) * 0.9);
          // a slow breath of the accent
          vec2 o = vec2(-0.06 + 0.03 * sin(uTime * 0.3), 0.16 + 0.02 * cos(uTime * 0.23));
          c = mix(c, uInk, smoothstep(0.34, 0.0, length(p - o)) * 0.16);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  backdrop.position.z = WALL_Z + 0.01;
  // getRenderTarget() is the transmission target during that pass, null on the visible one
  backdrop.onBeforeRender = r => { backdrop.material.uniforms.uShow.value = r.getRenderTarget() ? 1 : 0; };
  scene.add(backdrop);

  /* Size · the backdrop always fills the frame */
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - backdrop.position.z);
    backdrop.scale.set(h * camera.aspect, h, 1);
    if (still) draw(0);
  }

  /* Pointer · aim is -1..1 around the mark, eased in the loop */
  const REST = { x: 0.08, y: -0.24 };
  const aim = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  let lastMove = 0;
  if (!still) {
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = host.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      aim.x = THREE.MathUtils.clamp((e.clientX - cx) / (innerWidth * 0.5), -1, 1);
      aim.y = THREE.MathUtils.clamp((e.clientY - cy) / (innerHeight * 0.5), -1, 1);
      lastMove = performance.now();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { aim.x = aim.y = 0; });
  }

  const born = performance.now();

  function draw(t) {
    const now = performance.now();

    // Drift home after the cursor has been still for a while
    if (now - lastMove > 2600) { aim.x *= 0.985; aim.y *= 0.985; }
    cur.x += (aim.x - cur.x) * 0.045;
    cur.y += (aim.y - cur.y) * 0.045;

    // Entrance: swing in from a deeper angle over ~1.6s
    const ease = still ? 1 : 1 - Math.pow(1 - Math.min((now - born) / 1600, 1), 3);

    rig.rotation.y = REST.y + cur.x * 0.5 + Math.sin(t * 0.45) * 0.05 - (1 - ease) * 0.9;
    rig.rotation.x = REST.x + cur.y * 0.32 + Math.cos(t * 0.38) * 0.03;
    rig.rotation.z = -cur.x * 0.04;
    rig.position.y = Math.sin(t * 0.6) * 0.045;
    rig.scale.setScalar(0.92 + 0.08 * ease);

    backdrop.material.uniforms.uTime.value = t;
    renderer.render(scene, camera);
  }

  /* Loop · runs only while the hero is on screen and the tab is visible */
  const clock = new THREE.Clock(false);
  let running = false, onScreen = true, t = 0;

  function frame() {
    if (!running) return;
    t += Math.min(clock.getDelta(), 0.1);   // keeps its phase across pauses
    draw(t);
    requestAnimationFrame(frame);
  }

  function sync() {
    const should = onScreen && !document.hidden;
    if (should && !running) { running = true; clock.start(); requestAnimationFrame(frame); }
    if (!should) { running = false; clock.stop(); }
  }

  new ResizeObserver(resize).observe(host);
  resize();

  if (!still) {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(host);
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  requestAnimationFrame(() => host.classList.add('ready'));
}

/* A grey studio with a few soft boxes for the mark to reflect */
function studio() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){
        vec3 c = mix(vec3(0.16, 0.16, 0.19), vec3(0.62, 0.62, 0.66), smoothstep(-0.6, 0.9, normalize(vP).y));
        gl_FragColor = vec4(c, 1.0); }`,
    })
  ));
  const box = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(6, 1.2, [-4, 5, 5], 6);     // key strip, top left
  box(1.4, 7, [7, 1, 2], 3.2);    // tall rim, right
  box(5, 5, [0, 2, -8], 1.6);     // back fill
  box(3, 1, [-6, -2, 4], 1.2);    // low kicker
  return env;
}
