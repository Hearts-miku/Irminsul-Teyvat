<script setup lang="ts">
import {ref,computed,watch} from 'vue';
import {X,Check,ShieldCheck} from '@lucide/vue';
import type {Stage} from '../types';
const props=defineProps<{stages:Stage[];current:number;initial:number;busy:boolean}>();
const emit=defineEmits<{close:[];confirm:[id:number]}>();
const selected=ref(props.initial),query=ref(''),type=ref('main'),region=ref(''),page=ref(1);
const selectedStage=computed(()=>props.stages.find(s=>s.id===selected.value));
const regions=computed(()=>[...new Set(props.stages.map(s=>s.region).filter((x):x is string=>!!x))].sort());
const normalize=(s:string)=>s.replace(/[\s，。、·「」“”！!？?（）()：:]/g,'').toLowerCase();
const matches=computed(()=>{
 const q=normalize(query.value);
 return props.stages.filter(s=>(!region.value||s.region===region.value)&&(type.value==='all'||type.value==='main'&&s.isMainChapter||type.value==='summary'&&(!s.contentType||s.contentType==='summary')||type.value==='outline'&&s.contentType==='outline'||type.value==='source'&&s.contentType==='source'&&!s.isMainChapter)&&(!q||normalize([s.title,s.subtitle,s.region,s.series,...s.taskTitles??[]].join(' ')).includes(q)))
 .sort((a,b)=>Number(!!b.isMainChapter)-Number(!!a.isMainChapter)||(a.isMainChapter&&b.isMainChapter?(b.chapterOrder??0)-(a.chapterOrder??0):a.title.localeCompare(b.title,'zh-CN')));
});
const pages=computed(()=>Math.max(1,Math.ceil(matches.value.length/20)));
const visible=computed(()=>matches.value.slice((page.value-1)*20,page.value*20));
watch([query,type,region],()=>{page.value=1;});
</script>
<template>
 <div class="modal-backdrop centered" @click.self="emit('close')"><section class="progress-modal" role="dialog" aria-modal="true" aria-labelledby="progress-title">
  <button class="drawer-close icon-button" aria-label="关闭进度设置" :disabled="busy" @click="emit('close')"><X :size="20"/></button><ShieldCheck class="modal-symbol" :size="28"/><h2 id="progress-title">故事讲到哪里？</h2><p>主线按阅读顺序倒序排列。选择某章将开放该章及之前的已入库主线剧情；后续章节保持关闭。</p>
  <input class="scope-search" v-model="query" aria-label="查找讲解范围" placeholder="搜索章节、子任务、NPC 或地区…" maxlength="100"/>
  <div class="progress-filters"><select v-model="type" aria-label="进度内容类型"><option value="main">主线章节</option><option value="summary">精选摘要</option><option value="source">原文任务与 NPC</option><option value="outline">剧情提纲</option><option value="all">全部范围</option></select><select v-model="region" aria-label="进度地区"><option value="">全部地区</option><option v-for="r in regions" :key="r">{{r}}</option></select></div>
  <p class="field-help" aria-live="polite">找到 {{matches.length}} 个范围 · {{page}} / {{pages}}</p>
  <label v-for="stage in visible" :key="stage.id" :class="['progress-option',{chosen:selected===stage.id}]"><input type="radio" v-model="selected" :value="stage.id"/><span><strong>讲到「{{stage.title}}」</strong><small>{{stage.isMainChapter?stage.subtitle+' · 包含本章及之前主线':stage.scopeMode==='independent'?stage.subtitle+' · 仅本主题':`包含第 1 至 ${stage.id} 段任务`}}</small></span><Check v-if="selected===stage.id" :size="17"/></label>
  <p v-if="!matches.length" class="field-help">没有匹配范围，请缩短关键词或调整地区。</p>
  <div v-if="pages>1" class="catalog-pagination"><button class="button subtle" :disabled="page<=1" @click="page--">上一页范围</button><span>{{page}} / {{pages}}</span><button class="button subtle" :disabled="page>=pages" @click="page++">下一页范围</button></div>
  <div v-if="selectedStage" class="progress-selection"><strong>已选：{{selectedStage.title}}</strong><p>{{selectedStage.summary??'开放该阶段及前面的蒙德精选片段。'}}</p></div>
  <p class="reset-note">变更范围会清空当前对话，重新开始，避免之前的内容影响新的剧透边界。其他对话不受影响。</p><button class="button primary full-width" :disabled="busy||!selectedStage||selected===current" @click="emit('confirm',selected)">{{busy?'正在更新…':'确认剧情范围'}}</button>
 </section></div>
</template>
