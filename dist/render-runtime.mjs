// Rendering is demand-driven; elapsed experiment time is independent of frame rate.
export function createFrameLoop({requestFrame,cancelFrame,step,isAnimating,canRun,getFPS}) {
  let handle=null,previous=null,deadline=null,dirty=false;
  const schedule=()=>{if(handle===null&&canRun())handle=requestFrame(tick);};
  function tick(time){
    handle=null;
    if(!canRun()){previous=deadline=null;return;}
    if(!dirty&&!isAnimating()){previous=deadline=null;return;}
    const interval=1000/getFPS();
    // Keep the target cadence instead of rounding every frame down to a display refresh.
    if(deadline!==null&&time<deadline-.75){schedule();return;}
    const dt=previous===null?0:(time-previous)/1000;
    deadline=deadline===null?time+interval:deadline+(Math.floor((time-deadline+.75)/interval)+1)*interval;
    previous=time;dirty=false;step(dt,time);
    if(dirty||isAnimating())schedule();else previous=deadline=null;
  }
  return {
    invalidate(){dirty=true;schedule();},
    suspend(){if(handle!==null)cancelFrame(handle);handle=null;previous=deadline=null;dirty=true;},
  };
}
export const QUALITY={light:{fps:60,pixelRatio:1,maxPixels:1100000,shadows:false},clear:{fps:60,pixelRatio:1.5,maxPixels:2200000,shadows:true}};
export function renderPixelRatio(quality,deviceRatio,width,height){const q=QUALITY[quality]||QUALITY.light;return Math.min(deviceRatio||1,q.pixelRatio,Math.sqrt(q.maxPixels/Math.max(1,width*height)));}
