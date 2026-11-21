import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const MATERIALS = {
  Gips: new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.9 }),
  Marmor: new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.55 }),
  // Metal is lit mostly by reflections, so it needs far more of the environment than plaster does.
  Bronze: new THREE.MeshStandardMaterial({
    color: 0x8a6a45,
    roughness: 0.5,
    metalness: 0.7,
    envMapIntensity: 5,
  }),
  Sandsten: new THREE.MeshStandardMaterial({ color: 0xc9b596, roughness: 0.95 }),
};

function materialFor(item) {
  return MATERIALS[item.materials?.[0]] ?? MATERIALS.Gips;
}

/**
 * A sculpture as a THREE.LOD whose detail levels are fetched on demand.
 * The coarsest level loads straight away; finer ones only once the visitor
 * comes within that level's `loadWithin` distance, so a gallery of many pieces
 * starts quickly and only pays for the detail that is actually looked at.
 *
 * @param {object} item entry from gallery.json
 * @param {string} baseUrl prefix for the item's model paths
 * @returns {{ object: THREE.LOD, ready: Promise<void>, update: (distance: number) => void }}
 */
export function createSculpture(item, baseUrl) {
  const lod = new THREE.LOD();
  lod.name = item.objectNumber;
  const material = materialFor(item);
  const requested = new Set();

  function load(level) {
    requested.add(level.name);
    return loader.loadAsync(baseUrl + level.file).then((gltf) => {
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.material = material;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      lod.addLevel(gltf.scene, level.distance);
    });
  }

  const eager = item.lods.filter((level) => level.loadWithin == null);
  const ready = Promise.all(eager.map(load)).then(() => undefined);

  function update(distance) {
    for (const level of item.lods) {
      if (requested.has(level.name) || distance > level.loadWithin) continue;
      load(level).catch((err) => {
        console.error(`Failed to load ${level.file}`, err);
        requested.delete(level.name); // try again next time the visitor comes close
      });
    }
  }

  return { object: lod, ready, update };
}
