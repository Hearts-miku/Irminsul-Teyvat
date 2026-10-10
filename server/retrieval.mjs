const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const stop = new Set(['为什么','怎么','什么','这个','那个','我们','他们','她们','可以','一下','一个','这段','剧情','故事','哪些','然后','后来','之前','现在']);
export function tokens(text) {
  const normalized = text.toLowerCase().replace(/安伯/g, '安柏');
  const words = [...segmenter.segment(normalized)].filter(x => x.isWordLike && x.segment.length > 1 && !stop.has(x.segment)).map(x => x.segment);
  for (const chunk of normalized.match(/[\u4e00-\u9fff]+/g) ?? []) for (let i = 0; i < chunk.length - 1; i++) if (!stop.has(chunk.slice(i,i+2))) words.push(chunk.slice(i,i+2));
  return [...new Set(words)];
}

export const forbiddenOutsidePack = /温迪|巴巴托斯|特瓦林|深渊教团|女士|神之心|坎瑞亚|飞行考试|飞行执照|芙宁娜|雷电将军|钟离|纳西妲|纳塔|枫丹|稻妻|须弥/;
const effects = /伤害|倍率|技能|命之座|精炼|圣遗物.*(效果|套装|属性)|武器.*(效果|属性)|配队|暴击|充能|天赋.*(效果|等级)|几星/;
const story = /故事|身世|经历|剧情|为什么.*(送|怀疑|帮助|护送)|关系|动机|来历/;
const stageTriggers = { 2: /丘丘人|营地|果园|商路|战斗后|与轻风同行/, 3: /风之翼|礼物|谢礼|酬谢|琴|代理团长|蜜酱|自由之都/ };

function bm25(query, docs) {
  const queryTokens = tokens(query);
  const corpus = docs.map(d => tokens(`${d.topic} ${d.keywords.join(' ')} ${d.text}`));
  const sets=corpus.map(words=>new Set(words));
  const frequency=new Map(queryTokens.map(word=>[word,sets.reduce((n,words)=>n+Number(words.has(word)),0)]));
  const avg = corpus.reduce((s,w) => s+w.length,0)/Math.max(1,corpus.length);
  return docs.map((doc, i) => {
    let score = 0;
    for (const word of queryTokens) {
      const tf = Number(sets[i].has(word));
      if (!tf) continue;
      const df = frequency.get(word);
      const idf = Math.log(1 + (docs.length-df+.5)/(df+.5));
      score += idf * tf * 2.2 / (tf + 1.2*(.25+.75*corpus[i].length/avg));
    }
    const matched = doc.keywords.filter(k => k.length > 1 && query.includes(k) && !stop.has(k)).length;
    return { doc, score: score + matched*1.8 };
  }).sort((a,b) => b.score-a.score);
}

export function retrieve(question, session, records, pack) {
  const q = question.replace(/安伯/g,'安柏');
  const progress = session.progress;
  const selectedStage = pack.stages.find(s => s.id===progress);
  if(selectedStage.scopeMode==='independent')return retrieveScope(q,session,records,pack,selectedStage);
  if (/生日|年龄|身高|声优|配音|祖父|父母|加入骑士团/.test(q) || (/安柏/.test(q) && /家人|哥哥|妹妹/.test(q) && !/旅行者/.test(q))) return { status:'missing',records:[],message:'当前资料没有收录这项人物信息，不能据此作答。可以先聊初遇安柏、同行或进城这段经历。',followups:selectedStage.suggestions };
  if (effects.test(q) && !story.test(q)) return { status: 'reference', records: [], message: '角色、武器和圣遗物的效果说明将放在「资料图鉴」固定页面，目前仍在规划中。这里可以继续聊人物经历和剧情。', followups: selectedStage.suggestions };
  if (forbiddenOutsidePack.test(q)) return { status: 'missing', records: [], message: '这部分内容还没有收录到当前验证资料包。我暂时不能给出有出处的讲解，也不会用猜测补全后续剧情。', followups: selectedStage.suggestions };
  for (const [stage, trigger] of Object.entries(stageTriggers)) if (+stage>progress && trigger.test(q)) return { status: 'spoiler', records: [], message: '这个问题涉及当前进度之外的内容。你可以先继续当前任务，或在「剧情进度」中主动开放后续范围。', followups: selectedStage.suggestions };
  const explicit = pack.entities.filter(e => e.aliases.some(a => a.length > 1 ? q.includes(a) : new RegExp(`(^|[，。？\\s])${a}([是的在呢，。？\\s]|$)`).test(q)));
  const followup = /她|他|它|那件|刚才|再讲|详细|简短|继续|后来|之前|然后/.test(q) && explicit.length===0;
  if (followup && !session.context?.recordIds?.length) return { status: 'clarify', records: [], message: '你想接着聊哪位人物或哪件事？可以先说“安柏为什么护送旅行者”，我就能沿着这条线继续讲。', followups: selectedStage.suggestions };
  let expanded = q;
  if (followup) expanded += ' ' + (session.context.topic ?? '') + ' ' + (session.context.entities ?? []).join(' ');
  let ranked = bm25(expanded, records);
  const overview = /回顾|概括|总结|串起来|发生了什么|讲讲这段|讲一下这段|这三段/.test(q);
  let selected;
  if (overview) {
    const allStages = /三段|串起来|全部|整个/.test(q);
    const namedStage = pack.stages.find(s=>q.includes(s.title))?.id ?? (/初遇安柏|第一次见到安柏/.test(q)?1:progress);
    selected = records.filter(d => allStages || d.stage === namedStage).filter(d => !d.branch).slice(0, 9);
  } else {
    const threshold=Math.max(2.2,(ranked[0]?.score ?? 0)*0.5);
    selected = ranked.filter(r => r.score >= threshold).slice(0, 4).map(r => r.doc);
    if (followup && /详细|再讲|简短/.test(q)) selected = records.filter(d => session.context.recordIds.includes(d.id));
    if (selected.some(d => d.branch?.group==='paimon-introduction')) selected = [...new Map([...selected, ...records.filter(d => d.branch?.group==='paimon-introduction')].map(d=>[d.id,d])).values()];
  }
  if (!selected.length) return { status: 'missing', records: [], message: '在当前开放的资料里，我还没找到足以回答这个问题的依据。可以换成具体的人物、事件或任务名称，也可以从下面的问题继续。', followups: selectedStage.suggestions };
  return {
    status: 'answer', records: overview?[...selected].sort((a,b)=>a.stage-b.stage):selected, expanded,
    followup, mixed: effects.test(q),
    context: { topic: selected[0].topic, recordIds: selected.map(d=>d.id), entities: [...new Set(selected.flatMap(d => d.entities))].map(id=>pack.entities.find(e=>e.id===id)?.name).filter(Boolean) },
    followups: selectedStage.suggestions.filter(s=>s!==question).slice(0,3)
  };
}

export function evidenceView(record, pack) {
  const stage = pack.stages.find(s => s.id===record.stage);
  const source = pack.sources.find(s => s.id===(record.sourceId??stage.sourceId));
  const review=record.semanticReview;
  const shownSource=review?{...source,note:(source.note??'')+(review.status==='source-reviewed'?` 本条摘要已于 ${review.checkedAt} 对照固定版本来源核对；不代表整页原文已核对。`:' 本条摘要或来源已变化，原核对结果失效，需重新核对。')+' '+review.note}:source;
  return { ...record, task: record.task??stage.title, source:shownSource, verifiedAt: review?.status==='source-reviewed'?review.checkedAt:source.verifiedAt ?? (stage.id<=3?'2026-09-29':pack.verifiedAt) };
}

function retrieveScope(q,session,records,pack,scope){
  const empty=(status,message)=>({status,message,records:[],followups:scope.suggestions});
  // Enforce isolation here as well as in SQLite, including on direct callers.
  records=records.filter(r=>r.stage===scope.id);
  if(scope.contentType==='source')return retrieveSource(q,session,records,scope);
  if(effects.test(q)&&!story.test(q))return empty('reference','角色、武器与圣遗物的效果说明请看资料图鉴，目前仍为占位页。');
  if(/生日|身高|声优|配音|逐字|原文全文|全部台词/.test(q))return empty('missing','本主题没有收录这项详细资料或完整逐字对白。可以查看出处，或回到剧情目录选择其他主题。');
  if((scope.spoilerPatterns??[]).some(p=>new RegExp(p).test(q)))return empty('spoiler','这个问题涉及本主题尚未开放的后续细节。请在剧情目录选择对应的后续章节，再开始对话。');
  const other=pack.stages.find(s=>s.id!==scope.id&&s.contentType!=='source'&&[s.title,...(s.aliases??[])].some(title=>q.includes(title)&&!(scope.taskTitles??[]).includes(title)));
  if(other)return empty('scope','这个问题点名了另一讲解主题。请从剧情目录主动选择该主题；当前对话不会自动展开其他剧情。');
  const followup=/^(再|那|她|他|它|继续|详细|简短)|刚才/.test(q);
  if(followup&&!session.context?.recordIds?.length)return empty('clarify','请先指出人物或事件，也可以从本主题的推荐问题开始。');
  const expanded=followup?`${q} ${session.context.topic??''}`:q;
  let selected;
  const overview=/^(概括|回顾|总结|讲讲)(这一幕|这段|本主题|这部分|这段故事|这部分故事)/.test(q)||q===scope.suggestions[0]&&q.startsWith('概括')||q===`概括${scope.title}`;
  if(overview){const summaries=records.filter(r=>r.overview);selected=summaries.length?summaries:records.slice(0,6);}
 else if(followup&&/详细|再讲|继续|简短/.test(q)){selected=records.filter(r=>session.context.recordIds.includes(r.id));if(!selected.length)selected=bm25(expanded,records).filter(r=>r.score>=2).slice(0,4).map(r=>r.doc);}
  else {const ranked=bm25(expanded,records);selected=ranked.filter(r=>r.score>=Math.max(1.5,(ranked[0]?.score??0)*.45)).slice(0,4).map(r=>r.doc);}
  if(q==='这部分还有哪些内容待核对？')return empty('missing',scope.summary+' 详细任务分支、场景条件与逐句对白仍需按来源补齐；目录数量不代表正文完成度。');
  if(!selected.length)return empty('missing','当前主题的摘要或提纲没有足以回答这个问题的依据。请查看本主题出处，或在剧情目录中查找对应任务和人物。');
  return {status:'answer',records:selected,contentType:scope.contentType,scopeId:scope.id,spoilerPatterns:scope.spoilerPatterns??[],followup,mixed:effects.test(q),context:{topic:selected[0].topic,recordIds:selected.map(r=>r.id),entities:[]},followups:scope.suggestions.filter(s=>s!==q)};
}

function retrieveSource(q,session,records,scope){
 const empty=message=>({status:'missing',message,records:[],followups:scope.suggestions});
 if(effects.test(q)&&!story.test(q))return empty('数值效果说明仍在资料图鉴占位页，原文资料库用于剧情与对话。');
 const followup=/^(再|那|她|他|它|继续|详细|简短)|刚才/.test(q);
 if(followup&&!session.context?.recordIds?.length)return empty('请先输入当前页面中的人物、事件或对白关键词。');
 const expanded=followup?q+' '+(session.context.topic??'')+' '+(session.context.task??''):q;
 const books=records.filter(r=>r.sourceKind==='book');
 const normalizeTitle=s=>s.replace(/[《》\s]/g,'');
 const explicitTitles=[...q.matchAll(/《([^》]+)》/g)].map(m=>normalizeTitle(m[1]));
 const namedBooks=books.filter(r=>explicitTitles.includes(normalizeTitle(r.task??'')));
 const bookRequest=/书中|书里|书内|这本书|该书|书籍内容/.test(q)||namedBooks.length>0;
 let candidates=records;
 if(bookRequest){
  if(!books.length)return empty('当前范围尚未展开所问书籍的正文，不能用人物提到书名的对白代替书中内容。');
  if(explicitTitles.length&&!namedBooks.length)return empty('当前范围没有这本书的正文，请选择已收录该书的任务范围。');
  const names=[...new Set(books.map(r=>r.task))];
  if(!namedBooks.length&&names.length>1)return empty('当前范围引用了多本书，请写明书名后再问。');
  candidates=namedBooks.length?namedBooks:books;
 }
 let selected;
 if(followup&&/详细|再讲|继续|简短/.test(q)&&!bookRequest){
  selected=records.filter(r=>session.context.recordIds.includes(r.id));
  // A parser/revision update invalidates fragment IDs. Re-resolve within this
  // scope and original task, never feed stored historical citations to the model.
  if(!selected.length&&session.context.topic){const candidates=records.filter(r=>(!session.context.task||r.task===session.context.task)&&r.topic===session.context.topic);selected=bm25(expanded,candidates).filter(r=>r.score>=2).slice(0,4).map(r=>r.doc);}
 }
 else if(q==='查找这页的任务描述')selected=records.filter(r=>!scope.isMainChapter||r.task===scope.title||(scope.taskTitles??[]).includes(r.task)).filter(r=>/描述|简介|介绍/.test(r.section)).slice(0,4);
 else if(q==='这页有哪些对话？')selected=records.filter(r=>!scope.isMainChapter||r.task===scope.title||(scope.taskTitles??[]).includes(r.task)).filter(r=>/剧情|对话|选项/.test(r.section)||/[^\s：]{1,12}：/.test(r.text)).slice(0,4);
 else{const ranked=bm25(expanded,candidates);selected=ranked.filter(r=>r.score>=Math.max(2,(ranked[0]?.score??0)*.45)).slice(0,4).map(r=>r.doc);}
 if(!selected?.length)return empty('本页没有找到足以回答的原文片段。系列总页可能只有索引，请到原文资料库搜索系列名，选择具体子任务。');
 return {status:'answer',records:selected,contentType:'source',scopeId:scope.id,followup,context:{topic:selected[0].topic,task:selected[0].task,recordIds:selected.map(r=>r.id),entities:[]},followups:scope.suggestions};
}

export function offlineSections(result, detail) {
  if (result.status!=='answer') return [{ text: result.message, kind: 'notice', citationIds: [] }];
  const docs = result.records.slice(0, detail==='brief'?2:detail==='detailed'?6:4);
  const sections = docs.map(d=>({ text: d.text, kind:'fact', citationIds:[d.id] }));
  if(result.contentType==='source'){
   for(const section of sections){section.kind='notice';if(section.text.length>900)section.text=section.text.slice(0,900)+'\n…（查看出处可读完整片段）';}
   sections.unshift({text:'以下是当前范围自动解析的原文片段，尚未逐条核对。不同选项和条件不能合并为同一段经历；这些匹配片段不代表整页或整幕概括。',kind:'notice',citationIds:[]});
  }
  if(result.contentType==='outline')sections.unshift({text:'以下为已整理的提纲导览，包含阅读重点和待核对项，不是完整剧情或逐句对白。',kind:'notice',citationIds:[]});
  if (detail!=='brief') {
    const interpretation = docs.find(d=>d.interpretation);
    if (interpretation) sections.push({ text: interpretation.interpretation, kind:'inference', citationIds:[interpretation.id] });
  }
  if (result.mixed) sections.push({ text:'效果与数值部分将由「资料图鉴」提供，目前尚未上线。', kind:'notice',citationIds:[] });
  return sections;
}
