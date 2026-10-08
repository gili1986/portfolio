/* ── Hero · glass G ──────────────────────────────────────────────────
   The logo mark extruded from assets/brand/glogo.svg and rendered as
   clear glass. It leans toward the cursor, drifts a little when left
   alone, and sits a hair off the page with a soft shadow.

   The glass is a small custom shader rather than three's physical
   transmission: on a near-white page there is nothing for real
   refraction to bend, so it reads as plastic. Here the face looks
   straight through to the page colour, and the bevels and side walls,
   where light bends hardest, pick up a quiet grey studio with two
   soft boxes, split slightly by colour. Reflections ride on top with
   a Fresnel falloff. The studio lives in view space, so when the mark
   tilts the highlights glide across it. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const host = document.querySelector('.hero-logo');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (host) init().catch(() => host.remove());

async function init() {
  const svg = await fetch('/assets/brand/glogo.svg').then(r => r.text());

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 9);

  /* Mark */
  const shapes = new SVGLoader().parse(svg).paths.flatMap(p => SVGLoader.createShapes(p));
  // Depth and bevel are tuned against a mark 296 units tall; scale them to the SVG's real size
  const box = new THREE.Box2().setFromPoints(shapes.flatMap(sh => sh.getPoints()));
  const H = box.max.y - box.min.y, u = H / 296;
  let geo = new THREE.ExtrudeGeometry(shapes, {
    depth: 44 * u, curveSegments: 12,
    // a negative offset insets the face so the bevel lands on the SVG outline
    bevelEnabled: true, bevelThickness: 18 * u, bevelSize: 7 * u, bevelOffset: -7 * u, bevelSegments: 8,
  });
  geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(40));   // smooth curves, keep true corners
  // ...but keep the flat faces dead flat, or the long cap triangles smear the bevel's normals
  const cap = geo.groups.find(g => g.materialIndex === 0);
  const nrm = geo.attributes.normal;
  for (let i = cap.start; i < cap.start + cap.count; i++) nrm.setXYZ(i, 0, 0, Math.sign(nrm.getZ(i)) || 1);
  geo.center();
  geo.rotateX(Math.PI);               // SVG y runs down; rotate (not mirror) to keep winding
  const s = 2.27 / H;
  geo.scale(s, s, s);

  const glass = new THREE.ShaderMaterial({
    uniforms: {
      uPaper: { value: new THREE.Vector3(0.996, 0.996, 0.992) },   // --bg, sRGB
    },
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vP;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uPaper;
      varying vec3 vN;
      varying vec3 vP;

      // View-space studio, lit the way glass is photographed: a white
      // sweep above, a grey floor, and dark cards at the sides so the
      // edges draw themselves. A key light sits up and to the left.
      vec3 studio(vec3 d){
        float sky = smoothstep(-0.08, 0.1, d.y);
        vec3 c = mix(vec3(0.66), vec3(0.98), sky);
        float cardL = smoothstep(-0.55, -0.75, d.x);
        float cardR = smoothstep(0.6, 0.8, d.x) * (1.0 - smoothstep(0.86, 0.9, d.x));
        c = mix(c, vec3(0.21), max(cardL, cardR) * 0.35);
        float key = smoothstep(0.85, 0.95, dot(d, normalize(vec3(-0.45, 0.7, 0.55))));
        c += key * 0.6;
        return c;
      }

      vec3 through(vec3 V, vec3 N, float eta){
        vec3 R = refract(-V, N, eta);
        float bend = smoothstep(0.08, 0.55, length(R.xy));    // face: straight through · bevel: bent
        return mix(uPaper, studio(normalize(R)), bend);
      }

      void main(){
        vec3 N = normalize(vN);
        N = faceforward(N, vP, N);
        vec3 V = normalize(-vP);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        // refraction, each channel bent a touch differently
        vec3 col = vec3(
          through(V, N, 1.0 / 1.47).r,
          through(V, N, 1.0 / 1.50).g,
          through(V, N, 1.0 / 1.54).b
        );
        col *= 0.98;                                           // the faintest body density

        // reflection with Fresnel
        float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        vec3 refl = studio(reflect(-V, N));
        col = mix(col, refl, F * 0.9);

        // a crisp, quiet line where the face turns into the bevel
        float edge = smoothstep(0.55, 0.35, ndv) * smoothstep(0.05, 0.3, ndv);
        col = mix(col, col * 0.9, edge * 0.35);

        // soft sheen across the face from the key light
        float sheen = pow(max(dot(reflect(-V, N), normalize(vec3(-0.35, 0.45, 0.82))), 0.0), 18.0);
        col += sheen * 0.22;

        gl_FragColor = vec4(min(col, 1.0), 1.0);
      }`,
  });

  const mark = new THREE.Mesh(geo, glass);
  mark.castShadow = true;
  const rig = new THREE.Group();
  rig.add(mark);
  scene.add(rig);

  /* Shadow · a near-frontal light and a "page" just behind the mark,
     so the shadow stays close and soft instead of sliding away */
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-0.9, 2.4, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 34;
  sun.shadow.blurSamples = 24;
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 4, far: 14 });
  scene.add(sun);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ color: 0x111111, opacity: 0.04 })
  );
  wall.position.z = -0.75;
  wall.receiveShadow = true;
  scene.add(wall);

  /* Place · the mark lives in the free space right of the headline.
     The headline's width depends on the viewport and the font, so the
     mark measures where the text actually ends, takes the room left up
     to the page's content edge, and sits right-aligned to it, centred
     on the headline and intro. Too little room and it steps aside. */
  const hero = host.closest('.hero');
  const head = hero.querySelector('h1');
  const intro = hero.querySelector('.sub');
  const LOGO_SHARE = 0.52;     // the mark's width as a share of the canvas
  const GAP = 56, MAX_W = 380, MIN_W = 180, SCALE = 0.8;   // the mark fills 80% of the room it gets
  let fits = true;

  function place() {
    const hb = hero.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(head);
    const textRight = Math.max(...[...range.getClientRects()].map(r => r.right), intro.getBoundingClientRect().right);
    // The page grid's right content edge (a 1440 .wrap with 40px gutters,
    // where the nav clock sits). The hero's own .wrap shrinks to its copy.
    const vw = document.documentElement.clientWidth;
    const edge = (vw + Math.min(vw, 1440)) / 2 - 40;

    const room = edge - textRight;
    const logoW = Math.min(room - GAP, MAX_W) * SCALE;
    fits = logoW >= MIN_W;
    host.style.visibility = fits ? '' : 'hidden';
    if (fits) {
      const size = logoW / LOGO_SHARE;
      const top = head.getBoundingClientRect().top, bottom = intro.getBoundingClientRect().bottom;
      // a step in from the edge: 10% of the room, never closer than GAP to the copy
      const shift = Math.max(0, Math.min(room * 0.1, room - GAP - logoW));
      const cx = edge - shift - logoW / 2 - hb.left;
      const cy = top + (bottom - top) * 0.46 - hb.top;
      Object.assign(host.style, {
        width: `${size}px`, height: `${size}px`,
        left: `${cx - size / 2}px`, top: `${cy - size / 2}px`,
      });
    }
    sync();
  }

  /* Size */
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (still) draw(0);
  }

  /* Pointer · aim is -1..1 around the mark, eased in the loop */
  const REST = { x: 0.06, y: -0.2 };
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

    rig.rotation.y = REST.y + cur.x * 0.42 + Math.sin(t * 0.45) * 0.04 - (1 - ease) * 0.8;
    rig.rotation.x = REST.x + cur.y * 0.26 + Math.cos(t * 0.38) * 0.025;
    rig.rotation.z = -cur.x * 0.03;
    rig.position.y = Math.sin(t * 0.6) * 0.035;
    rig.scale.setScalar(0.94 + 0.06 * ease);

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
    const should = fits && onScreen && !document.hidden;
    if (should && !running) { running = true; clock.start(); requestAnimationFrame(frame); }
    if (!should) { running = false; clock.stop(); }
  }

  new ResizeObserver(resize).observe(host);
  new ResizeObserver(place).observe(hero);
  document.fonts.ready.then(place);
  place();
  resize();

  if (!still) {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(host);
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  requestAnimationFrame(() => host.classList.add('ready'));
}
