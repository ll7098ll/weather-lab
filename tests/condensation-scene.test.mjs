import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {condensation} from '../dist/physics.mjs';
import {createCondensationRun,advanceCondensationRun,createCondensationScene,updateCondensationScene} from '../dist/condensation-scene.mjs';

test('guided formation crosses the threshold for every supported humidity; warming clears it',()=>{
  for(const mode of ['dew','fog','cloud'])for(const humidity of [30,70,95]){
    const run=createCondensationRun(mode,humidity,mode==='cloud'?0:24),end=advanceCondensationRun(run,9);
    assert.equal(end.done,true);assert.equal(condensation(mode,humidity,end.value).formed,true);
    const clear=createCondensationRun(mode,humidity,end.value,true);assert.equal(condensation(mode,humidity,advanceCondensationRun(clear,9).value).formed,false);
  }
});
test('guided changes are smooth, pause at dt zero, and finish identically at different frame rates',()=>{
  const samples=[];for(const fps of [30,60,120]){const run=createCondensationRun('cloud',70,0);let result;for(let i=0;i<fps*5;i++)result=advanceCondensationRun(run,1/fps);samples.push(result.value);const paused=advanceCondensationRun(run,0);assert.equal(paused.value,result.value);}
  assert.ok(Math.max(...samples)-Math.min(...samples)<1e-8);
});
test('visible droplets appear only after cooling, then shrink away; dew stays on the leaf',()=>{
  const leaf=new THREE.Group(),view=createCondensationScene('dew',leaf);
  updateCondensationScene(view,{humidity:70,value:24,snap:true});assert.equal(view.drops.visible,false);
  updateCondensationScene(view,{humidity:70,value:10,dt:.2});assert.ok(view.amount>0&&view.amount<1);assert.equal(view.drops.parent,leaf);
  for(let i=0;i<view.count;i++)assert.ok(view.drops.instanceMatrix.array[i*16+13]>.25);
  for(let i=0;i<200;i++)updateCondensationScene(view,{humidity:70,value:28,dt:.05});assert.equal(view.drops.visible,false);
});
test('cloud parcel rises and expands while fog remains near the ground; enlarged dots can be hidden',()=>{
  const cloud=createCondensationScene('cloud',new THREE.Group());updateCondensationScene(cloud,{humidity:70,value:0,snap:true});const radius=cloud.parcel.scale.x,y=cloud.parcel.position.y;assert.equal(cloud.mist.visible,false);
  updateCondensationScene(cloud,{humidity:70,value:2000,snap:true});assert.ok(cloud.parcel.position.y>y+3);assert.ok(cloud.parcel.scale.x>radius);assert.equal(cloud.mist.visible,true);
  cloud.showDrops=false;updateCondensationScene(cloud,{humidity:70,value:2000,dt:0});assert.equal(cloud.drops.visible,false);assert.equal(cloud.mist.visible,true);
  const fog=createCondensationScene('fog',new THREE.Group());updateCondensationScene(fog,{humidity:70,value:10,snap:true});for(let i=0;i<fog.count;i++)assert.ok(fog.drops.instanceMatrix.array[i*16+13]<1.2);
});
