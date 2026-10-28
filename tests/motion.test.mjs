import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceFlow,particleOffset} from '../dist/motion.mjs';

const flow=()=>({phase:.4,velocity:0,direction:1,speed:.6});
test('changing wind strength or direction never teleports its markers',()=>{
  const f=flow();advanceFlow(f,10);const before=f.phase;
  f.speed=.12;f.direction=-1;advanceFlow(f,0);assert.equal(f.phase,before);
  advanceFlow(f,1/60);assert.ok(Math.abs(f.phase-before)<.002);
  for(let i=0;i<120;i++)advanceFlow(f,1/60);assert.ok(f.velocity<0);
});
test('flow easing covers the same distance at 30, 60, and 120fps',()=>{
  const phases=[30,60,120].map(fps=>{const f=flow();for(let i=0;i<fps*3;i++)advanceFlow(f,1/fps);return f.phase;});
  assert.ok(Math.abs(phases[0]-phases[1])<1e-10);assert.ok(Math.abs(phases[1]-phases[2])<1e-10);
});
test('particle motion stays continuous and inside the sample cube',()=>{
  for(let i=0;i<192;i++)for(let axis=0;axis<3;axis++)for(let t=0;t<30;t+=.1){
    const a=particleOffset(i,axis,t),b=particleOffset(i,axis,t+1/60);
    assert.ok(Math.abs(a)<=.125001);assert.ok(Math.abs(a-b)<.004);
    assert.ok(.775+Math.abs(a)+.035<.95);
  }
});
