import test from 'node:test';
import assert from 'node:assert/strict';
import {airParticleModel,advanceAirMotion,MAX_AIR_PARTICLES} from '../dist/air-particles.mjs';
import {thermal} from '../dist/physics.mjs';

test('at equal temperature higher pressure increases count but never molecular speed',()=>{
  for(const emphasis of [false,true]){const a=airParticleModel(24,1030,emphasis),b=airParticleModel(24,990,emphasis);assert.ok(a.count>b.count);assert.ok(a.density>b.density);assert.equal(a.speedRatio,b.speedRatio);assert.equal(a.motionRate,b.motionRate);}
});
test('at equal pressure warm air is less crowded and its molecules move faster',()=>{
  for(const emphasis of [false,true]){const cold=airParticleModel(5,1010,emphasis),warm=airParticleModel(35,1010,emphasis);assert.ok(cold.count>warm.count);assert.ok(warm.speedRatio>cold.speedRatio);assert.ok(warm.motionRate>cold.motionRate);assert.ok(Math.abs(warm.speedRatio/cold.speedRatio-Math.sqrt(308.15/278.15))<1e-12);}
});
test('pressure and temperature are both considered; high pressure need not mean higher density',()=>{const hotHigh=airParticleModel(40,1030,true),coldLow=airParticleModel(0,990,true);assert.ok(hotHigh.count<coldLow.count);assert.ok(hotHigh.density<coldLow.density);assert.ok(hotHigh.motionRate>coldLow.motionRate);});
test('visual emphasis reveals differences without altering calculated density or speed ratios',()=>{const actual=airParticleModel(24,1030),emph=airParticleModel(24,1030,true);assert.equal(actual.density,emph.density);assert.equal(actual.speedRatio,emph.speedRatio);assert.ok(emph.count-128>actual.count-128);const neutral=airParticleModel(24,1010,true);assert.equal(neutral.count,128);assert.equal(neutral.motionRate,1);for(let t=-10;t<=70;t+=5)for(const p of [990,1010,1030]){const m=airParticleModel(t,p,true);assert.ok(m.count>=16&&m.count<=MAX_AIR_PARTICLES);assert.ok(m.motionRate>0);}});
test('sand and water have the correct particle differences in heating and cooling',()=>{for(const mode of ['heat','cool']){const t=thermal(mode,60,300),sand=airParticleModel(t.sand,1010,true),water=airParticleModel(t.water,1010,true);assert.equal(sand.count<water.count,mode==='heat');assert.equal(sand.motionRate>water.motionRate,mode==='heat');}});
test('changing temperature changes speed smoothly without moving the particle clock instantly',()=>{const s={time:12,rate:1,targetRate:1.5};advanceAirMotion(s,0);assert.equal(s.time,12);assert.equal(s.rate,1);advanceAirMotion(s,1/60);assert.ok(s.time>12&&s.time<12.03);assert.ok(s.rate>1&&s.rate<1.5);const integrate=fps=>{const a={time:0,rate:1,targetRate:1.5};for(let i=0;i<fps;i++)advanceAirMotion(a,1/fps);return a.time;};assert.ok(Math.abs(integrate(30)-integrate(120))<1e-10);});
