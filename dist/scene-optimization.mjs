import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Keep dynamic objects independent, but submit matching static scenery in one draw call.
export function batchStaticMeshes(root,dynamicRoots=[]){
  root.updateMatrixWorld(true);
  const excluded=new Set(dynamicRoots.filter(Boolean)),groups=new Map(),removedGeometry=new Set(),removedMaterial=new Set();
  root.traverse(object=>{
    if(!object.isMesh||object.isInstancedMesh||Array.isArray(object.material)||object.material.transparent)return;
    for(let p=object;p;p=p.parent)if(excluded.has(p))return;
    const m=object.material,key=JSON.stringify([m.type,m.color?.getHex(),m.roughness,m.metalness,m.emissive?.getHex(),m.emissiveIntensity,m.flatShading,m.wireframe,m.side,object.castShadow,object.receiveShadow,Object.keys(object.geometry.attributes).sort()]);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);
  });
  for(const objects of groups.values()){
    if(objects.length<2)continue;
    const parts=objects.map(object=>{const g=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();g.applyMatrix4(object.matrixWorld);return g;});
    const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
    if(!geometry)continue;
    const first=objects[0],merged=new THREE.Mesh(geometry,first.material);merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;
    root.add(merged);
    for(const object of objects){removedGeometry.add(object.geometry);removedMaterial.add(object.material);object.removeFromParent();}
  }
  root.traverse(object=>{removedGeometry.delete(object.geometry);removedMaterial.delete(object.material);});
  removedGeometry.forEach(g=>g.dispose());removedMaterial.forEach(m=>m.dispose());
}
