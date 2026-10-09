// Coarse display bands prevent zero versus a handful of draws implying a ranking.
export const probability=(n:number)=>n<.1?'<0.1%':n>99.9?'>99.9%':n.toFixed(1)+'%';
