import * as THREE from 'three';
import { computeFloorWear } from './lib/floor-wear.js';

// The plank floor's material. The board texture is one tile of eight strips,
// but it is never simply repeated: the shader works out, from the world
// position, which 20 cm strip and which board length it is on, and gives every
// one its own source strip, mirroring, offset along its length and tone. On top
// lies one wear map stretched over the whole floor (see lib/floor-wear.js), so
// worn tracks, dirt and polish follow the floor plan and never repeat.

const PARS = /* glsl */ `
uniform sampler2D floorWear;
uniform vec4 floorWearBounds; // minX, minZ, sizeX, sizeZ (metres)
uniform vec3 floorTile;       // tile width, tile length (metres), strips per tile
uniform float floorJoints[8]; // where each source strip's second board starts (0..1 along the tile; 0 = one board)
varying vec2 vFloorPos;
vec2 floorUv;
vec2 floorDx;
vec2 floorDy;
vec3 floorBoard;              // strip, segment, board: identifies one physical board

float floorHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

void floorLocate() {
  float stripWidth = floorTile.x / floorTile.z;
  float across = (vFloorPos.x - floorWearBounds.x) / stripWidth;
  float strip = floor(across);
  // Each strip is slid along its length by its own amount, so end joints stagger.
  float along = -vFloorPos.y / floorTile.y + floorHash(vec3(strip, 7.0, 1.0));
  float segment = floor(along);
  float source = floor(floorHash(vec3(strip, segment, 2.0)) * floorTile.z);
  float mirror = floorHash(vec3(strip, segment, 3.0)) < 0.5 ? -1.0 : 1.0;
  float u = fract(across);
  if (mirror < 0.0) u = 1.0 - u;
  float v = fract(along);
  floorUv = vec2((source + u) / floorTile.z, v);
  // Gradients of unbroken coordinates (no per-strip offset), so mipmapping and
  // bump mapping do not glitch where strips meet.
  vec2 smoothUv = vec2(vFloorPos.x, -vFloorPos.y) / floorTile.xy;
  floorDx = dFdx(smoothUv) * vec2(mirror, 1.0);
  floorDy = dFdy(smoothUv) * vec2(mirror, 1.0);
  float joint = floorJoints[int(source)];
  floorBoard = vec3(strip, segment, v < joint ? 0.0 : 1.0);
}
`;

const BUMP = /* glsl */ `
  vec2 dHdxy_fwd() {
    float Hll = bumpScale * textureGrad( bumpMap, floorUv, floorDx, floorDy ).x;
    float dBx = bumpScale * textureGrad( bumpMap, floorUv + floorDx, floorDx, floorDy ).x - Hll;
    float dBy = bumpScale * textureGrad( bumpMap, floorUv + floorDy, floorDx, floorDy ).x - Hll;
    return vec2( dBx, dBy );
  }
`;

const COLOR = /* glsl */ `
  vec4 floorWearTexel = texture2D( floorWear, ( vFloorPos - floorWearBounds.xy ) / floorWearBounds.zw );
  {
    // Every board was cut from a different tree: its own depth and warmth of colour.
    float tone = 0.97 + 0.06 * floorHash( floorBoard + vec3( 0.0, 0.0, 11.0 ) );
    float warmth = floorHash( floorBoard + vec3( 0.0, 0.0, 23.0 ) ) - 0.5;
    diffuseColor.rgb *= tone * vec3( 1.0 + 0.03 * warmth, 1.0, 1.0 - 0.04 * warmth );
    // Worn to bare wood: paler and greyer. Grime: darker and a little cooler.
    float worn = floorWearTexel.r;
    float grey = dot( diffuseColor.rgb, vec3( 0.3333 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( grey * 1.2 ), worn * 0.45 ) * ( 1.0 + 0.45 * worn );
    diffuseColor.rgb *= 1.0 - 0.4 * floorWearTexel.g;
  }
`;

const ROUGHNESS = /* glsl */ `
  // Bare wood is dry and dull; where nobody walks, the polish has built up.
  roughnessFactor = clamp( roughnessFactor * ( 1.0 + 0.25 * floorWearTexel.r ) - 0.3 * floorWearTexel.b, 0.25, 1.0 );
`;

/** The wear map as a texture: red = worn, green = grime, blue = sheen. */
function wearTexture(wear) {
  const { width, height } = wear;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = wear.wear[i] * 255;
    data[i * 4 + 1] = wear.grime[i] * 255;
    data[i * 4 + 2] = wear.sheen[i] * 255;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function replaceOnce(source, search, replacement) {
  if (!source.includes(search)) throw new Error(`floor shader: chunk not found: ${search.slice(0, 60)}`);
  return source.replace(search, replacement);
}

/**
 * @param {{ map: THREE.Texture, bumpMap: THREE.Texture, roughnessMap: THREE.Texture, joints: number[] }} planks
 * @param {{ width: number, length: number, strips: number }} tile
 */
export function createFloorMaterial(planks, tile, layout) {
  const { map, bumpMap, roughnessMap, joints } = planks;
  const wear = computeFloorWear(layout);
  const uniforms = {
    floorWear: { value: wearTexture(wear) },
    floorWearBounds: { value: new THREE.Vector4(wear.minX, wear.minZ, wear.sizeX, wear.sizeZ) },
    floorTile: { value: new THREE.Vector3(tile.width, tile.length, tile.strips) },
    floorJoints: { value: joints },
  };
  const material = new THREE.MeshStandardMaterial({ map, bumpMap, roughnessMap, bumpScale: 1.5, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec2 vFloorPos;');
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      '#include <project_vertex>',
      '#include <project_vertex>\nvFloorPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;',
    );
    let fragment = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\n${PARS}`);
    const bump = THREE.ShaderChunk.bumpmap_pars_fragment.replace(
      /vec2 dHdxy_fwd\(\) \{[\s\S]*?return vec2\( dBx, dBy \);\s*\}/,
      BUMP,
    );
    if (!bump.includes('floorUv')) throw new Error('floor shader: bump chunk not found');
    fragment = replaceOnce(fragment, '#include <bumpmap_pars_fragment>', bump);
    fragment = replaceOnce(fragment, 'void main() {', 'void main() {\n  floorLocate();');
    fragment = replaceOnce(
      fragment,
      '#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'textureGrad( map, floorUv, floorDx, floorDy )') + COLOR,
    );
    fragment = replaceOnce(
      fragment,
      '#include <roughnessmap_fragment>',
      THREE.ShaderChunk.roughnessmap_fragment.replace(
        'texture2D( roughnessMap, vRoughnessMapUv )',
        'textureGrad( roughnessMap, floorUv, floorDx, floorDy )',
      ) + ROUGHNESS,
    );
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => 'plank-floor';
  return material;
}
