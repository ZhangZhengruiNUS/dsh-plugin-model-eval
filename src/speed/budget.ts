export const DEFAULT_SPEED_SECONDS=60;
export const MIN_SPEED_SECONDS=15;
export const MAX_SPEED_SECONDS=300;

export function validSpeedSeconds(value:number):boolean{
  return Number.isInteger(value)&&value>=MIN_SPEED_SECONDS&&value<=MAX_SPEED_SECONDS;
}

// The stored and API representation stays in minutes, including old previews.
export function validSpeedBudget(value:unknown):value is number{
  if(typeof value!=='number')return false;
  const seconds=Math.round(value*60);
  return validSpeedSeconds(seconds)&&seconds/60===value;
}
