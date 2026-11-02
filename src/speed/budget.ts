/** Keep integer-minute historical records readable; quick previews add exactly 30s. */
export function validSpeedBudget(value:unknown):value is number{return value===.5||typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=5;}
