export function distance(a:number[],b:number[]){
  let s=0; for(let i=0;i<6;i++) s+=(a[i]-b[i])**2;
  return Math.sqrt(s);
}
export function score(d:number){ return 100 - (d/6)*100; }
