// Integrate distance, not elapsed time multiplied by a changing speed.
// Exponential easing has the same result regardless of the display refresh rate.
export function advanceFlow(flow,dt){
  const target=flow.direction*flow.speed*.11,decay=Math.exp(-7*dt);
  const distance=target*dt+(flow.velocity-target)*(1-decay)/7;
  flow.velocity=target+(flow.velocity-target)*decay;
  flow.travel=(flow.travel||0)+distance;
  flow.phase=((flow.phase+distance)%1+1)%1;
}

// Classroom flow speed, in loops/second. This is not a forecast in m/s.
export function windMotion(strength){
  const value=Math.max(0,Math.min(1,strength));
  return {cycles:value===0?0:.008+.12*value**1.25,trail:value===0?0:.002+.018*value,
    label:value===0?'없음':value<.3?'약함':value<.7?'보통':'강함',index:Math.round(value*100)};
}
export function tracerPhase(seed,travel,speed=1){return ((seed+travel*speed)%1+1)%1;}

// Small, continuous illustrative motions; these are not real molecular trajectories.
export function particleOffset(index,axis,time){
  const seed=index*2.399+axis*1.73;
  return .1*Math.sin(time*(.7+(index%7)*.09)+seed)+.025*Math.sin(time*1.7+seed*2.1);
}
