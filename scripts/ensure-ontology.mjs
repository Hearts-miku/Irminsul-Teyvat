import {readFileSync} from 'node:fs';
import {fingerprint} from '../server/ontology-index.mjs';

// A checkout ships the built index. Rebuilding from source is an explicit task
// because downloaded Wiki caches are intentionally not committed.
try {
 const corpus=JSON.parse(readFileSync('data/corpus/pages.json'));
 const graph=JSON.parse(readFileSync('data/ontology/index.json'));
 const decisions=JSON.parse(readFileSync('data/ontology/decisions.json'));
 const pages=new Map(corpus.pages.map(p=>[p.pageid,p]));
 if(graph.pages.length!==pages.size||decisions.decisions.length!==graph.summary.candidateNames)throw Error('索引覆盖数量不一致');
 for(const old of graph.pages){const p=pages.get(old.pageid);if(!p||p.revision!==old.revision||p.sha256!==old.sha256)throw Error('来源快照发生变化');}
 if(graph.evidence.length!==corpus.pages.reduce((n,p)=>n+p.sections.filter(s=>!s.origin).length,0))throw Error('片段数量发生变化');
 for(const e of graph.evidence){const s=pages.get(e.pageid)?.sections[e.index];if(!s||s.origin||fingerprint(s)!==e.hash)throw Error('片段内容发生变化');}
 console.log(`本体索引已校验：${pages.size} 页，${graph.evidence.length} 个原始片段；无需下载缓存。`);
}catch(error){
 console.error('本体索引缺失或与语料不一致：'+error.message+'。请恢复匹配的 data/ontology 产物，或准备来源缓存后运行 npm run ontology:build。');
 process.exitCode=1;
}
