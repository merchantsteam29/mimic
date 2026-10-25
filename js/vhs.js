// Found-footage camcorder look: the scene renders into a small (VHS-sized) target, then one
// full-screen pass adds tape grain, colour bleed, scanlines, tracking wobble, lens bulge and
// dropouts. `distort` (0..1) tears it all up: when it's close, when it gets you.
import * as THREE from 'three';

const frag = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float time;
  uniform float distort;
  uniform vec2 res;
  varying vec2 vUv;
  float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    vec2 uv = 0.5 + c * (1.0 + 0.07 * r2 + distort * 0.25 * r2);           // lens bulge
    float line = floor(uv.y * res.y);
    float wob = (rand(vec2(line, floor(time * 30.0))) - 0.5) * (0.0012 + distort * 0.03);
    float bandPos = fract(time * 0.07);                                       // a tracking band rolling up
    float band = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - bandPos));
    uv.x += wob + band * (0.006 + distort * 0.02);
    if (distort > 0.5) uv.y += (rand(vec2(floor(time * 12.0), 3.0)) - 0.5) * (distort - 0.5) * 0.12; // vertical roll
    float ab = 0.0016 + distort * 0.012;                                      // colour bleed
    vec3 col = vec3(texture2D(tDiffuse, uv + vec2(ab, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ab, 0.0)).b);
    col = toneMapping(col);
    col = linearToOutputTexel(vec4(col, 1.0)).rgb;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, 0.55) * vec3(0.96, 1.02, 0.9);                    // washed-out tape colour
    col = max(col - 0.01, 0.0) * 1.02;                                        // slightly crushed blacks
    col += band * 0.035;
    col += (rand(uv * res + fract(time) * 91.0) - 0.5) * (0.07 + distort * 0.35); // grain
    col += step(0.9988 - distort * 0.02, rand(vec2(floor(time * 24.0), line))) * 0.45; // dropouts
    col *= 0.9 + 0.1 * sin(vUv.y * res.y * 3.14159);                          // scanlines
    col *= 1.0 - smoothstep(0.35, 0.9, length(c)) * 0.6;                       // vignette
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class VHS {
  constructor(renderer, lines = 360) {
    this.r = renderer;
    this.lines = lines;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, time: { value: 0 }, distort: { value: 0 }, res: { value: new THREE.Vector2(4, 4) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: frag,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.resize();
  }

  resize() {
    const h = this.lines, w = Math.round((h * innerWidth) / innerHeight);
    this.target.setSize(w, h);
    this.mat.uniforms.res.value.set(w, h);
  }

  render(scene, camera, time, distort = 0) {
    this.r.setRenderTarget(this.target);
    this.r.render(scene, camera);
    this.r.setRenderTarget(null);
    this.mat.uniforms.time.value = time;
    this.mat.uniforms.distort.value = Math.min(1, Math.max(0, distort));
    this.r.render(this.scene, this.cam);
  }
}
