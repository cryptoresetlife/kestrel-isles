// Sky dome, sun, fog and lighting for each time of day.
import * as THREE from 'three';

export const TIMES_OF_DAY = {
  morning: { zenith: 0x3d7fd1, horizon: 0xcfe4f2, ground: 0x9fb8c8, sun: 0xfff0d6, sunElev: 24, sunAz: 115, sunI: 2.6, hemi: 1.05, fog: 0xc4dceb, fogDensity: 0.00011, glow: 0xffe0b0 },
  noon: { zenith: 0x2f6fcf, horizon: 0xbfdcf3, ground: 0x8fb0c0, sun: 0xffffff, sunElev: 58, sunAz: 160, sunI: 2.9, hemi: 1.1, fog: 0xbfd9ee, fogDensity: 0.00009, glow: 0xfff6dc },
  golden: { zenith: 0x4669b3, horizon: 0xf4c58f, ground: 0xa08a7a, sun: 0xffc37a, sunElev: 9, sunAz: 255, sunI: 2.5, hemi: 0.8, fog: 0xe8c39c, fogDensity: 0.00012, glow: 0xff9a4a },
  dusk: { zenith: 0x18265a, horizon: 0xd98a5f, ground: 0x4c4258, sun: 0xff9a5a, sunElev: 4, sunAz: 262, sunI: 1.5, hemi: 0.58, fog: 0x7d6a80, fogDensity: 0.00014, glow: 0xff6a3a },
};

function sunDirection(t) {
  const el = THREE.MathUtils.degToRad(t.sunElev), az = THREE.MathUtils.degToRad(t.sunAz);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor, uGlow; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.7, h), 0.75)) : mix(uHorizon, uGround, smoothstep(0.0, -0.15, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += uGlow * pow(s, 6.0) * 0.45 * (1.0 - smoothstep(0.0, 0.6, h) * 0.6);
          col += uSunColor * smoothstep(0.9993, 0.99975, s) * 2.0;
          col += uSunColor * pow(s, 300.0) * 0.8;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    scene.add(dome);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5d6b45, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.4;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0001);
    this.sunDir = new THREE.Vector3();
    this.renderer = renderer;
  }

  /** Switches the whole look of the world to one of TIMES_OF_DAY. */
  apply(name) {
    const t = TIMES_OF_DAY[name] || TIMES_OF_DAY.morning;
    this.name = name;
    this.preset = t;
    const u = this.uniforms;
    u.uZenith.value.set(t.zenith); u.uHorizon.value.set(t.horizon); u.uGround.value.set(t.ground);
    u.uSunColor.value.set(t.sun); u.uGlow.value.set(t.glow);
    this.sunDir.copy(sunDirection(t));
    u.uSunDir.value.copy(this.sunDir);
    this.sun.color.set(t.sun); this.sun.intensity = t.sunI;
    this.hemi.intensity = t.hemi;
    this.hemi.color.set(t.horizon).lerp(new THREE.Color(0xffffff), 0.4);
    this.scene.fog.color.set(t.fog);
    this.scene.fog.density = t.fogDensity;
    this.isNight = t.sunElev < 6;
  }

  /** Keeps the dome around the camera and the shadow box around the aircraft. */
  update(camera, focus) {
    this.dome.position.copy(camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 400);
    this.sun.target.position.copy(focus);
  }
}
