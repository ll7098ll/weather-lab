import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {clamp,condensation,pressure,thermal,airDensity} from './physics.mjs';
import {createFrameLoop,QUALITY,renderPixelRatio} from './render-runtime.mjs';
import {batchStaticMeshes} from './scene-optimization.mjs';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {advanceFlow,particleOffset,windMotion,tracerPhase} from './motion.mjs';
import {airParticleModel,advanceAirMotion,MAX_AIR_PARTICLES} from './air-particles.mjs';
import {circulationCurve,createMovingAir,updateMovingAir} from './airflow.mjs';
import {createCondensationRun,advanceCondensationRun,condensationStage,createCondensationScene,updateCondensationScene} from './condensation-scene.mjs';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const state={lab:'condensation',mode:'dew',humidity:70,value:24,left:1020,right:1000,leftTemp:24,rightTemp:24,thermalMode:'heat',power:60,seconds:0,running:false,airParticles:true,particleView:'flow',showArrows:false,emphasized:true,paused:matchMedia('(prefers-reduced-motion: reduce)').matches};
const modeNames={dew:'이슬',fog:'안개',cloud:'구름'};
const sceneElement=$('#scene'),markupCache=new WeakMap();
let renderer,scene,camera,orbit,world,sceneParts={},anchors=[],flows=[],airSamples=[],movingAir=null,condensationView=null,condensationRun=null,animationTime=0,uiTime=0,renderLoop;
let sceneWidth=1,sceneHeight=1,sceneVisible=true,contextLost=false,frameCount=0,quality='light',resizeScene=()=>{};
try{if(localStorage.getItem('weather-lab-quality')==='clear')quality='clear';}catch{}
$('#quality').value=quality;
const invalidate=()=>renderLoop?.invalidate();
function setHTML(element,markup){if(markupCache.get(element)!==markup){element.innerHTML=markup;markupCache.set(element,markup);}}
let records=[];try{const saved=JSON.parse(localStorage.getItem('weather-lab-notes-v1')||'[]');if(Array.isArray(saved))records=saved.filter(r=>r&&typeof r.title==='string'&&typeof r.detail==='string').slice(-40);}catch{}
const iconDot=color=>`<i class="legend-dot ${color||''}"></i>`;
function range(id,label,value,min,max,unit,low,high,step=1){return `<div class="field"><div class="field-head"><label for="${id}">${label}</label><output id="${id}-out" for="${id}">${value}<small>${unit}</small></output></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><div class="range-labels"><span>${low}</span><span>${high}</span></div></div>`;}
function setOut(id,n,unit){setHTML($(`#${id}-out`),`${n}<small>${unit}</small>`);const el=$(`#${id}`);el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`);}
function segment(items,selected){return `<div class="segmented">${items.map(([id,label])=>`<button data-mode="${id}" aria-pressed="${id===selected}" class="${id===selected?'selected':''}">${label}</button>`).join('')}</div>`;}
function renderControls(){
  markupCache.delete($('#readouts'));
  if(state.lab==='condensation'){
    const cloud=state.mode==='cloud';
    $('#controls').innerHTML=segment([['dew','이슬'],['fog','안개'],['cloud','구름']],state.mode)+range('humidity','처음 공기의 습도',state.humidity,30,95,'%', '건조해요','습해요')+range('condition',cloud?'공기가 올라간 높이':state.mode==='dew'?'잎의 표면 온도':'지표 근처 공기 온도',state.value,cloud?0:5,cloud?2500:30,cloud?'m':'℃',cloud?'지표면 · 0m':'차가워요 · 5℃',cloud?'높은 하늘 · 2,500m':'따뜻해요 · 30℃',cloud?1:.1)+`<button class="quick-button" id="try-condition">${cloud?'↑ 공기를 높이 올려 보기':'❄ '+(state.mode==='dew'?'잎을':'공기를')+' 차갑게 해 보기'}</button><p class="condition-note">처음 공기 온도는 <strong>24℃</strong>예요.<br>${cloud?'공기는 높이 올라가며 팽창하고 식어요.':'온도가 내려갈 때 물방울이 생기는지 관찰해요.'}</p>`;
    $('#try-condition').insertAdjacentHTML('afterend',`<button class="text-button clear-condensation" id="clear-condensation">${cloud?'↓ 공기를 다시 내려 보기':'☀ 다시 따뜻하게 해 보기'}</button><p class="demo-note">조건이 천천히 바뀌는 9초 관찰 · 실제 생성 시간은 아니에요</p>`);
    $('#try-condition').textContent='▶ '+modeNames[state.mode]+' 생성 과정 보기';
    $('#humidity').addEventListener('input',e=>{condensationRun=null;state.humidity=+e.target.value;update();});
    $('#condition').addEventListener('input',e=>{condensationRun=null;state.value=+e.target.value;update();});
    $('#try-condition').onclick=()=>{if(condensationRun){condensationRun=null;update();return;}if(condensation(state.mode,state.humidity,state.value).formed)state.value=cloud?0:24;condensationRun=createCondensationRun(state.mode,state.humidity,state.value);state.paused=false;updatePause();update();};
    $('#clear-condensation').onclick=()=>{condensationRun=createCondensationRun(state.mode,state.humidity,state.value,true);state.paused=false;updatePause();update();};
    $$('[data-mode]').forEach(b=>b.onclick=()=>{condensationRun=null;state.mode=b.dataset.mode;state.value=state.mode==='cloud'?0:24;renderControls();buildWorld();update();});
    $('#question').textContent=cloud?'공기를 더 높이 올리면 어느 높이부터 구름이 보일까요?':state.mode==='dew'?'잎이 얼마나 차가워져야 물방울이 맺힐까요?':'처음 공기가 더 습하면 안개가 더 쉽게 생길까요?';
  }else if(state.lab==='pressure'){
    $('#controls').innerHTML=`<p class="check-explain">기압은 촘촘함에, 온도는 입자의 운동과 촘촘함에 영향을 줘요.</p><div class="air-presets"><button id="compare-pressure">같은 온도 · 기압 비교</button><button id="compare-temperature">같은 기압 · 온도 비교</button></div><div class="air-controls">`+range('left-pressure','왼쪽 기압',state.left,990,1030,'hPa','990','1,030')+range('right-pressure','오른쪽 기압',state.right,990,1030,'hPa','990','1,030')+range('left-temperature','왼쪽 공기 온도',state.leftTemp,0,40,'℃','0℃','40℃')+range('right-temperature','오른쪽 공기 온도',state.rightTemp,0,40,'℃','0℃','40℃')+`</div><button class="quick-button" id="swap-pressure">⇄ 두 지역의 조건 바꾸기</button><button class="text-button equal-button" id="equal-pressure">기압만 같게 해 보기 →</button><p class="condition-note">고·저기압은 <strong>기압을 비교</strong>해 정해요.<br>온도만으로 정하지 않아요.</p>`;
    $('#left-pressure').oninput=e=>{state.left=+e.target.value;update();};$('#right-pressure').oninput=e=>{state.right=+e.target.value;update();};
    $('#left-temperature').oninput=e=>{state.leftTemp=+e.target.value;update();};$('#right-temperature').oninput=e=>{state.rightTemp=+e.target.value;update();};
    $('#swap-pressure').onclick=()=>{[state.left,state.right]=[state.right,state.left];[state.leftTemp,state.rightTemp]=[state.rightTemp,state.leftTemp];renderControls();update();};
    $('#equal-pressure').onclick=()=>{state.left=1010;state.right=1010;$('#left-pressure').value=1010;$('#right-pressure').value=1010;update();};
    $('#compare-pressure').onclick=()=>{Object.assign(state,{left:1030,right:990,leftTemp:24,rightTemp:24});renderControls();update();};
    $('#compare-temperature').onclick=()=>{Object.assign(state,{left:1010,right:1010,leftTemp:5,rightTemp:35});renderControls();update();};
    $('#question').textContent='기압이 같은 두 지역에서는 이 기압 차로 인한 바람이 불까요?';
  }else{
    $('#controls').innerHTML=segment([['heat','☀ 가열 실험'],['cool','☾ 냉각 실험']],state.thermalMode)+range('power',state.thermalMode==='heat'?'두 물질에 주는 열':'두 물질에서 빼는 열',state.power,20,100,'J/초','조금씩 · 20','많이 · 100')+`<div class="run-info"><span>실험 시간 <strong id="elapsed">0초</strong> / 300초</span><span>실제 1초 = 실험 10초</span></div><div class="thermal-buttons"><button id="run-thermal">▶ 실험 시작</button><button id="step-thermal">+30초</button></div><svg class="mini-chart" viewBox="0 0 260 90" role="img" aria-label="시간에 따른 모래와 물의 온도 그래프"><path d="M27 5V68H252" stroke="#dce4d6" fill="none"/><path d="M27 36H252" stroke="#e9eee4" stroke-dasharray="3 3"/><text x="0" y="10" fill="#8e9b87" font-size="8" id="chart-high">60℃</text><text x="0" y="70" fill="#8e9b87" font-size="8" id="chart-low">20℃</text><text x="27" y="83" fill="#8e9b87" font-size="8">0초</text><text x="225" y="83" fill="#8e9b87" font-size="8">300초</text><path id="sand-line" fill="none" stroke="#cf8454" stroke-width="2.5" stroke-linecap="round"/><path id="water-line" fill="none" stroke="#63a4bc" stroke-width="2.5" stroke-linecap="round"/></svg><div class="chart-legend"><span><i style="background:#cf8454"></i>모래</span><span><i style="background:#63a4bc"></i>물</span></div><p class="condition-note">같은 질량 <strong>각 1kg</strong> · 처음 온도 <strong>${state.thermalMode==='heat'?'20':'30'}℃</strong><br>열의 양을 바꾸면 처음부터 다시 비교해요.</p>`;
    $('#power').oninput=e=>{state.power=+e.target.value;state.seconds=0;state.running=false;update();};
    $('#run-thermal').onclick=()=>{if(state.seconds>=300)state.seconds=0;state.running=!state.running;if(state.running){state.paused=false;updatePause();}update();};
    $('#step-thermal').onclick=()=>{state.seconds=Math.min(300,state.seconds+30);state.running=false;update();};
    $$('[data-mode]').forEach(b=>b.onclick=()=>{state.thermalMode=b.dataset.mode;state.seconds=0;state.running=false;renderControls();buildWorld();update();});
    $('#question').textContent=state.thermalMode==='heat'?'같은 양의 열을 받으면 모래와 물 중 무엇의 온도가 더 많이 오를까요?':'같은 양의 열을 잃으면 모래와 물 중 무엇이 더 빨리 식을까요?';
  }
  $$('input[type=range]').forEach(el=>el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`));
}
function readout(label,value,unit='',color='',word=false){return `<div class="readout"><p class="readout-label">${iconDot(color)}${label}</p><strong class="${word?'word':''}">${value}</strong><small>${unit}</small></div>`;}
function discovery(title,text){$('#discovery-title').textContent=title;$('#discovery-text').textContent=text;}
function airValues(){
  if(state.lab==='pressure')return {left:airDensity(state.leftTemp,state.left),right:airDensity(state.rightTemp,state.right),leftTemp:state.leftTemp,rightTemp:state.rightTemp,leftPressure:state.left,rightPressure:state.right,leftName:'왼쪽',rightName:'오른쪽'};
  const temps=thermal(state.thermalMode,state.power,state.seconds);
  return {left:airDensity(temps.sand),right:airDensity(temps.water),leftTemp:temps.sand,rightTemp:temps.water,leftPressure:1010,rightPressure:1010,leftName:'모래 위',rightName:'물 위'};
}
function updateAirDensity(){
  const supported=state.lab!=='condensation',visible=supported&&state.airParticles;
  $('#air-toggle').hidden=!supported;$('.model-badge').hidden=supported;
  const flowing=state.particleView==='flow';sceneElement.classList.toggle('flow-scene',supported&&flowing);if(sceneParts.pressureCloud)sceneParts.pressureCloud.visible=!flowing&&state.left!==state.right;
  $('#air-toggle').textContent=state.airParticles?(flowing?'● 공기 입자 흐름':state.emphasized?'● 입자 · 차이 강조':'● 입자 · 실제 비율'):'○ 공기 입자 보기';$('#air-toggle').setAttribute('aria-pressed',String(state.airParticles));
  $('#density-panel').hidden=!visible;$('#air-viewbar').hidden=!supported;$('#wind-panel').hidden=!supported;airSamples.forEach(s=>s.group.visible=visible&&!flowing);if(movingAir)movingAir.group.visible=visible&&flowing;
  if(anchors.length&&supported){if(state.lab==='pressure'){anchors[0].position.set(-3,flowing?.45:3.3,flowing?2.8:1.3);anchors[1].position.set(3,flowing?.45:3.3,flowing?2.8:1.3);}else{anchors[0].position.set(-2.8,flowing?.3:1.25,flowing?2.7:1.5);anchors[1].position.set(2.8,flowing?.3:1.25,flowing?2.7:1.5);anchors[2].position.set(flowing?-5.2:-3,3.8,0);anchors[3].position.set(flowing?5.2:3,3.8,0);}}
  $$('[data-air-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.airView===state.particleView));b.classList.toggle('selected',b.dataset.airView===state.particleView);});
  $('#particle-emphasis').hidden=flowing;
  if(!supported)return;
  const r=airValues(),equal=Math.abs(r.left-r.right)<.00001;
  $('#density-left-name').textContent=r.leftName;$('#density-right-name').textContent=r.rightName;
  $('#density-left').textContent=r.left.toFixed(3);$('#density-right').textContent=r.right.toFixed(3);
  const temperatureColor=temp=>new THREE.Color('#518fca').lerp(new THREE.Color('#e2844d'),clamp((temp-5)/30,0,1));
  const leftColor='#'+temperatureColor(r.leftTemp).getHexString(),rightColor='#'+temperatureColor(r.rightTemp).getHexString();
  for(const [side,value,color] of [['left',r.left,leftColor],['right',r.right,rightColor]]){const bar=$('#density-'+side+'-bar');bar.style.width=clamp(value/1.4*100,0,100)+'%';bar.style.background=color;$('#density-'+side).style.color=color;}
  const percent=(Math.max(r.left,r.right)/Math.min(r.left,r.right)-1)*100;
  $('#density-comparison').textContent=equal?'두 공간의 공기 밀도가 같아요.':`${r.left>r.right?r.leftName:r.rightName} 공기가 약 ${percent.toFixed(1)}% 더 촘촘해요.`;
  $('#density-assumption').textContent=state.lab==='pressure'?'밀도는 기압과 온도를 함께 계산해요. 색은 공기 온도예요: 파랑 = 차가움, 주황 = 따뜻함.':'공기 온도 = 표면 온도, 기압 1010hPa 가정 · 색은 온도, 점 수는 밀도예요.';
  const models=[airParticleModel(r.leftTemp,r.leftPressure,state.emphasized),airParticleModel(r.rightTemp,r.rightPressure,state.emphasized)];
  for(let i=0;i<2;i++){const side=i?'right':'left',model=models[i];$('#density-'+side+'-detail').textContent=flowing?`공기 온도 ${model.temperature.toFixed(1)}℃`:`${model.temperature.toFixed(1)}℃ · 표시 점 ${model.count}개`;$('#density-'+side+'-motion').hidden=flowing;$('#density-'+side+'-motion').textContent=`분자 운동 ${model.speedRatio.toFixed(3)}배 (24℃ 기준)`;}
  const sameTemperature=Math.abs(r.leftTemp-r.rightTemp)<1e-9;
  $('#particle-insight').textContent=sameTemperature?'온도가 같아서 입자의 운동 빠르기는 같아요. 기압이 높은 쪽에 입자가 더 많아요.':`${r.leftTemp>r.rightTemp?r.leftName:r.rightName} 입자가 더 활발하게 움직여요. ${state.lab==='pressure'&&state.left===state.right?'기압이 같아 기압 차로 인한 바람은 없어요.':'바람의 방향은 ‘입자 흐름’에서 비교해요.'}`;
  if(sameTemperature&&equal)$('#particle-insight').textContent='기압과 온도가 같아 촘촘함과 운동 빠르기도 같아요. 바람이 없어도 입자는 움직여요.';
  $('#particle-emphasis').setAttribute('aria-pressed',String(state.emphasized));$('#particle-emphasis').textContent=state.emphasized?'차이 강조 · 켜짐':'실제 비율 · 켜짐';
  $('#particle-scale-note').textContent=state.emphasized?'학습용: 기준(24℃·1010hPa) 대비 점 수·운동 빠르기 차이를 6배 강조해요. 밀도와 운동 배수 숫자는 실제 계산값이에요.':'점 수와 운동 빠르기는 계산 비율대로 표시해요. 점 하나는 많은 분자를 묶은 표시이며, 실제 움직임은 아주 느리게 보여줘요.';
  if(flowing){$('#particle-scale-note').textContent='흐르는 점은 공기 덩어리의 이동 표식이에요. 점의 개수로 밀도를 나타내지 않아요. 촘촘함은 ‘밀도 비교’에서 확인해요. 노란 점을 따라가 보세요.';$('#particle-insight').textContent=state.lab==='pressure'?'지표의 입자가 고기압 → 저기압으로 이동해요. 이 실험의 전체 흐름은 설정한 기압 차로 정해요.':'따뜻한 쪽에서 올라가고, 위에서 차가운 쪽으로 이동한 뒤 내려와요. 지표에서는 다시 따뜻한 쪽으로 흘러요.';$('#density-assumption').textContent=state.lab==='pressure'?'같은 높이의 두 지역을 비교하는 개념 모형이에요. 온도에 따른 상승·하강은 모래·물 실험에서 관찰해요.':'공기 온도 = 표면 온도, 밀도 계산은 1010hPa 가정 · 흐름의 색: 주황 = 더 따뜻한 쪽, 파랑 = 더 차가운 쪽.';}
  airSamples.forEach((sample,i)=>{sample.dots.count=models[i].count;sample.targetRate=models[i].motionRate;sample.dots.material.color.set(i?rightColor:leftColor);});
}
$('#air-toggle').onclick=()=>{state.airParticles=!state.airParticles;updateAirDensity();invalidate();};
$('#particle-emphasis').onclick=()=>{state.emphasized=!state.emphasized;updateAirDensity();invalidate();};
$$('[data-air-view]').forEach(b=>b.onclick=()=>{state.particleView=b.dataset.airView;state.airParticles=true;updateAirDensity();invalidate();});
$('#arrow-toggle').onclick=()=>{state.showArrows=!state.showArrows;$('#arrow-toggle').setAttribute('aria-pressed',String(state.showArrows));$('#arrow-toggle').textContent=state.showArrows?'화살표 숨기기':'화살표 보기';flows.forEach(f=>f.arrows.forEach(a=>a.visible=!!f.direction&&state.showArrows));invalidate();};
function update(){
  invalidate();
  if(renderer)renderer.shadowMap.needsUpdate=true;
  updateAirDensity();
  const cond=state.lab==='condensation';$('#condensation-panel').hidden=!cond;sceneElement.classList.toggle('condensation-scene',cond);
  if(state.lab==='condensation'){
    const r=condensationStage(state.mode,state.humidity,state.value),cloud=state.mode==='cloud';
    $('#condition').value=state.value;setOut('humidity',state.humidity,'%');setOut('condition',cloud?Math.round(state.value):Number(state.value.toFixed(1)),cloud?'m':'℃');
    $('#try-condition').textContent=condensationRun?'■ 조건 변화 멈추기':'▶ '+modeNames[state.mode]+' 생성 과정 보기';
    $('#clear-condensation').disabled=!!condensationRun?.clearing;
    const stages=cloud?['공기 출발','상승 · 팽창 · 냉각','하늘에서 구름 생성']:state.mode==='dew'?['수증기를 품은 공기','잎이 차가워져요','표면에 이슬 생성']:['수증기를 품은 공기','지표 공기가 식어요','공기 중에 안개 생성'];
    setHTML($('#condensation-steps'),stages.map((text,i)=>`<span class="${i===r.stage?'current':i<r.stage?'complete':''}" ${i===r.stage?'aria-current="step"':''}><i>${i+1}</i>${text}</span>`).join(''));
    $('#condensation-detail').textContent=condensationRun?.clearing?(cloud?'공기가 내려오며 따뜻해지면, 구름 물방울이 증발해 사라져요.':'다시 따뜻해지면 물방울이 작아져요. 수증기로 돌아가면 눈에 보이지 않아요.'):r.formed?(state.mode==='dew'?'잎에 붙은 작은 물방울이 자라요. 안개·구름과 달리 표면에 맺혀요.':state.mode==='fog'?'작은 물방울이 지표 가까이 떠 있어요. 안개가 짙어지며 뒤쪽 나무가 흐려져요.':'점선 높이를 넘자 공기 속에 작은 물방울이 모여 구름이 생겼어요.'):cloud?'둥근 선은 수증기를 품은 공기의 범위예요. 높이 올라갈수록 팽창하며 식어요.':'공기 중 수증기는 보이지 않아요. 온도를 낮추며 물방울이 생기는 순간을 찾아보세요.';
    $('#droplet-toggle').hidden=state.mode==='dew';
    $('#condensation-legend').textContent=state.mode==='dew'?'물방울 크기는 관찰을 위해 확대했어요. 잎에 맺힌 물방울을 가까이 살펴보세요.':'흰 안개·구름과 파란 확대 점은 모두 액체 물방울이에요. 수증기를 표시한 점이 아니에요.';
    $('#condensation-progress').style.width=(condensationRun?condensationRun.elapsed/condensationRun.duration*100:r.formed?100:0)+'%';
    $('#scene-caption').textContent=state.mode==='dew'?'잎 위에 맺히는 이슬':state.mode==='fog'?'땅 가까이에 떠 있는 안개':'높은 하늘에서 만들어지는 구름';
    $('#readouts').innerHTML=readout(cloud?'올라간 공기 온도':state.mode==='dew'?'잎의 표면 온도':'지표 근처 공기 온도',r.temp.toFixed(1),'℃','blue')+readout(cloud?'구름 시작 높이 (약)':'이슬점 · 응결 시작 온도',cloud?Math.round(r.lcl):r.dewPoint.toFixed(1),cloud?'m':'℃','orange')+readout('지금 관찰한 모습',r.formed?modeNames[state.mode]+' 생성':'물방울 없음','','',true);
    if(r.formed)discovery(state.mode==='dew'?'차가워진 잎에 이슬이 맺혔어요.':state.mode==='fog'?'땅 가까운 공기 속에 안개가 생겼어요.':'올라가며 식은 공기 속에 구름이 생겼어요.',state.mode==='dew'?'잎 주변의 수증기가 차가운 잎에서 식어 작은 물방울로 바뀌었어요.':state.mode==='fog'?'지표 근처의 공기가 식으며 수증기가 작은 물방울로 바뀌었어요.':'상승한 공기가 팽창하며 식어, 수증기가 작은 물방울로 바뀌었어요.');
    else discovery(cloud?'공기를 더 높이 올려 볼까요?':state.mode==='dew'?'잎을 조금 더 차갑게 해 볼까요?':'공기를 조금 더 차갑게 해 볼까요?','수증기는 눈에 보이지 않아요. 충분히 식어 작은 물방울이 되면 우리 눈에 보이기 시작해요.');
    if(condensationView&&state.paused)updateCondensationScene(condensationView,{humidity:state.humidity,value:state.value,time:animationTime,snap:true});
    if(anchors[0]){setHTML(anchors[0].element,cloud?`상승하는 공기<b>${Math.round(state.value).toLocaleString()}m · ${r.temp.toFixed(1)}℃</b>`:`${state.mode==='dew'?'잎':'지표 공기'}의 온도<b>${state.value.toFixed(1)}℃</b>`);anchors[0].position.set(cloud?2.8:state.mode==='dew'?-3.4:-3.8,cloud?r.height+.7:2.3,cloud?0:1.2);}
    if(anchors[1]){setHTML(anchors[1].element,cloud?`구름 시작 높이<b>약 ${Math.round(r.lcl)}m</b>`:r.formed?(state.mode==='dew'?'잎 위에 맺힌 물방울':'지표 가까이에 뜬 물방울'):'수증기는 보이지 않아요');anchors[1].position.set(cloud?-3.8:2.8,cloud?.9+r.lcl/650:1.8,cloud?0:-.5);}
  }else if(state.lab==='pressure'){
    const r=pressure(state.left,state.right);setOut('left-pressure',state.left,'hPa');setOut('right-pressure',state.right,'hPa');setOut('left-temperature',state.leftTemp,'℃');setOut('right-temperature',state.rightTemp,'℃');
    $('#scene-caption').textContent='지표 부근의 공기 이동';
    $('#readouts').innerHTML=readout('두 지역의 기압 차',r.magnitude,'hPa')+readout('지표 부근 바람 방향',r.direction>0?'왼쪽 → 오른쪽':r.direction<0?'오른쪽 → 왼쪽':'기압 차에 의한 바람 없음','','blue',true)+readout('바람의 상대적 세기',windMotion(r.strength).label,'','orange',true);
    discovery(!r.magnitude?'기압 차가 사라지니 공기의 흐름이 멈췄어요.':'지표 부근의 공기는 고기압에서 저기압 쪽으로 움직여요.',!r.magnitude?'이 모형에서는 다른 원인 없이 두 지역의 기압 차로 생기는 흐름만 보여줘요.':'다른 조건이 같을 때 기압 차가 클수록 공기를 움직이게 하는 힘이 커져요.');
    if(anchors.length){anchors[0].element.innerHTML=`왼쪽 · ${state.left} hPa · ${state.leftTemp}℃<b>${!r.direction?'같은 기압':r.direction>0?'고기압 ↓':'저기압 ↑'}</b>`;anchors[1].element.innerHTML=`오른쪽 · ${state.right} hPa · ${state.rightTemp}℃<b>${!r.direction?'같은 기압':r.direction>0?'저기압 ↑':'고기압 ↓'}</b>`;anchors[0].element.classList.toggle('warm',r.direction<0);anchors[1].element.classList.toggle('warm',r.direction>0);}
    setFlow(r.direction,r.strength);
    if(sceneParts.pressureCloud){sceneParts.pressureCloud.visible=!!r.direction&&state.particleView==='density';sceneParts.pressureCloud.position.x=r.direction>0?3:-3;}
  }else{
    const r=thermal(state.thermalMode,state.power,state.seconds);setOut('power',state.power,'J/초');
    $('#elapsed').textContent=Math.floor(state.seconds)+'초';$('#run-thermal').textContent=state.running?'Ⅱ 실험 멈춤':state.seconds>=300?'↻ 다시 실험':state.seconds?'▶ 계속 실험':'▶ 실험 시작';$('#step-thermal').disabled=state.seconds>=300;
    $('#scene-caption').textContent=state.thermalMode==='heat'?'가열하면 · 낮의 바닷가와 연결하기':'냉각하면 · 밤의 바닷가와 연결하기';
    setHTML($('#readouts'),readout('모래 온도',r.sand.toFixed(1),'℃','orange')+readout('물 온도',r.water.toFixed(1),'℃','blue')+readout('지표 부근 바람',Math.abs(r.difference)<.05?'아직 온도 차 없음':r.difference>0?'물 → 모래 (해풍)':'모래 → 물 (육풍)','','',true));
    discovery(!state.seconds?'같은 온도에서 실험을 시작해요.':r.difference>0?'모래가 더 빨리 뜨거워져요. 바람은 물에서 모래 쪽으로!':'모래가 더 빨리 식어요. 바람은 모래에서 물 쪽으로!',!state.seconds?'실험을 시작하고 온도 그래프와 공기의 움직임을 함께 살펴보세요.':'물은 같은 질량의 모래보다 온도를 1℃ 바꾸는 데 더 많은 열이 필요해요. 이런 성질을 비열이라고 해요.');
    const min=state.thermalMode==='heat'?20:-10,max=state.thermalMode==='heat'?60:30;
    $('#chart-high').textContent=max+'℃';$('#chart-low').textContent=min+'℃';
    const path=key=>{const coords=[];for(let t=0;t<=state.seconds;t+=5)coords.push([27+t/300*225,68-(thermal(state.thermalMode,state.power,t)[key]-min)/(max-min)*60]);coords.push([27+state.seconds/300*225,68-(r[key]-min)/(max-min)*60]);return coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');};
    $('#sand-line').setAttribute('d',path('sand'));$('#water-line').setAttribute('d',path('water'));
    if(anchors.length){setHTML(anchors[0].element,`모래 · 1kg<b>${r.sand.toFixed(1)}℃</b>`);setHTML(anchors[1].element,`물 · 1kg<b>${r.water.toFixed(1)}℃</b>`);
      const different=Math.abs(r.difference)>=.05;
      for(let i=2;i<4;i++){const warmer=i===2?r.difference>0:r.difference<0;anchors[i].element.style.visibility=different?'visible':'hidden';setHTML(anchors[i].element,warmer?'더 따뜻한 공기 ↑<br><b>지표 부근 저기압</b>':'더 차가운 공기 ↓<br><b>지표 부근 고기압</b>');anchors[i].element.classList.toggle('warm',warmer);}
    }
    setFlow(Math.abs(r.difference)<.05?0:r.difference>0?-1:1,Math.min(Math.abs(r.difference)/20,1));
    if(sceneParts.sand)sceneParts.sand.material.color.set(state.thermalMode==='heat'?'#e5bd80':'#c4c6a6').lerp(new THREE.Color(state.thermalMode==='heat'?'#e6a865':'#8dabb1'),state.seconds/500);
  }
}

// The rendered objects deliberately enlarge droplets and arrows for classroom observation.
function mat(color,options={}){return new THREE.MeshStandardMaterial({color,roughness:.8,...options});}
function mesh(geometry,material,x=0,y=0,z=0,parent=world){const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
const sphere=(r,m,x,y,z,p)=>mesh(new THREE.SphereGeometry(r,12,8),m,x,y,z,p);
function roundedShape(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
function slab(w,h,depth,color,x=0,y=0,z=0,r=.7){const g=new THREE.ExtrudeGeometry(roundedShape(w,h,r),{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.06,bevelThickness:.06,curveSegments:14});g.rotateX(-Math.PI/2);const o=mesh(g,mat(color),x,y-depth,z);return o;}
function tree(x,z,scale=1,type=0){const group=new THREE.Group();world.add(group);group.position.set(x,.1,z);group.scale.setScalar(scale);mesh(new THREE.CylinderGeometry(.07,.1,.85,8),mat('#99785b'),0,.4,0,group);if(type){for(let i=0;i<3;i++)mesh(new THREE.ConeGeometry(.48-i*.09,.8,8),mat(['#6e8d64','#8ba67a','#a6bc8e'][i]),0,.8+i*.3,0,group);}else{const leaves=mat('#94b47c',{flatShading:true});sphere(.58,leaves,0,1.05,0,group);sphere(.38,leaves,.3,.88,.1,group);sphere(.42,leaves,-.25,.9,-.1,group);}return group;}
function stone(x,z,scale=.3){const o=mesh(new THREE.DodecahedronGeometry(scale,0),mat('#c6c8b6',{flatShading:true}),x,.1,z);o.scale.y=.6;o.rotation.y=x;return o;}
function grass(x,z){const g=new THREE.Group();g.position.set(x,.05,z);for(let i=0;i<3;i++){const blade=mesh(new THREE.ConeGeometry(.025,.32+Math.sin(x+i)*.07,3),mat('#8caa73'),i*.06,.13,0,g);blade.rotation.z=(i-1)*-.23;}world.add(g);}
function cloudGroup(color='#ffffff',count=17){const group=new THREE.Group(),puffs=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),mat(color,{transparent:true,opacity:.85,roughness:1,depthWrite:false}),count),dummy=new THREE.Object3D();for(let i=0;i<count;i++){const angle=i*2.399,r=.15+Math.sqrt(i/count)*1.3,size=.32+(i%4)*.12;dummy.position.set(Math.cos(angle)*r,Math.sin(i*3.7)*.2,Math.sin(angle)*r*.6);dummy.scale.set(size,size*.8,size);dummy.updateMatrix();puffs.setMatrixAt(i,dummy.matrix);}puffs.instanceMatrix.needsUpdate=true;group.add(puffs);return group;}
function label(text,x,y,z,warm=false){const el=document.createElement('div');el.className='scene-label'+(warm?' warm':'');el.innerHTML=text;$('#labels').append(el);anchors.push({element:el,position:new THREE.Vector3(x,y,z)});}
function addFlow(){
  for(let z of [-.7,.65]){
    const curve=circulationCurve(z);
    const path=mesh(new THREE.TubeGeometry(curve,90,.018,5,true),mat('#6eab9d',{transparent:true,opacity:.2}));path.castShadow=false;
    const tip=new THREE.ConeGeometry(.105,.24,6).translate(0,.07,0),stem=new THREE.CylinderGeometry(.028,.028,.25,5).translate(0,-.12,0),arrowGeometry=mergeGeometries([tip,stem]);tip.dispose();stem.dispose();
    const arrows=[];for(let i=0;i<7;i++){const arrow=mesh(arrowGeometry,mat('#438b82'));arrow.castShadow=false;arrow.receiveShadow=false;arrows.push(arrow);}
    flows.push({curve,arrows,path,direction:1,speed:.5,strength:0,phase:0,velocity:0,travel:0});
  }
}
function setFlow(direction,strength){const motion=windMotion(direction?strength:0);flows.forEach(f=>{f.direction=direction;f.strength=direction?strength:0;f.speed=motion.cycles/.11;f.path.visible=!!direction;f.path.material.opacity=.09;f.arrows.forEach(a=>a.visible=!!direction&&state.showArrows);});$('#wind-label').textContent=motion.label;$('#wind-index').textContent=motion.index+' / 100';$('#wind-meter').setAttribute('aria-valuenow',String(motion.index));$('#wind-meter').setAttribute('aria-valuetext',motion.label);$('#wind-fill').style.width=motion.index+'%';$('#wind-caption').textContent=direction?'차이가 클수록 입자가 더 빨리 흐르고 이동 자취가 길어져요.':'전체 흐름은 멈추고, 입자의 작은 움직임만 남아요.';}
function addAirSamples(){
  for(const x of [-3,3]){
    const group=new THREE.Group();group.position.set(x,1.65,0);world.add(group);
    const cube=new THREE.BoxGeometry(1.9,1.9,1.9),outline=new THREE.LineSegments(new THREE.EdgesGeometry(cube),new THREE.LineBasicMaterial({color:'#91a89c',transparent:true,opacity:.65}));cube.dispose();group.add(outline);
    const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(.045,6,4),new THREE.MeshBasicMaterial({color:'#3f8e86'}),MAX_AIR_PARTICLES),dummy=new THREE.Object3D(),positions=new Float32Array(MAX_AIR_PARTICLES*3);
    // Identical, deterministic sample locations make equal densities visibly equal.
    const fract=n=>n-Math.floor(n);
    for(let i=0;i<MAX_AIR_PARTICLES;i++){dummy.position.set((fract(Math.sin(i*12.9898+1)*43758.5453)-.5)*1.55,(fract(Math.sin(i*7.233+3)*15347.23)-.5)*1.55,(fract(Math.sin(i*4.931+7)*32561.81)-.5)*1.55);dummy.position.toArray(positions,i*3);dummy.updateMatrix();dots.setMatrixAt(i,dummy.matrix);}
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dots.instanceMatrix.needsUpdate=true;dots.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.7);group.add(dots);airSamples.push({group,dots,positions,time:0,rate:1,targetRate:1});
  }
}
function disposeWorld(){if(world){const geometries=new Set(),materials=new Set();world.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.remove(world);}$('#labels').innerHTML='';anchors=[];flows=[];airSamples=[];movingAir=null;condensationView=null;sceneParts={};}
function buildWorld(){
  if(!scene)return;disposeWorld();world=new THREE.Group();scene.add(world);
  const floor=mesh(new THREE.PlaneGeometry(200,200),mat('#eaf0e2'),0,-.68,0);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  slab(10.7,6.1,.6,'#b6c8a3',0,-.01,0,.95);slab(10.6,6,.12,'#d1ddb3',0,.04,0,.92);
  for(let i=0;i<14;i++){const x=Math.sin(i*8.37)*4.7,z=Math.cos(i*5.8)*2.6;if(state.lab==='breeze'&&x>-.3)continue;grass(x,z);}
  if(state.lab==='condensation'){
    // Soft landscape, with a magnified leaf on the foreground.
    const pond=slab(3.3,2.6,.12,'#a1cdd0',2,.12,.65,.95);pond.material.roughness=.24;
    for(let i=0;i<4;i++){const ring=mesh(new THREE.TorusGeometry(.55+i*.22,.009,5,44),mat('#d1e7dd',{transparent:true,opacity:.65}),2,.19,.65);ring.rotation.x=-Math.PI/2;ring.scale.y=.7;}
    tree(-3.5,-1.65,1.2,1);tree(-2.5,-2.1,.85);tree(3.6,-1.9,1.1,1);tree(4,-.65,.7,1);stone(-3.8,1.7,.38);stone(-3.3,1.9,.22);stone(3.8,1.8,.3);
    const leafGroup=new THREE.Group();leafGroup.position.set(-1.4,.7,1);leafGroup.rotation.z=.18;world.add(leafGroup);sceneParts.leaf=leafGroup;
    mesh(new THREE.CylinderGeometry(.05,.08,.85,8),mat('#7e9b62'),-.5,-.25,0,leafGroup);
    const leaf=sphere(1,mat('#88b373'),0,.25,0,leafGroup);leaf.scale.set(1.65,.1,.65);
    const veinCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5,.29,0),new THREE.Vector3(0,.36,0),new THREE.Vector3(1.6,.29,0)]);mesh(new THREE.TubeGeometry(veinCurve,20,.018,5,false),mat('#c1d49b'),0,0,0,leafGroup);
    for(let i=0;i<6;i++)for(let side of [-1,1]){const x=-1+i*.4;const cv=new THREE.CatmullRomCurve3([new THREE.Vector3(x,.34,0),new THREE.Vector3(x+.25,.33,side*.4*Math.sqrt(1-x*x/3))]);mesh(new THREE.TubeGeometry(cv,4,.008,3,false),mat('#bdd195'),0,0,0,leafGroup);}
    leafGroup.visible=state.mode==='dew';if(state.mode==='dew'){leafGroup.scale.setScalar(1.6);leafGroup.position.set(-.8,.9,1);}
    condensationView=createCondensationScene(state.mode,leafGroup);world.add(condensationView.group);
    condensationView.showDrops=$('#droplet-toggle').getAttribute('aria-pressed')!=='false';
    updateCondensationScene(condensationView,{humidity:state.humidity,value:state.value,snap:true});
    label('잎의 온도<b>24℃</b>',-1.3,2.3,1.2);label('아직 보이지 않는 수증기',2.5,1.2,-.4);
  }else if(state.lab==='pressure'){
    tree(-4.3,-2,.8,1);tree(4.2,-2,.9,1);tree(4.5,1.8,.65);tree(-4.6,1.8,.6);stone(1.5,2.5,.23);
    for(const x of [-3,3]){for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.8+i*.35,.012,5,60),mat(x<0?'#73a997':'#cda587',{transparent:true,opacity:.55}),x,.13,0);ring.rotation.x=-Math.PI/2;}const disk=mesh(new THREE.CircleGeometry(1.1,48),mat(x<0?'#b6d7c4':'#e2c8a6',{transparent:true,opacity:.5}),x,.12,0);disk.rotation.x=-Math.PI/2;}
    addFlow();sceneParts.pressureCloud=cloudGroup('#ffffff',12);sceneParts.pressureCloud.position.set(3,4,-.7);sceneParts.pressureCloud.scale.setScalar(.65);world.add(sceneParts.pressureCloud);
    label('왼쪽 지역',-3,3.3,1.3);label('오른쪽 지역',3,3.3,1.3,true);
  }else{
    sceneParts.sand=slab(5.1,5.75,.17,'#e5bd80',-2.6,.22,0,.7);sceneParts.water=slab(5.1,5.75,.15,'#89bbc8',2.6,.2,0,.7);sceneParts.water.material.roughness=.25;
    for(let i=0;i<20;i++){const o=stone(-.4-(i*1.87%4.3),-2.4+(i*1.33%4.7),.035+(i%3)*.02);o.position.y=.25;o.material.color.set('#f2d49a');}
    for(let i=0;i<7;i++){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(.4,.3,-2.3+i*.7),new THREE.Vector3(1.5,.3,-2.1+i*.7),new THREE.Vector3(2.5,.3,-2.3+i*.7),new THREE.Vector3(4.6,.3,-2.2+i*.7)]);const wave=mesh(new THREE.TubeGeometry(curve,20,.014,5,false),mat('#c2e1df',{transparent:true,opacity:.65}));wave.castShadow=false;}
    tree(-4,-1.7,.9,1);tree(-4.5,-.7,.65,1);
    const sun=sphere(.43,mat(state.thermalMode==='heat'?'#f0cb7a':'#e4eddf',{emissive:state.thermalMode==='heat'?'#d2a950':'#c0d0bd',emissiveIntensity:.3}),-3.5,4.6,-1.8);sceneParts.sun=sun;
    if(state.thermalMode==='heat')for(let i=0;i<8;i++){const a=i*Math.PI/4;const ray=mesh(new THREE.CylinderGeometry(.015,.015,.17,5),mat('#e0bd75'),-3.5+Math.cos(a)*.65,4.6+Math.sin(a)*.65,-1.8);ray.rotation.z=a-Math.PI/2;}
    addFlow();label('모래 · 1kg<b>20℃</b>',-2.8,1.25,1.5,true);label('물 · 1kg<b>20℃</b>',2.8,1.25,1.5);label('',-3,3.8,0);label('',3,3.8,0);
  }
  if(state.lab!=='condensation'){addAirSamples();movingAir=createMovingAir();world.add(movingAir.group);}
  batchStaticMeshes(world,[sceneParts.leaf,condensationView?.group,sceneParts.pressureCloud,sceneParts.sand,sceneParts.water,...flows.flatMap(f=>[f.path,...f.arrows]),...airSamples.map(s=>s.group),movingAir?.group]);
  if(renderer)renderer.shadowMap.needsUpdate=true;
  homeView();
}
function homeView(){if(!camera)return;const cond=state.lab==='condensation',cloud=cond&&state.mode==='cloud',dew=cond&&state.mode==='dew';const flowing=!cond&&state.particleView==='flow';camera.position.set(dew?4:cloud?7:flowing?8:9,dew?6.5:cloud?7:flowing?7.5:8.5,dew?8:cloud?13:flowing?11:12.5);orbit.target.set(dew?-.8:0,cloud?2.4:dew?1:flowing?1.8:1.3,dew?1:0);orbit.update();invalidate();}
function init3D(){
  try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power'});}
  catch{$('#scene-loading').innerHTML='<div>이 기기에서는 3D 화면을 열 수 없어요.<br>실험 조건, 온도 그래프, 관찰 노트는 계속 사용할 수 있어요.<br>관리되는 크롬북이라면 선생님께 3D 사용 설정을 확인해 주세요.</div>';return;}
  renderer.shadowMap.enabled=QUALITY[quality].shadows;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.setClearColor('#edf3e5',0);
  $('#scene').prepend(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  scene=new THREE.Scene();scene.fog=new THREE.Fog('#eaf0e2',26,60);camera=new THREE.PerspectiveCamera(36,1,.1,150);
  scene.add(new THREE.HemisphereLight('#fffef1','#bcc9ac',1.9));const sun=new THREE.DirectionalLight('#fffcf0',2.5);sun.position.set(-5,12,7);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.5,far:35});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;scene.add(sun);
  orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.07;orbit.minDistance=9;orbit.maxDistance=26;orbit.minPolarAngle=.3;orbit.maxPolarAngle=Math.PI/2.25;orbit.enablePan=false;
  orbit.addEventListener('change',invalidate);orbit.addEventListener('start',invalidate);
  // Ordinary trackpad scrolling keeps scrolling the page. Pinch gestures still zoom.
  renderer.domElement.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)e.stopImmediatePropagation();},{capture:true,passive:true});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;renderLoop?.suspend();const message=document.createElement('div');message.id='context-message';message.className='render-message';message.setAttribute('role','status');message.textContent='3D 화면을 복구하고 있어요. 실험 조건과 기록은 그대로예요.';sceneElement.append(message);});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;$('#context-message')?.remove();applyQuality();invalidate();});
  resizeScene=()=>{sceneWidth=sceneElement.clientWidth;sceneHeight=sceneElement.clientHeight;renderer.setPixelRatio(renderPixelRatio(quality,devicePixelRatio,sceneWidth,sceneHeight));renderer.setSize(sceneWidth,sceneHeight);camera.aspect=sceneWidth/sceneHeight;camera.fov=sceneWidth/sceneHeight<1.25?48:36;camera.updateProjectionMatrix();invalidate();};
  new ResizeObserver(resizeScene).observe(sceneElement);resizeScene();buildWorld();$('#scene-loading').remove();
}
const Y=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),flowTangent=new THREE.Vector3(),flowRotation=new THREE.Quaternion(),coolFlow=new THREE.Color('#428e87'),warmFlow=new THREE.Color('#c78a62');
function animate(dt){
  // Do not teleport visual markers after a long browser stall. Experiment time stays accurate.
  const motionDt=state.paused?0:Math.min(dt,.05);
  if(!state.paused){animationTime+=motionDt;if(state.lab==='breeze'&&state.running){state.seconds=Math.min(300,state.seconds+dt*10);if(state.seconds>=300)state.running=false;uiTime+=dt;if(uiTime>=.2||!state.running){update();uiTime=0;}}}
  if(!state.paused&&state.lab==='condensation'&&condensationRun){const next=advanceCondensationRun(condensationRun,motionDt);state.value=state.mode==='cloud'?Math.round(next.value):Math.round(next.value*10)/10;if(next.done)condensationRun=null;uiTime+=motionDt;if(uiTime>=.1||next.done){update();uiTime=0;}}
  if(!renderer)return;
  for(const flow of flows){advanceFlow(flow,motionDt);if(!flow.direction||!state.showArrows)continue;flow.arrows.forEach((a,i)=>{const t=(flow.phase+i/flow.arrows.length)%1;flow.curve.getPointAt(t,a.position);flow.curve.getTangentAt(t,flowTangent).multiplyScalar(Math.abs(flow.velocity)>.0001?Math.sign(flow.velocity):flow.direction);flowRotation.setFromUnitVectors(Y,flowTangent.normalize());if(!a.userData.placed||state.paused)a.quaternion.copy(flowRotation);else a.quaternion.slerp(flowRotation,1-Math.exp(-16*motionDt));a.userData.placed=true;a.material.color.copy(coolFlow).lerp(warmFlow,THREE.MathUtils.smoothstep(a.position.y,2,3));});}
  for(const sample of airSamples){if(!sample.group.visible)continue;advanceAirMotion(sample,motionDt);const matrix=sample.dots.instanceMatrix.array;for(let i=0;i<sample.dots.count;i++)for(let axis=0;axis<3;axis++)matrix[i*16+12+axis]=sample.positions[i*3+axis]+particleOffset(i,axis,sample.time);sample.dots.instanceMatrix.needsUpdate=true;}
  if(movingAir?.group.visible){const r=airValues();updateMovingAir(movingAir,flows[0],{time:animationTime,thermal:state.lab==='breeze',leftTemp:r.leftTemp,rightTemp:r.rightTemp});}
  if(condensationView)updateCondensationScene(condensationView,{humidity:state.humidity,value:state.value,time:animationTime,dt:motionDt,pixels:sceneHeight*renderer.getPixelRatio()/(2*Math.tan(camera.fov*Math.PI/360))});
  orbit.update();renderer.render(scene,camera);
  for(const a of anchors){tmp.copy(a.position).project(camera);const x=Math.round((tmp.x*.5+.5)*sceneWidth),y=Math.round((-tmp.y*.5+.5)*sceneHeight);if(a.x!==x||a.y!==y){a.element.style.left=x+'px';a.element.style.top=y+'px';a.x=x;a.y=y;}a.element.style.display=tmp.z>1?'none':'';}
  // DOM diagnostics let us check draw calls and idle rendering without retaining scene internals.
  renderer.domElement.dataset.frames=String(++frameCount);renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);renderer.domElement.dataset.geometries=String(renderer.info.memory.geometries);renderer.domElement.dataset.motionTime=animationTime.toFixed(3);renderer.domElement.dataset.flowPhase=flows[0]?.phase.toFixed(5)||'0';renderer.domElement.dataset.windVelocity=String(flows[0]?.velocity||0);renderer.domElement.dataset.tracerPosition=movingAir?Array.from(movingAir.dots.instanceMatrix.array.slice(12,15)).map(x=>x.toFixed(3)).join(','):'';
  if(airSamples.length){renderer.domElement.dataset.airTimes=airSamples.map(s=>s.time.toFixed(3)).join(',');renderer.domElement.dataset.airRates=airSamples.map(s=>s.rate.toFixed(3)).join(',');renderer.domElement.dataset.airCounts=airSamples.map(s=>s.dots.count).join(',');}
  if(condensationView){renderer.domElement.dataset.condensationAmount=condensationView.amount.toFixed(4);renderer.domElement.dataset.condensationValue=state.value.toFixed(2);renderer.domElement.dataset.condensationMode=state.mode;renderer.domElement.dataset.condensationRunning=String(!!condensationRun);}
}
function applyQuality(){if(renderer){renderer.shadowMap.enabled=QUALITY[quality].shadows;renderer.shadowMap.needsUpdate=true;scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});resizeScene();}invalidate();}
function updatePause(){$('#pause').textContent=state.paused?'▶ 움직임 재생':'Ⅱ 움직임 멈춤';$('#pause').setAttribute('aria-pressed',String(state.paused));$('.live-dot').style.background=state.paused?'#bbc4b6':'#7ca77d';invalidate();}
function zoomCamera(factor){if(!camera)return;tmp.copy(camera.position).sub(orbit.target);const distance=clamp(tmp.length()*factor,orbit.minDistance,orbit.maxDistance);camera.position.copy(orbit.target).add(tmp.setLength(distance));orbit.update();invalidate();}
$('#zoom-in').onclick=()=>zoomCamera(.85);$('#zoom-out').onclick=()=>zoomCamera(1/.85);
$('#quality').onchange=e=>{quality=e.target.value;try{localStorage.setItem('weather-lab-quality',quality);}catch{}applyQuality();toast(quality==='light'?'배터리와 기기 부담을 줄이는 화면으로 바꿨어요.':'더 선명한 화면으로 바꿨어요.');};
sceneElement.addEventListener('keydown',e=>{if(e.target!==sceneElement||!camera)return;if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();zoomCamera(e.key==='-'?1/.85:.85);return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const spherical=new THREE.Spherical().setFromVector3(tmp.copy(camera.position).sub(orbit.target));if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;if(e.key==='ArrowUp')spherical.phi-=.1;if(e.key==='ArrowDown')spherical.phi+=.1;spherical.phi=clamp(spherical.phi,orbit.minPolarAngle,orbit.maxPolarAngle);camera.position.copy(orbit.target).add(tmp.setFromSpherical(spherical));orbit.update();invalidate();});
function switchLab(lab){condensationRun=null;state.lab=lab;state.running=false;$$('[data-lab]').forEach(b=>{const selected=b.dataset.lab===lab;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});renderControls();buildWorld();update();}
$$('[data-lab]').forEach(b=>b.onclick=()=>switchLab(b.dataset.lab));
$('#reset').onclick=()=>{condensationRun=null;if(state.lab==='condensation'){state.humidity=70;state.value=state.mode==='cloud'?0:24;}else if(state.lab==='pressure'){state.left=1020;state.right=1000;state.leftTemp=24;state.rightTemp=24;}else{state.power=60;state.seconds=0;state.running=false;}renderControls();homeView();update();toast('현재 실험을 처음 조건으로 되돌렸어요.');};
$('#droplet-toggle').onclick=()=>{const show=$('#droplet-toggle').getAttribute('aria-pressed')!=='true';$('#droplet-toggle').setAttribute('aria-pressed',String(show));$('#droplet-toggle').textContent=show?'● 물방울 확대 표시':'○ 물방울 확대 표시';if(condensationView)condensationView.showDrops=show;invalidate();};
$('#pause').onclick=()=>{state.paused=!state.paused;updatePause();};$('#view-home').onclick=homeView;$('#view-front').onclick=()=>{if(camera){camera.position.set(0,5,17);orbit.target.set(0,1.5,0);orbit.update();}};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.observation').requestFullscreen();}catch{toast('이 환경에서는 전체 화면이 지원되지 않아요.');}};
for(const [button,id] of [['teacher-open','guide'],['model-open','model']]){$('#'+button).onclick=()=>$('#'+id).showModal();$('#'+id+' .close').onclick=()=>$('#'+id).close();$('#'+id).onclick=e=>{if(e.target===$('#'+id)){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};}
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);}
function saveNotes(){try{localStorage.setItem('weather-lab-notes-v1',JSON.stringify(records));}catch{toast('브라우저 저장 공간을 사용할 수 없어요. 기록을 내려받아 보관해 주세요.');}}
function escapeHTML(text){return String(text).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function renderRecords(){
  $('#record-count').textContent=records.length;$('#export').disabled=!records.length;$('#clear-records').disabled=!records.length;
  $('#records').innerHTML=records.length?records.map((r,i)=>`<div class="record-row"><span class="record-index">${String(i+1).padStart(2,'0')}</span><div class="record-detail"><strong>${escapeHTML(r.title)}</strong><p>${escapeHTML(r.detail)}</p></div><input data-note="${i}" aria-label="${i+1}번 관찰에서 발견한 점" maxlength="300" placeholder="내가 발견한 점을 적어 보세요…" value="${escapeHTML(r.note||'')}"><button data-remove="${i}" aria-label="${i+1}번 기록 삭제">×</button></div>`).join(''):'<p class="empty-note">조건을 바꾸며 발견한 순간을 기록해 보세요. 기록은 이 브라우저에 남아요.</p>';
  $$('[data-note]').forEach(el=>el.oninput=()=>{records[+el.dataset.note].note=el.value;saveNotes();});$$('[data-remove]').forEach(el=>el.onclick=()=>{records.splice(+el.dataset.remove,1);saveNotes();renderRecords();});
}
$('#record').onclick=()=>{
  let title,detail;
  if(state.lab==='condensation'){const r=condensation(state.mode,state.humidity,state.value);title=modeNames[state.mode]+' 실험';detail=`처음 습도 ${state.humidity}% · ${state.mode==='cloud'?'높이 '+Math.round(state.value)+'m':(state.mode==='dew'?'잎':'공기')+' 온도 '+state.value.toFixed(1)+'℃'} · ${r.formed?modeNames[state.mode]+' 생성':'물방울 없음'}`;}
  else if(state.lab==='pressure'){const r=pressure(state.left,state.right);title='고기압과 저기압';detail=`왼쪽 ${state.left} hPa·${state.leftTemp}℃ / 오른쪽 ${state.right} hPa·${state.rightTemp}℃ · ${r.direction>0?'왼쪽 → 오른쪽':r.direction<0?'오른쪽 → 왼쪽':'기압 차에 의한 바람 없음'}`;}
  else{const r=thermal(state.thermalMode,state.power,state.seconds);title=state.thermalMode==='heat'?'모래와 물 · 가열':'모래와 물 · 냉각';detail=`${state.power}J/초 · ${Math.floor(state.seconds)}초 · 모래 ${r.sand.toFixed(1)}℃ / 물 ${r.water.toFixed(1)}℃`;}
  if(state.lab!=='condensation'&&state.airParticles){const r=airValues();detail+=` · 공기 밀도 ${r.leftName} ${r.left.toFixed(3)} / ${r.rightName} ${r.right.toFixed(3)} kg/m³`;}
  if(records.length>=40){toast('노트는 40개까지 저장해요. 내려받은 뒤 일부 기록을 지워 주세요.');return;}records.push({title,detail,note:'',time:new Date().toISOString()});saveNotes();renderRecords();toast('관찰 노트에 기록했어요. 발견한 점도 적어 보세요!');
};
$('#clear-records').onclick=()=>{if(confirm('이 브라우저의 관찰 기록을 모두 비울까요?')){records=[];saveNotes();renderRecords();toast('관찰 노트를 비웠어요.');}};
$('#export').onclick=()=>{const cell=s=>'"'+String(s||'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';const csv='\ufeff'+[['실험','조건과 결과','내가 발견한 점','기록 시각'],...records.map(r=>[r.title,r.detail,r.note,r.time])].map(row=>row.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='날씨연구소-관찰노트.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
renderControls();init3D();
renderLoop=createFrameLoop({requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame,step:animate,getFPS:()=>QUALITY[quality].fps,canRun:()=>!document.hidden&&sceneVisible&&!contextLost,isAnimating:()=>!state.paused&&(!!condensationRun||(condensationView&&(Math.abs(condensationView.amount-condensation(state.mode,state.humidity,state.value).amount)>.001||(state.mode!=='dew'&&condensationView.amount>.001)))||(state.lab==='breeze'&&state.running)||flows.some(f=>f.direction!==0)||(state.airParticles&&airSamples.length>0))});
document.addEventListener('visibilitychange',()=>{if(document.hidden)renderLoop.suspend();else invalidate();});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{sceneVisible=entries[0].isIntersecting;if(sceneVisible)invalidate();else renderLoop.suspend();},{rootMargin:'60px'}).observe(sceneElement);
update();updatePause();renderRecords();invalidate();
