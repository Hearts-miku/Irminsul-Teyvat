export function petBounds(bounds,area,expanded){
 const width=Math.min(expanded?440:240,area.width),height=Math.min(expanded?720:260,area.height);
 return {width,height,x:Math.max(area.x,Math.min(area.x+area.width-width,bounds.x+bounds.width-width)),y:Math.max(area.y,Math.min(area.y+area.height-height,bounds.y+bounds.height-height))};
}
