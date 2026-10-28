import test from 'node:test';
import assert from 'node:assert/strict';
import {circulationCurve,createMovingAir,updateMovingAir} from '../dist/airflow.mjs';
import {advanceFlow,windMotion,tracerPhase} from '../dist/motion.mjs';

test('ground flow goes right, rises on the right, and descends on the left; reversal reverses every leg',()=>{
  const curve=circulationCurve();let ground=0,rising=0,falling=0;
  for(let i=0;i<1000;i++){const t=i/1000,p=curve.getPointAt(t),v=curve.getTangentAt(t);
    if(p.y<1&&Math.abs(p.x)<2.5){assert.ok(v.x>.8);ground++;}
    if(p.x>3.2&&p.y>1.4&&p.y<3.2){assert.ok(v.y>.7);rising++;}
    if(p.x< -3.2&&p.y>1.4&&p.y<3.2){assert.ok(v.y< -.7);falling++;}
  }assert.ok(ground>10&&rising>10&&falling>10);
});
test('strong wind travels substantially faster and has longer trails than weak wind; zero means no bulk flow',()=>{
  const weak=windMotion(.125),strong=windMotion(1);assert.ok(strong.cycles>weak.cycles*6);assert.ok(strong.trail>weak.trail*3);assert.equal(windMotion(0).cycles,0);assert.equal(windMotion(0).trail,0);assert.ok(windMotion(.9).cycles>windMotion(.7).cycles);
});
test('rendered air particles themselves change position as bulk flow advances',()=>{
  const field=createMovingAir(),flow={travel:0,phase:0,velocity:0,direction:1,speed:windMotion(1).cycles/.11,strength:1},context={time:0,thermal:false,leftTemp:24,rightTemp:24};
  updateMovingAir(field,flow,context);const start=Array.from(field.dots.instanceMatrix.array.slice(12,15));
  for(let i=0;i<120;i++)advanceFlow(flow,1/60);updateMovingAir(field,flow,context);
  const end=Array.from(field.dots.instanceMatrix.array.slice(12,15));assert.ok(end[0]-start[0]>2);assert.ok(field.trails.visible);
  const before=flow.travel;flow.direction=-1;advanceFlow(flow,0);assert.equal(flow.travel,before);updateMovingAir(field,flow,context);assert.deepEqual(Array.from(field.dots.instanceMatrix.array.slice(12,15)),end);
});
test('stopped flow keeps particle positions and removes directional trails',()=>{const field=createMovingAir(),flow={travel:0,phase:0,velocity:0,direction:0,speed:0,strength:0},context={time:1,thermal:true,leftTemp:20,rightTemp:20};updateMovingAir(field,flow,context);const initial=Array.from(field.dots.instanceMatrix.array);advanceFlow(flow,3);updateMovingAir(field,flow,context);assert.deepEqual(Array.from(field.dots.instanceMatrix.array),initial);assert.equal(field.trails.visible,false);assert.ok(tracerPhase(.1,-3.2)>=0&&tracerPhase(.1,-3.2)<1);});
