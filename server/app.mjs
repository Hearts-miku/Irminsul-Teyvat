import {installReviewedOntology} from './ontology-reviewed.mjs';
import {installFullOntology} from './ontology-full.mjs';
import {installOntology} from './ontology-chat.mjs';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname, relative } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createStore, loadPack } from './store.mjs';
import { retrieve, evidenceView, offlineSections } from './retrieval.mjs';
import { normalizeEndpoint, callModel, buildMessages, validateAnswer } from './model.mjs';
import { loadCatalog } from './catalog.mjs';
import { loadCorpus } from './corpus.mjs';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function readJson(req) {
  let text = '';
  for await (const part of req) { text += part; if (text.length>20000) throw new HttpError(413,'请求内容过长'); }
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400,'请求不是有效 JSON'); }
}
function validProgress(value, pack) { if (!Number.isInteger(value) || !pack.stages.some(s=>s.id===value)) throw new HttpError(400,'剧情进度无效'); return value; }
export function memorySecrets() { let value=''; return { persistent:false, read:()=>value, write:v=>{value=v;}, clear:()=>{value='';} }; }

export async function createApp({ root, dataDir, port=0, secrets=memorySecrets(), onState=()=>{} }) {
  const pack = loadPack(join(root,'data','program-content.json'));
  const corpus=loadCorpus(root);
  pack.stages.push(...corpus.stages);pack.sources.push(...corpus.sources);
  const ontologyRetrieve=installOntology(root,pack,corpus);
  const fullOntology=installFullOntology(root,pack,corpus);
  const reviewedOntology=installReviewedOntology(root,pack,corpus);
  const catalog = loadCatalog(join(root,'data','catalog','program-index.json'));
  const store = createStore(dataDir, pack,corpus);
  const token = randomBytes(32).toString('hex');
  const busy = new Map();
  let origin;
  const settingsView = () => {
    const value = store.settings();
    return { ...value, hasKey:!!secrets.read(), persistentKey:secrets.persistent, ready:!!value.baseUrl && !!value.model && !!secrets.read() };
  };
  const sessionOr404 = id => { const session=store.session(id); if(!session) throw new HttpError(404,'这段对话不存在'); return session; };
  const idleOr409 = id => { if(busy.has(id)) throw new HttpError(409,'请先停止当前讲解，再调整对话'); };
  const sessionView = session => ({ session, busy:busy.has(session.id), messages:store.messages(session.id), suggestions:pack.stages.find(s=>s.id===session.progress).suggestions });
  const sendJson = (res, status, data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };

  const server = http.createServer(async (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
    try {
      if (req.headers.host !== new URL(origin).host) throw new HttpError(403,'无效的本地访问地址');
      if (req.headers.origin && req.headers.origin!==origin) throw new HttpError(403,'不允许跨站访问');
      const url=new URL(req.url,origin); const path=url.pathname;
      if (path==='/api/health' && req.method==='GET') return sendJson(res,200,{ok:true,version:pack.version});
      if (path.startsWith('/api/')) {
        const supplied=Buffer.from(req.headers['x-app-token'] ?? ''); const expected=Buffer.from(token);
        if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) throw new HttpError(401,'本地会话已失效，请刷新窗口');
        if (path==='/api/bootstrap' && req.method==='GET') {const activeProgress=new Set(store.sessions().map(s=>s.progress));return sendJson(res,200,{ pack:{id:pack.id,title:pack.title,chapter:pack.chapter,version:pack.version,coverage:pack.coverage,verifiedAt:pack.verifiedAt,sha256:pack.sha256,recordCount:pack.records.length,stages:pack.stages.filter(s=>!s.isOntology||activeProgress.has(s.id)).map(({id,title,subtitle,category,scopeMode,contentType,summary,taskTitles,kind,region,series,chapter,chapterOrder,isMainChapter,childCount,isOntology})=>({id,title,subtitle,category,scopeMode,contentType,summary,taskTitles,kind,region,series,chapter,chapterOrder,isMainChapter,childCount,isOntology}))}, catalog:catalog.counts,sessions:store.sessions(), settings:settingsView() });}
        if(path==='/api/ontology' && req.method==='GET')return sendJson(res,200,fullOntology.query(url.searchParams));
        if(path==='/api/catalog' && req.method==='GET') return sendJson(res,200,catalog.query(url.searchParams));
        if(path==='/api/corpus' && req.method==='GET') return sendJson(res,200,corpus.query(url.searchParams));
        const catalogMatch=path.match(/^\/api\/catalog\/([\w-]+)$/);
        if(catalogMatch && req.method==='GET'){const item=catalog.detail(catalogMatch[1]);if(!item)throw new HttpError(404,'目录条目不存在');return sendJson(res,200,item);}
        if (path==='/api/settings' && req.method==='PUT') {
          const input=await readJson(req); const old=store.settings();
          if(!['offline','cloud'].includes(input.mode) || !['brief','normal','detailed'].includes(input.detail)) throw new HttpError(400,'设置选项无效');
          const model=String(input.model ?? '').trim(); const baseUrl=String(input.baseUrl ?? '').trim();
          if(model.length>200 || baseUrl.length>1000 || typeof input.apiKey!=='string' || input.apiKey.length>2000) throw new HttpError(400,'模型设置格式无效');
          if(baseUrl) normalizeEndpoint(baseUrl);
          if(baseUrl!==old.baseUrl && secrets.read() && !input.apiKey.trim()) throw new HttpError(400,'更换服务地址时，请重新填写密钥，避免将旧密钥发送到新服务');
          if(input.mode==='cloud' && (!model || !baseUrl || (!input.apiKey.trim() && !secrets.read()))) throw new HttpError(400,'请填写服务地址、模型名和密钥后启用在线讲解');
          if(input.apiKey.trim()) secrets.write(input.apiKey.trim());
          store.saveSettings({mode:input.mode,baseUrl,model,detail:input.detail});
          return sendJson(res,200,settingsView());
        }
        if(path==='/api/key' && req.method==='DELETE') { secrets.clear(); store.saveSettings({...store.settings(),mode:'offline'}); return sendJson(res,200,settingsView()); }
        if(path==='/api/connection' && req.method==='POST') {
          const value=settingsView(); if(!value.ready) throw new HttpError(400,'请先保存完整的模型设置');
          const controller=new AbortController(); res.on('close',()=>{if(!res.writableEnded)controller.abort();});
          await callModel(value,secrets.read(),[{role:'user',content:'连接测试，请只回答：连接成功。'}],controller.signal,15000);
          return sendJson(res,200,{ok:true,message:'连接成功，可以开始剧情讲解。'});
        }
        if(path==='/api/sessions' && req.method==='POST') { const body=await readJson(req); return sendJson(res,201,sessionView(store.createSession(validProgress(body.progress ?? 1,pack)))); }
        const sessionMatch=path.match(/^\/api\/sessions\/([\w-]+)$/);
        if(sessionMatch) {
          const session=sessionOr404(sessionMatch[1]);
          if(req.method==='GET') return sendJson(res,200,sessionView(session));
          if(req.method==='PATCH') { idleOr409(session.id); const body=await readJson(req); const progress=validProgress(body.progress,pack); if(progress!==session.progress)store.setProgress(session.id,progress); return sendJson(res,200,sessionView(store.session(session.id))); }
          if(req.method==='DELETE') { idleOr409(session.id);store.removeSession(session.id);return sendJson(res,200,{ok:true}); }
        }
        if(path==='/api/library' && req.method==='GET') {
          const session=sessionOr404(url.searchParams.get('sessionId'));
          const independent=pack.stages.find(s=>s.id===session.progress).scopeMode==='independent';
          return sendJson(res,200,{records:store.records(session.progress).map(r=>evidenceView(r,pack)),stages:pack.stages.filter(s=>independent?s.id===session.progress:s.id<=session.progress)});
        }
        const evidenceMatch=path.match(/^\/api\/evidence\/([\w-]+)$/);
        if(evidenceMatch && req.method==='GET') {
          const session=sessionOr404(url.searchParams.get('sessionId')); const currentRecords=store.records(session.progress);const record=currentRecords.find(r=>r.id===evidenceMatch[1])??fullOntology.evidenceRecord(evidenceMatch[1],session,currentRecords);
          if(!record) {
            // Re-parsing may change fragment IDs. Only recover snapshots already cited
            // in this session and scope; old snapshots never become new model evidence.
            const snapshot=store.messages(session.id).filter(m=>m.role==='assistant').flatMap(m=>m.citations??[]).find(c=>c.id===evidenceMatch[1]&&c.stage===session.progress);
            if(snapshot)return sendJson(res,200,{...snapshot,source:{...snapshot.source,note:'历史引用快照：此片段的解析结果已更新。以下保留当时引用内容；请重新提问查看当前校正后的资料。 '+(snapshot.source?.note??'')}});
            throw new HttpError(404,'此条资料未收录或不在当前开放范围');
          }
          return sendJson(res,200,evidenceView(record,pack));
        }
        if(path==='/api/chat' && req.method==='POST') {
          const body=await readJson(req); const session=sessionOr404(body.sessionId); idleOr409(session.id);
          if(typeof body.question!=='string' || !body.question.trim() || body.question.trim().length>1000) throw new HttpError(400,'请输入 1～1000 字的问题');
          const question=body.question.trim(); const controller=new AbortController(); busy.set(session.id,controller); onState('thinking');
          res.on('close',()=>{if(!res.writableEnded)controller.abort(new Error('已停止讲解'));});
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
          const emit=data=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(data)}\n\n`);};
          const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': waiting\n\n');},5000);
          try {
            const history=store.messages(session.id); const rows=store.records(session.progress);const base=pack.stages.find(s=>s.id===session.progress)?.isOntology?{status:"missing",records:[]}:retrieve(question,session,rows,pack);const pilot=pack.stages.find(s=>s.id===session.progress)?.isOntology?null:ontologyRetrieve(question,session);const reviewed=reviewedOntology.retrieve(question,session,rows);const result=reviewed??(pilot&&pilot.status!=="missing"?pilot:fullOntology.retrieve(question,session,base,rows)??pilot??base);
            if(!history.length)store.title(session.id,question);
            const user=store.append(session.id,'user',{text:question}); emit({type:'user',message:user});
            emit({type:'status',text:result.status==='answer'?`找到 ${result.records.length} 条相关资料，正在整理讲解…`:'正在核对剧情范围…'});
            let sections=offlineSections(result,store.settings().detail), mode='offline', warning='';
            const settings=settingsView();
            if(result.status==='answer' && settings.mode==='cloud') {
              try {
                if(!settings.ready)throw new Error('在线密钥尚未设置，暂时展示资料整理。');
                emit({type:'status',text:'正在请讲解员组织回答…'});
                const content=await callModel(settings,secrets.read(),buildMessages(question,result,history,settings.detail),controller.signal);
                sections=validateAnswer(content,result,session.progress); mode='cloud';
                if(result.contentType==='outline')sections.unshift({kind:'notice',text:'以下是提纲导览；尚未核对的情节与对白不会由模型补写。',citationIds:[]});
                if(result.contentType==='source')sections.unshift({kind:'notice',text:'以下依据自动解析的 Wiki 原文片段讲解，尚未逐条核对；仅覆盖当前选中的范围与匹配片段。',citationIds:[]});
                if(result.mixed)sections.push({text:'效果与数值内容将由「资料图鉴」提供，目前尚未上线。',kind:'notice',citationIds:[]});
              } catch(error) { if(controller.signal.aborted)throw error;warning=error.message;mode='fallback'; }
            }
            if(controller.signal.aborted)throw new Error('已停止讲解');
            if(result.partial)sections.unshift({kind:'notice',text:'当前范围仅涵盖部分已核对关联，其他证据尚未开放或需要重新核对。',citationIds:[]});
            const citations=[...new Set(sections.flatMap(s=>s.citationIds))].map(id=>evidenceView(result.records.find(r=>r.id===id),pack));
            const answer={sections,citations,followups:result.followups,scopeSuggestions:result.scopeSuggestions,mode,warning,status:result.status};
            onState('speaking');emit({type:'meta',mode,warning,status:result.status,citations});
            for(let index=0;index<sections.length;index++) {
              const section=sections[index];emit({type:'section',index,kind:section.kind,citationIds:section.citationIds});
              for(const chunk of section.text.match(/.{1,24}/gs) ?? []) { if(controller.signal.aborted)throw new Error('已停止讲解');emit({type:'delta',index,text:chunk});await new Promise(resolve=>setImmediate(resolve)); }
            }
            const message=store.append(session.id,'assistant',answer);
            if(result.context)store.updateContext(session.id,result.context);
            emit({type:'done',message});res.end();
          } catch(error) { if(!controller.signal.aborted){emit({type:'error',message:'这次讲解未能完成，请重试。'});res.end();} }
          finally {clearInterval(heartbeat);busy.delete(session.id);onState('idle');}
          return;
        }
        throw new HttpError(404,'接口不存在');
      }
      if(req.method!=='GET')throw new HttpError(405,'不支持的请求方式');
      const dist=resolve(root,'dist');const requested=resolve(dist,`.${decodeURIComponent(path)}`);
      if(relative(dist,requested).startsWith('..'))throw new HttpError(403,'无效路径');
      const extension=extname(requested);
      const asset=extension ? requested : join(dist,'index.html');
      if(!existsSync(asset))throw new HttpError(404,'页面资源尚未构建，请先运行 npm run build');
      if(asset.endsWith('.html')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(asset,'utf8').replace('__APP_TOKEN__',token));}
      else {res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[extension] ?? 'application/octet-stream');res.end(readFileSync(asset));}
    } catch(error) {
      if(res.headersSent)res.end();
      else sendJson(res,error.status ?? 400,{error:error.status || /模型|密钥|服务|HTTPS|JSON|连接|响应/.test(error.message)?error.message:'请求未能完成，请重试。'});
    }
  });
  server.requestTimeout=65000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;resolve();});});
  return {origin,token,store,pack,close:async()=>{for(const c of busy.values())c.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}};
}
