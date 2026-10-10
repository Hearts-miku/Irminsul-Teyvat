import { readFileSync } from 'node:fs';
export const kindLabels={archon:'魔神任务',story:'传说任务',tribal:'部族纪闻',hangout:'邀约事件',world:'世界任务',commission:'NPC 委托','commission-combat':'非 NPC 委托',event:'活动任务',anecdote:'游逸旅闻',moon:'伴月纪闻',npc:'NPC 名录'};
export function loadCatalog(path){
  const data=JSON.parse(readFileSync(path,'utf8'));
  const normalize=s=>String(s).toLowerCase().replace(/[\s，。、·「」“”！!？?（）()：:]/g,'');
  const searchable=data.items.map(item=>({item,key:normalize([item.title,item.group,item.region,item.location,item.character,item.series].filter(Boolean).join(' '))}));
  const kinds=Object.entries(kindLabels).map(([id,title])=>({id,title,count:data.items.filter(i=>i.kind===id).length}));
  const regions=[...new Set(data.items.map(i=>i.region))].filter(Boolean).sort();
  return {counts:data.counts,query(params){
    const q=normalize((params.get('q')??'').slice(0,200)),kind=params.get('kind'),region=params.get('region'),availability=params.get('availability');
    const matches=searchable.filter(({item,key})=>(!q||key.includes(q))&&(!kind||item.kind===kind)&&(!region||item.region===region)&&(!availability||(availability==='summary'?item.summaryIds.length>0:availability==='outline'?item.guideIds.length>0:availability==='source'?(item.sourcePages??[]).length>0:!item.summaryIds.length&&!item.guideIds.length&&!(item.sourcePages??[]).length)));
    const page=Math.max(1,Math.min(Math.ceil(matches.length/40)||1,parseInt(params.get('page'),10)||1));
    return {items:matches.slice((page-1)*40,page*40).map(v=>v.item),total:matches.length,page,pageSize:40,kinds,regions,counts:data.counts,capturedOn:data.capturedOn};
  },detail(id){const item=data.items.find(i=>i.id===id);return item?{...item,source:data.sources.find(s=>s.id===item.sourceId)}:null;}};
}
