<script setup lang="ts">
import {ref,onMounted,onUnmounted,watch} from 'vue';
import {Search,ArrowUpRight} from '@lucide/vue';
import {api} from '../api';
defineProps<{busy:boolean}>();
const emit=defineEmits<{start:[id:number]}>();
interface Page{pageid:number;stageId:number;title:string;kind:string;region:string;series:string;hasDialogue:boolean;fragments:number;revision:number;issues:boolean}
interface Results{items:Page[];total:number;page:number;pageSize:number;kinds:string[];report:{importedPages:number;indexedPages:number;pendingPages:number;dialoguePages:number;fragments:number;indexCapturedAt:string}}
const data=ref<Results>(),q=ref(''),kind=ref(''),dialogue=ref(false),fulltext=ref(false),page=ref(1),loading=ref(false),error=ref('');
let sequence=0,timer:ReturnType<typeof setTimeout>|undefined;
async function load(){const seq=++sequence;loading.value=true;error.value='';try{const result=await api<Results>('/api/corpus?'+new URLSearchParams({q:q.value,kind:kind.value,dialogue:String(dialogue.value),fulltext:String(fulltext.value),page:String(page.value)}));if(seq===sequence)data.value=result;}catch(e){if(seq===sequence)error.value=(e as Error).message;}finally{if(seq===sequence)loading.value=false;}}
watch([q,kind,dialogue,fulltext],()=>{page.value=1;++sequence;clearTimeout(timer);timer=setTimeout(load,220);});
function turn(delta:number){page.value=(data.value?.page??1)+delta;void load();}
onMounted(load);onUnmounted(()=>{++sequence;clearTimeout(timer);});
</script>
<template>
 <section class="corpus-library">
  <div class="page-heading"><h2>原文资料库</h2><p>查找任务与人物，选择单页范围开始对话。标题及原文可能包含后续剧情。</p></div>
  <div v-if="data" class="catalog-stats"><span><strong>{{data.report.importedPages.toLocaleString()}}</strong> 页资料</span><span><strong>{{data.report.dialoguePages.toLocaleString()}}</strong> 页含对白标记</span><span><strong>{{data.report.fragments.toLocaleString()}}</strong> 个解析片段</span></div>
  <p v-if="data?.report.pendingPages" class="scope-note">本轮分类清单 {{data.report.indexedPages.toLocaleString()}} 页，尚有 {{data.report.pendingPages.toLocaleString()}} 页未获取，未计入可用资料。</p>
  <p class="scope-note">自动采集资料，尚未逐条核对。含对白标记不等于对白完整；系列总页可能仅有索引，搜索系列名可找到子任务。选择范围后可离线阅读片段，或使用已配置的在线模型讲解。</p>
  <div class="catalog-filters"><label class="search-box"><Search :size="17"/><input v-model="q" aria-label="搜索原文资料" placeholder="任务、系列、人物或对白关键词…" maxlength="100"/></label><select v-model="kind" aria-label="原文类型"><option value="">全部类型</option><option v-for="k in data?.kinds" :key="k">{{k}}</option></select><label><input v-model="dialogue" type="checkbox"/>含对白标记</label><label><input v-model="fulltext" type="checkbox"/>同时搜索正文</label></div>
  <p v-if="error" role="alert">{{error}} <button @click="load">重试</button></p><p class="catalog-result" aria-live="polite">{{loading?'正在查找原文…':`找到 ${data?.total??0} 页资料`}}</p>
  <div class="catalog-list"><button v-for="item in data?.items" :key="item.pageid" class="catalog-row" :disabled="busy||!item.fragments" @click="emit('start',item.stageId)"><span class="catalog-kind">{{item.kind}}</span><span><strong>{{item.title}}</strong><small>{{item.region}} · {{item.series||'独立页面'}} · 修订 {{item.revision}}</small></span><span class="content-status">{{item.hasDialogue?'对白片段':'页面资料'}}{{item.issues?' · 解析待核对':''}}</span><ArrowUpRight :size="16"/></button></div>
  <div v-if="data" class="catalog-pagination"><button class="button subtle" :disabled="loading||data.page<=1" @click="turn(-1)">上一页原文</button><span>{{data.page}} / {{Math.max(1,Math.ceil(data.total/data.pageSize))}}</span><button class="button subtle" :disabled="loading||data.page*data.pageSize>=data.total" @click="turn(1)">下一页原文</button></div>
  <p class="content-scope">来源：原神 BWIKI 社区，CC BY-NC-SA 4.0；游戏内容权利归原权利人。原文采集与人工摘要分开统计，未收录的页面、模板及游戏分支不由模型补全。</p>
 </section>
</template>
