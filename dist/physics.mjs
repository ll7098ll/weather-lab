export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function dewPoint(temp,rh){const g=Math.log(clamp(rh,1,100)/100)+17.625*temp/(243.04+temp);return 243.04*g/(17.625-g);}
export function condensation(mode,humidity,value){
  const initial=24,td=dewPoint(initial,humidity),lcl=125*(initial-td);
  let temp=value,threshold=td,formed;
  if(mode==='cloud'){temp=initial-0.0098*Math.min(value,lcl)-0.006*Math.max(0,value-lcl);threshold=lcl;formed=value>=lcl;}
  else formed=value<=td;
  const amount=formed?clamp(mode==='cloud'?(value-lcl)/650+0.13:(td-value)/7+0.13,0,1):0;
  return {temp,dewPoint:td,lcl,threshold,formed,amount};
}
export function pressure(left,right){const difference=left-right;return {difference,magnitude:Math.abs(difference),direction:Math.sign(difference),strength:clamp(Math.abs(difference)/40,0,1)};}
export const SPECIFIC_HEAT={sand:830,water:4180};
// Dry-air density (kg/m³), using the ideal-gas relation rho = p / (R T).
export function airDensity(tempC,pressureHpa=1010){if(!Number.isFinite(tempC)||!Number.isFinite(pressureHpa)||tempC<=-273.15||pressureHpa<=0)throw new RangeError('Air density requires a positive absolute temperature and pressure.');return pressureHpa*100/(287.05*(tempC+273.15));}
export function thermal(mode,power,seconds){const sign=mode==='heat'?1:-1,initial=mode==='heat'?20:30;const q=sign*power*clamp(seconds,0,300);const sand=initial+q/SPECIFIC_HEAT.sand,water=initial+q/SPECIFIC_HEAT.water;return {sand,water,difference:sand-water,energy:q};}
