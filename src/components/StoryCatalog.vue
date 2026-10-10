<script setup lang="ts">
import {ref,onMounted,watch,onUnmounted,computed} from 'vue';
import {Search,BookOpen,ArrowUpRight,X,ChevronRight} from '@lucide/vue';
import {api} from '../api';
import OntologyBrowser from './OntologyBrowser.vue';
import CorpusLibrary from './CorpusLibrary.vue';
import type {CatalogPage,CatalogItem,Stage,ScopeSuggestion} from '../types';
const props=defineProps<{stages:Stage[];busy:boolean}>();
const showCorpus=ref(false),showOntology=ref(false);
const curatedStages=computed(()=>props.stages.filter(s=>s.contentType!=='source'&&!s.isOntology));
const emit=defineEmits<{start:[id:number];external:[url:string];entity:[action:ScopeSuggestion]}>();
const data=ref<CatalogPage>(),query=ref(''),kind=ref(''),region=ref(''),availability=ref(''),page=ref(1),loading=ref(false),error=ref(''),selected=ref<CatalogItem>();
let sequence=0,timer:ReturnType<typeof setTimeout>|undefined;
async function load(){const seq=++sequence;loading.value=true;error.value='';try{const result=await api<CatalogPage>(`/api/catalog?${new URLSearchParams({q:query.value,kind:kind.value,region:region.value,availability:availability.value,page:String(page.value)})}`);if(seq===sequence){data.value=result;}}catch(e){if(seq===sequence)error.value=(e as Error).message;}finally{if(seq===sequence)loading.value=false;}}
watch([query,kind,region,availability],()=>{page.value=1;selected.value=undefined;++sequence;clearTimeout(timer);timer=setTimeout(load,180);});
function turn(delta:number){page.value=(data.value?.page??1)+delta;void load();}
function choose(item:CatalogItem){selected.value=item;}
const related=computed(()=>props.stages.filter(s=>selected.value?.guideIds.includes(s.id)||selected.value?.summaryIds.includes(s.id)));
const matchingTopics=computed(()=>{const normalize=(s:string)=>s.replace(/[\s，。、·「」“”！!？?（）()：:]/g,'');const q=normalize(query.value);return q?curatedStages.value.filter(s=>normalize([s.title,...s.taskTitles??[]].join(' ')).includes(q)):[];});
const title=(id:string)=>data.value?.kinds.find(k=>k.id===id)?.title??id;
onMounted(load);onUnmounted(()=>{++sequence;clearTimeout(timer);});
</script>
<template>
  <section class="page-scroll catalog-page">
    <div class="page-heading"><span class="eyebrow">STORIES ACROSS TEYVAT</span><h1>剧情目录</h1><p>从主线到街角闲谈，找到下一段想聊的故事。目录标题本身可能透露剧情。</p></div>
    <div class="catalog-tabs"><button class="button" :class="!showCorpus&&!showOntology?'primary':'subtle'" @click="showCorpus=false;showOntology=false">精选摘要与提纲</button><button class="button" :class="showCorpus?'primary':'subtle'" @click="showCorpus=true;showOntology=false">原文资料库</button><button class="button" :class="showOntology?'primary':'subtle'" @click="showOntology=true;showCorpus=false">实体与名词索引</button></div>
    <OntologyBrowser v-if="showOntology" :busy="busy" @open="emit('entity',$event)"/>
    <CorpusLibrary v-else-if="showCorpus" :busy="busy" @start="emit('start',$event)"/>
    <template v-else>
    <div v-if="data" class="catalog-stats"><span><strong>{{data.counts.catalog.toLocaleString()}}</strong> 条目录记录</span><span><strong>{{data.counts.outlineScopes}}</strong> 个提纲主题</span><span><strong>{{data.counts.originalRecords+data.counts.summaryRecords}}</strong> 条精选摘要</span><small>目录含重复与不同层级；对白仍在补齐 · {{data.capturedOn}}</small></div>
    <details class="topic-shelf"><summary>直接选择讲解主题 <ChevronRight :size="15"/></summary><div class="topic-grid"><button v-for="stage in curatedStages" :key="stage.id" class="topic-button" :disabled="busy" @click="emit('start',stage.id)"><small>{{stage.category??'蒙德精选片段'}}</small><strong>{{stage.title}}</strong><span>选择范围 →</span></button></div></details>
    <div class="catalog-filters"><label class="search-box"><Search :size="17"/><input v-model="query" aria-label="搜索全部剧情目录" placeholder="任务、人物、系列或地点…" maxlength="200"/></label><select v-model="kind" aria-label="目录类型"><option value="">全部类型</option><option v-for="k in data?.kinds" :key="k.id" :value="k.id">{{k.title}} · {{k.count}}</option></select><select v-model="region" aria-label="目录地区"><option value="">全部地区</option><option v-for="r in data?.regions" :key="r">{{r}}</option></select><select v-model="availability" aria-label="内容状态"><option value="">全部内容状态</option><option value="summary">有精选摘要</option><option value="outline">有关联提纲</option><option value="source">有原文资料</option><option value="pending">仅目录，待补正文</option></select></div>
    <div v-if="matchingTopics.length" class="matching-topics"><p class="catalog-result">名称匹配的讲解主题（独立于下方目录筛选）</p><div class="topic-grid"><button v-for="stage in matchingTopics" :key="stage.id" class="topic-button" :disabled="busy" @click="emit('start',stage.id)"><small>{{stage.category??'蒙德精选'}}</small><strong>{{stage.title}}</strong><span>选择范围 →</span></button></div></div>
    <p v-if="error" role="alert">{{error}} <button @click="load">重试</button></p><p class="catalog-result" aria-live="polite">{{loading?'正在查找…':`找到 ${data?.total??0} 条记录`}}</p>
    <div class="catalog-list"><button v-for="item in data?.items" :key="item.id" class="catalog-row" @click="choose(item)"><span class="catalog-kind">{{title(item.kind)}}</span><span><strong>{{item.title}}</strong><small>{{item.kind==='npc'?`${item.regionHint??item.group} · 人物身份与地区待核对`:item.region+' · '+item.group}}</small></span><span :class="['content-status',{ready:item.summaryIds.length}]">{{item.summaryIds.length?'精选摘要':item.guideIds.length?'关联提纲':item.sourcePages?.length?'原文待核对':'正文待补'}}</span><ArrowUpRight :size="16"/></button></div>
    <div v-if="!loading && !data?.items.length" class="empty-state"><Search :size="28"/><h3>没有匹配的目录</h3><p>试试缩短名称，或调整类型与地区。</p></div>
    <div v-if="data" class="catalog-pagination"><button class="button subtle" :disabled="data.page<=1||loading" @click="turn(-1)">上一页</button><span>{{data.page}} / {{Math.max(1,Math.ceil(data.total/data.pageSize))}}</span><button class="button subtle" :disabled="data.page*data.pageSize>=data.total||loading" @click="turn(1)">下一页</button></div>
    <p class="content-scope">目录依据 BWIKI 快照整理。关联原文按来源页的准确名称建立；NPC 索引分组保留原样，地区以所选原文的来源字段另行展示。新章节的实装状态尚未独立核实。任务名录、剧情摘要和完整对白的覆盖率分别计算。</p>
    <div v-if="selected" class="modal-backdrop" @click.self="selected=undefined"><section class="evidence-drawer catalog-detail" role="dialog" aria-modal="true" aria-labelledby="catalog-title"><button class="drawer-close icon-button" aria-label="关闭目录详情" @click="selected=undefined"><X :size="20"/></button><span class="eyebrow">STORY INDEX</span><h2 id="catalog-title">{{selected.title}}</h2><p>{{title(selected.kind)}} · {{selected.group}}</p><p class="scope-note">已建立目录；完整正文与逐句对白待核对。下方关联提纲或摘要只覆盖注明的范围。</p><dl class="provenance"><div><dt>地区</dt><dd>{{selected.region}}</dd></div><div v-if="selected.location"><dt>来源所列位置</dt><dd>{{selected.location}}</dd></div><div><dt>索引修订</dt><dd>{{selected.sourceRevision??'未固定修订号'}}</dd></div><div><dt>来源阅读器行</dt><dd>{{selected.sourceLine}}（非游戏对白 ID）</dd></div></dl><p v-if="selected.kind==='npc'">索引分组不等于国籍或当前所在地。同名、重复出现记录尚未合并为同一人物。</p><p v-if="selected.releaseStatus==='wiki_update_announcement_only'">本条仅由更新专题补充，官方实装状态与情节仍待核对。</p><p v-if="selected.note">{{selected.note}}</p><p v-if="selected.sourceCaveat">{{selected.sourceCaveat}}</p><h3>相关讲解</h3><div class="topic-grid"><button v-for="stage in related" :key="stage.id" class="topic-button" :disabled="busy" @click="emit('start',stage.id)"><small>{{stage.category}}</small><strong>{{stage.title}}</strong><span>选择范围 →</span></button></div><h3 v-if="selected.sourcePages?.length">关联原文</h3><div class="topic-grid"><button v-for="source in selected.sourcePages" :key="source.pageid" class="topic-button" :disabled="busy" @click="emit('start',source.stageId)"><strong>{{source.title}}</strong><small>来源所列地区：{{source.region}} · {{source.location || '位置未标注'}}</small><small>修订 {{source.revision}} · 自动解析，尚未逐条核对</small><span>选择原文范围 →</span></button></div><p v-if="!related.length && !selected.sourcePages?.length">当前只有目录入口，还不能基于这一条目进行有出处的剧情讲解。</p><button class="button primary source-link" @click="emit('external',selected.sourceUrl)"><BookOpen :size="15"/>查看索引出处</button><button class="button subtle source-link" @click="emit('external',selected.lookupUrl)">在 BWIKI 查找该名称<ArrowUpRight :size="15"/></button><p class="source-disclaimer">外部页面可能包含后续剧情。BWIKI：CC BY-NC-SA 4.0。</p></section></div>
    </template>
  </section>
</template>
