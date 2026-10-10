import * as THREE from 'three'

export type DisplaceUniforms = {
  uDepth: { value: THREE.Texture | null }
  uStrength: { value: number }
  uInvert: { value: number }
  uPop: { value: number }
  uEdgeColor: { value: THREE.Color }
}

const PLANE_VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
float depthSample = texture2D(uDepth, uv).r;
if (uInvert > 0.5) depthSample = 1.0 - depthSample;
// Pin the border so the card edge stays put while the subject lifts off it.
float pin = smoothstep(0.0, 0.14, uv.x) * smoothstep(0.0, 0.14, 1.0 - uv.x);
pin *= smoothstep(0.0, 0.1, uv.y) * smoothstep(0.0, 0.1, 1.0 - uv.y);
float shaped = smoothstep(0.12, 0.92, depthSample);
transformed.z += shaped * uStrength * pin;
transformed.xy *= 1.0 + shaped * uPop * pin;
`

const STAGE_VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
float depthSample = texture2D(uDepth, uv).r;
if (uInvert > 0.5) depthSample = 1.0 - depthSample;
float pin = smoothstep(0.0, 0.1, uv.x) * smoothstep(0.0, 0.1, 1.0 - uv.x);
pin *= smoothstep(0.0, 0.08, uv.y) * smoothstep(0.0, 0.08, 1.0 - uv.y);
float shaped = smoothstep(0.08, 0.9, depthSample);
// aRadial points inward, toward the viewer standing at the origin.
transformed += aRadial * shaped * uStrength * pin;
`

/**
 * MeshBasicMaterial keeps the photo's color management. We only bend the
 * vertices (and, for the stage, fade the rim into the surround color).
 */
export function createDisplacedMaterial(
  map: THREE.Texture,
  uniforms: DisplaceUniforms,
  mode: 'plane' | 'stage',
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map,
    toneMapped: false,
    side: mode === 'stage' ? THREE.DoubleSide : THREE.FrontSide,
  })
  material.customProgramCacheKey = () => `depth-displace-${mode}`
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDepth = uniforms.uDepth
    shader.uniforms.uStrength = uniforms.uStrength
    shader.uniforms.uInvert = uniforms.uInvert
    shader.uniforms.uPop = uniforms.uPop
    shader.uniforms.uEdgeColor = uniforms.uEdgeColor
    const vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uDepth;
         uniform float uStrength;
         uniform float uInvert;
         uniform float uPop;
         ${mode === 'stage' ? 'attribute vec3 aRadial;' : ''}`,
      )
      .replace('#include <begin_vertex>', mode === 'stage' ? STAGE_VERTEX : PLANE_VERTEX)
    if (!vertexShader.includes('depthSample')) {
      console.error('景深位移没有写进着色器，预览会是平面的')
    }
    shader.vertexShader = vertexShader

    if (mode === 'stage') {
      // Fade after the color map is applied. MeshBasicMaterial exposes vMapUv,
      // not vUv, and outgoingLight is not a safe place to write.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uEdgeColor;`)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           #ifdef USE_MAP
             float edgeFadeX = smoothstep(0.0, 0.055, vMapUv.x) * smoothstep(0.0, 0.055, 1.0 - vMapUv.x);
             float edgeFadeY = smoothstep(0.0, 0.04, vMapUv.y) * smoothstep(0.0, 0.04, 1.0 - vMapUv.y);
             diffuseColor.rgb = mix(uEdgeColor, diffuseColor.rgb, edgeFadeX * edgeFadeY);
           #endif`,
        )
      if (!shader.fragmentShader.includes('edgeFadeX')) {
        console.error('空间场景边缘过渡没有写进着色器')
      }
    }
  }
  return material
}

export function createStageGeometry(arc: number, radius: number, height: number) {
  const segX = 160
  const segY = 120
  const geometry = new THREE.BufferGeometry()
  const count = (segX + 1) * (segY + 1)
  const positions = new Float32Array(count * 3)
  const radials = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const indices: number[] = []

  for (let y = 0; y <= segY; y++) {
    const v = y / segY
    const py = (v - 0.5) * height
    for (let x = 0; x <= segX; x++) {
      const u = x / segX
      const theta = (u - 0.5) * arc
      const px = Math.sin(theta) * radius
      const pz = -Math.cos(theta) * radius
      const i = y * (segX + 1) + x
      positions[i * 3] = px
      positions[i * 3 + 1] = py
      positions[i * 3 + 2] = pz
      const len = Math.hypot(px, pz) || 1
      radials[i * 3] = -px / len
      radials[i * 3 + 1] = 0
      radials[i * 3 + 2] = -pz / len
      uvs[i * 2] = u
      uvs[i * 2 + 1] = v
    }
  }

  // Counter-clockwise when viewed from the origin, so the inside of the
  // cyclorama is the front face.
  for (let y = 0; y < segY; y++) {
    for (let x = 0; x < segX; x++) {
      const a = y * (segX + 1) + x
      const b = a + 1
      const c = a + (segX + 1)
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aRadial', new THREE.BufferAttribute(radials, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function stageLayout(aspect: number) {
  const radius = 2.65
  const fov = (62 * Math.PI) / 180
  const visibleH = 2 * radius * Math.tan(fov / 2)
  // Fit the whole photo in the opening view. Wide photos wrap farther around
  // the viewer; portraits stay narrower so the person is not cropped.
  let height = visibleH * 0.84
  let arc = (height * aspect) / radius
  const maxArc = Math.PI * 0.92
  if (arc > maxArc) {
    arc = maxArc
    height = (arc * radius) / aspect
  }
  return { radius, height, arc }
}
