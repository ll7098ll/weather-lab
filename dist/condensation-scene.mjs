import * as THREE from './vendor/three.module.js';
import {clamp,condensation} from './physics.mjs';

// A guided change of conditions, not a claim about real formation time.
export function createCondensationRun(mode,humidity,from,clearing=false){
  const r=condensation(mode,humidity,from);
  return {from,to:clearing?(mode==='cloud'?0:28):(mode==='cloud'?Math.min(2500,r.lcl+800):Math.max(5,r.dewPoint-6)),elapsed:0,duration:9,clearing};
}
export function advanceCondensationRun(run,dt){
  run.elapsed=Math.min(run.duration,run.elapsed+Math.max(0,dt));
  const p=run.elapsed/run.duration,s=p*p*(3-2*p);
  return {value:run.from+(run.to-run.from)*s,done:p===1,progress:p};
}
export function condensationStage(mode,humidity,value){
  const r=condensation(mode,humidity,value),changed=mode==='cloud'?value>1:value<23.9;
  return {...r,stage:r.formed?2:changed?1:0,height:mode==='cloud'?.9+value/650:.6};
}
const fract=n=>n-Math.floor(n),seed=(i,n)=>fract(Math.sin(i*12.9898+n*7.233)*43758.5453);
function dropletMesh(count,color){
  const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial({color,roughness:.14,metalness:.08}),count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;return mesh;
}
function softMist(mode){
  const count=mode==='fog'?110:75,positions=new Float32Array(count*3),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){
    const a=i*2.399,r=Math.sqrt((i+.5)/count);
    positions.set(mode==='fog'?[(seed(i,1)-.5)*8.8,.35+seed(i,2)*.65,(seed(i,3)-.5)*4.5]:[Math.cos(a)*r*1.8,(seed(i,2)-.35)*.9,Math.sin(a)*r*1.05],i*3);
    sizes[i]=mode==='fog'?1.3+seed(i,5)*1.5:1+seed(i,5)*1.1;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('size',new THREE.BufferAttribute(sizes,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:0},time:{value:0},pixels:{value:450}},
    vertexShader:`attribute float size; uniform float time; uniform float pixels; void main(){vec3 p=position;p.x+=sin(time*.28+position.z*1.7)*.12;p.z+=sin(time*.22+position.x)*.08;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(size*pixels/max(1.,-mv.z),1.,160.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float opacity; void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);if(d>1.)discard;float a=pow(1.-d,1.5)*opacity;gl_FragColor=vec4(vec3(.97,.99,1.),a);}`});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;return points;
}
export function createCondensationScene(mode,leaf){
  const group=new THREE.Group(),dummy=new THREE.Object3D(),count=mode==='dew'?44:180;
  const drops=dropletMesh(count,mode==='dew'?'#aedce8':'#9dcfdc');
  const highlights=mode==='dew'?new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:'#f5ffff'}),count):null;
  if(highlights){highlights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);highlights.frustumCulled=false;leaf.add(drops,highlights);}else group.add(drops);
  const mist=mode==='dew'?null:softMist(mode);if(mist)group.add(mist);
  let parcel=null,level=null,cloudCore=null;
  if(mode==='cloud'){
    parcel=new THREE.Group();for(let axis=0;axis<3;axis++){const points=[];for(let j=0;j<64;j++){const a=j/64*Math.PI*2,c=Math.cos(a)*1.1,s=Math.sin(a)*1.1;points.push(new THREE.Vector3(axis===0?0:c,axis===1?0:axis===0?c:s,axis===2?0:s));}parcel.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#b78f56',transparent:true,opacity:.3})));}group.add(parcel);
    cloudCore=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,9),new THREE.MeshStandardMaterial({color:'#f8fcff',roughness:1,transparent:true,opacity:0,depthWrite:false}),20);
    for(let i=0;i<20;i++){const a=i*2.399,r=Math.sqrt((i+.5)/20),size=.38+seed(i,6)*.26;dummy.position.set(Math.cos(a)*r*1.25,.15+seed(i,3)*.28,Math.sin(a)*r*.6);dummy.scale.set(size,size*.85,size);dummy.updateMatrix();cloudCore.setMatrixAt(i,dummy.matrix);}cloudCore.instanceMatrix.needsUpdate=true;group.add(cloudCore);
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.5,0,0),new THREE.Vector3(4.5,0,0)]);
    level=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:'#899ea9',dashSize:.15,gapSize:.12,transparent:true,opacity:.7}));level.computeLineDistances();group.add(level);
    const axis=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.5,.2,0),new THREE.Vector3(-4.5,5.2,0)]),new THREE.LineBasicMaterial({color:'#a7b7ae',transparent:true,opacity:.5}));group.add(axis);
  }
  return {mode,group,drops,highlights,mist,parcel,level,cloudCore,dummy,count,amount:0,value:mode==='cloud'?0:24,showDrops:true};
}
export function updateCondensationScene(view,{humidity,value,time=0,dt=0,pixels=450,snap=false}){
  const r=condensationStage(view.mode,humidity,value),blend=snap?1:1-Math.exp(-3.5*dt);
  view.amount+=(r.amount-view.amount)*blend;view.value=value;
  const amount=view.amount,visible=amount>.001,cloud=view.mode==='cloud',dew=view.mode==='dew',d=view.dummy;
  view.drops.visible=visible&&(dew||view.showDrops);if(view.highlights)view.highlights.visible=visible;
  if(view.mist){view.mist.visible=visible;view.mist.material.uniforms.opacity.value=amount*(cloud?.16:.36);view.mist.material.uniforms.time.value=time;view.mist.material.uniforms.pixels.value=pixels;view.mist.position.y=cloud?r.height:0;view.mist.scale.setScalar(cloud?.75+amount*.5:1);}
  if(view.parcel){view.parcel.position.y=r.height;view.parcel.scale.setScalar(1+value/5000);view.parcel.children.forEach(line=>line.material.opacity=r.formed?.2:.45);view.level.position.y=.9+r.lcl/650;view.cloudCore.visible=visible;view.cloudCore.material.opacity=amount*.85;view.cloudCore.position.y=r.height;view.cloudCore.scale.setScalar(.7+amount*.65);}
  for(let i=0;i<view.count;i++){
    const a=i*2.399,radius=Math.sqrt((i+.5)/view.count),growth=clamp((amount-seed(i,8)*.35)/.65,0,1);
    let size;
    if(dew){
      size=(.035+seed(i,4)*.06)*Math.cbrt(growth);d.position.set(Math.cos(a)*radius*1.43,.25+.1*Math.sqrt(1-radius*radius*.85)+size*.55,Math.sin(a)*radius*.55);
    }else{
      size=(.025+seed(i,4)*.025)*Math.sqrt(growth);
      if(cloud)d.position.set(Math.cos(a)*radius*(1.1+amount*.7),r.height+.3+(seed(i,2)-.5)*.65,Math.sin(a)*radius*(.75+amount*.35));
      else d.position.set((seed(i,1)-.5)*8.4,.22+seed(i,2)*.85,(seed(i,3)-.5)*4.2);
      d.position.x+=Math.sin(time*.35+i)*.14;d.position.y+=Math.sin(time*.45+i*1.7)*.035;d.position.z+=Math.cos(time*.3+i)*.07;
    }
    d.scale.set(size,size*(dew?.85:1),size);d.updateMatrix();view.drops.setMatrixAt(i,d.matrix);
    if(view.highlights){d.position.x-=size*.28;d.position.y+=size*.55;d.position.z+=size*.24;d.scale.setScalar(size*.23);d.updateMatrix();view.highlights.setMatrixAt(i,d.matrix);}
  }
  view.drops.instanceMatrix.needsUpdate=true;if(view.highlights)view.highlights.instanceMatrix.needsUpdate=true;
  return r;
}
