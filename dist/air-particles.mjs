import {airDensity,clamp} from './physics.mjs';

export const AIR_REFERENCE={temperature:24,pressure:1010,count:128};
export const MAX_AIR_PARTICLES=256;
// For a fixed gas composition, molecular rms speed is proportional to sqrt(T in kelvin).
// Pressure affects number density, not molecular speed at a given temperature.
export function airParticleModel(temperature,pressure,emphasized=false){
  const density=airDensity(temperature,pressure);
  const densityRatio=density/airDensity(AIR_REFERENCE.temperature,AIR_REFERENCE.pressure);
  const speedRatio=Math.sqrt((temperature+273.15)/(AIR_REFERENCE.temperature+273.15));
  const gain=emphasized?6:1;
  return {temperature,pressure,density,speedRatio,
    count:clamp(Math.round(AIR_REFERENCE.count*(1+gain*(densityRatio-1))),16,MAX_AIR_PARTICLES),
    motionRate:clamp(1+gain*(speedRatio-1),.25,2.5)};
}

// Integrate a separate clock for each region so changing temperature cannot jump positions.
export function advanceAirMotion(sample,dt){
  const target=sample.targetRate,decay=Math.exp(-6*dt);
  sample.time+=target*dt+(sample.rate-target)*(1-decay)/6;
  sample.rate=target+(sample.rate-target)*decay;
}
