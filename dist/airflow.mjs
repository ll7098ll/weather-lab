import * as THREE from './vendor/three.module.js';
import {windMotion,tracerPhase,particleOffset} from './motion.mjs';

export const CIRCULATION_POINTS=[[-3,.9],[0,.65],[3,1],[3.5,2.1],[3,3.6],[0,3.85],[-3,3.6],[-3.5,2.1]];
export function circulationCurve(z=0){return new THREE.CatmullRomCurve3(CIRCULATION_POINTS.map(([x,y])=>new THREE.Vector3(x,y,z)),true,'catmullrom',.5);}
export function createMovingAir(){
  const count=192,group=new THREE.Group(),curve=circulationCurve(),table=curve.getSpacedPoints(512);
  const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({vertexColors:false}),count);
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dots.frustumCulled=false;
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  for(let i=0;i<count;i++){dummy.scale.setScalar(i===0?.11:.055+(i%4)*.005);dummy.updateMatrix();dots.setMatrixAt(i,dummy.matrix);dots.setColorAt(i,color.set('#398f9a'));}
  dots.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const trailPositions=new Float32Array(count*6),trailColors=new Float32Array(count*6),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color',new THREE.BufferAttribute(trailColors,3).setUsage(THREE.DynamicDrawUsage));
  const trails=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.44,depthWrite:false}));trails.frustumCulled=false;
  group.add(dots,trails);
  return {group,dots,trails,table,count,trailPositions,trailColors,color,point:new THREE.Vector3(),tail:new THREE.Vector3(),blue:new THREE.Color('#438dc8'),orange:new THREE.Color('#df8651'),neutral:new THREE.Color('#348d90'),yellow:new THREE.Color('#ffd155')};
}
function sample(table,t,out){const at=t*512,index=Math.floor(at),a=table[index],b=table[index+1];return out.copy(a).lerp(b,at-index);}
export function updateMovingAir(field,flow,{time,thermal,leftTemp,rightTemp}){
  const motion=windMotion(flow.strength||0),moving=Math.abs(flow.velocity)>.00005,sign=Math.sign(flow.velocity)||flow.direction;
  const trailLength=moving?Math.min(.025,Math.abs(flow.velocity)*.16):0;
  const matrix=field.dots.instanceMatrix.array;
  for(let i=0;i<field.count;i++){
    const seed=(i*.61803398875)%1,speed=.85+(i%11)*.03,phase=tracerPhase(seed,flow.travel||0,speed);
    const p=sample(field.table,phase,field.point),tail=sample(field.table,tracerPhase(phase,-sign*trailLength),field.tail);
    const lane=((i*7)%13-6)*.19,jitterX=particleOffset(i,0,time)*.7,jitterY=particleOffset(i,1,time)*.6,jitterZ=particleOffset(i,2,time);
    p.x+=jitterX;p.y+=jitterY;p.z=lane+jitterZ;
    tail.x+=jitterX;tail.y+=jitterY;tail.z=p.z;
    matrix[i*16+12]=p.x;matrix[i*16+13]=p.y;matrix[i*16+14]=p.z;
    if(i===0)field.color.copy(field.yellow);
    else if(thermal&&Math.abs(leftTemp-rightTemp)>.05){const right=(p.x+3.5)/7,warm=leftTemp>rightTemp?1-right:right;field.color.copy(field.blue).lerp(field.orange,THREE.MathUtils.clamp(warm,0,1));}
    else field.color.copy(field.neutral);
    field.dots.setColorAt(i,field.color);
    const at=i*6;p.toArray(field.trailPositions,at);tail.toArray(field.trailPositions,at+3);field.color.toArray(field.trailColors,at);field.color.toArray(field.trailColors,at+3);
  }
  field.dots.instanceMatrix.needsUpdate=true;field.dots.instanceColor.needsUpdate=true;
  field.trails.geometry.attributes.position.needsUpdate=true;field.trails.geometry.attributes.color.needsUpdate=true;field.trails.visible=moving;
  return {index:motion.index,cycles:Math.abs(flow.velocity)};
}
