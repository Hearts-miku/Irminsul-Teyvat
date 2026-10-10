<script setup lang="ts">
import {ref,watch,onMounted,onUnmounted} from 'vue';
import {api} from '../api';
import type {ScopeSuggestion} from '../types';
defineProps<{busy:boolean}>();
const emit=defineEmits<{open:[action:ScopeSuggestion]}>();
interface Entity {id:string;name:string;type:string;stageId:number;status:string;reviewStatus?:string;reviewNote?:string;isDisambiguation?:boolean;ambiguous:boolean;evidenceCount:number;relationCount:number}
const q=ref(''),type=ref(''),page=ref(1),error=ref(''),selected=ref<Entity>(),loading=ref(false);
const data=ref<{total:number;items:Entity[];types:string[];summary:{entities:number;fieldRelations:number;reviewedEntities:number;reviewedRelations:number}}>();
let sequence=0,timer:ReturnType<typeof setTimeout>|undefined;
async function load(){const seq=++sequence;loading.value=true;error.value='';try{const r=await api<NonNullable<typeof data.value>>('/api/ontology?'+new URLSearchParams({q:q.value,type:type.value,page:String(page.value)}));if(seq===sequence)data.value=r;}catch(e){if(seq===sequence)error.value=(e as Error).message;}finally{if(seq===sequence)loading.value=false;}}
watch([q,type],()=>{page.value=1;selected.value=undefined;++sequence;clearTimeout(timer);timer=setTimeout(load,200);});
function turn(n:number){page.value+=n;void load();}
onMounted(load);onUnmounted(()=>{++sequence;clearTimeout(timer);});
</script>
<template>
 <section class="ontology-browser">
  <h2>实体与名词索引</h2>
  <p>关联全库人物、组织、地点、任务与名词。候选名称与自动字段关联尚未逐条人工核对；提及同一名词不代表人物之间存在事实关系。</p>
  <p v-if="data">{{data.summary.entities.toLocaleString()}} 个实体／候选 · {{data.summary.fieldRelations.toLocaleString()}} 条来源字段关联</p>
  <p v-if="data?.summary.reviewedEntities">已核对 {{data.summary.reviewedEntities}} 个对象的分类／别名、{{data.summary.reviewedRelations}} 条关系；核对范围见各对象说明。</p>
 <div class="catalog-filters"><input v-model="q" class="scope-search" aria-label="搜索实体与名词" placeholder="例如：西风骑士团、神之眼、甘露池" maxlength="100"/><select v-model="type" aria-label="实体类型"><option value="">全部类型</option><option v-for="t in data?.types" :key="t">{{t}}</option></select></div>
  <p v-if="error" role="alert">{{error}} <button @click="load">重试</button></p>
  <p>{{loading?'正在检索…':`找到 ${data?.total??0} 个对象`}}</p>
  <div class="topic-grid"><button v-for="entity in data?.items" :key="entity.id" class="topic-button" :disabled="busy" @click="selected=entity"><small>{{entity.type}} · {{entity.reviewStatus==='decision-reviewed'?'指代已核对':entity.reviewStatus==='source-reviewed'?'分类／别名已核对':entity.status==='candidate'?'候选，待核对':'来源字段，待核对'}}</small><strong>{{entity.name}}</strong><span>{{entity.evidenceCount}} 个关联片段 · {{entity.relationCount}} 条字段关联{{entity.ambiguous?' · 名称需消歧':''}}</span></button></div>
  <div class="catalog-pagination"><button class="button subtle" :disabled="page<=1||loading" @click="turn(-1)">上一页实体</button><span>{{page}} / {{Math.max(1,Math.ceil((data?.total??0)/30))}}</span><button class="button subtle" :disabled="page*30>=(data?.total??0)||loading" @click="turn(1)">下一页实体</button></div>
  <section v-if="selected" class="progress-selection"><h3>{{selected.name}} · {{selected.type}}</h3><p v-if="selected.reviewNote">{{selected.reviewNote}}</p><p v-if="selected.isDisambiguation">这里仅用于选择具体对象，不会一次开放所有关联剧情。选择后会新建对话，原对话保留。</p><p v-else>将新建对话并开放此对象的关联原文，可能包含后续剧情。原对话保留。字段归属、人物观点与选项条件仍应结合出处核对。</p><p v-if="!selected.evidenceCount&&!selected.isDisambiguation">已记录名称，但目前没有可用正文证据。</p><button class="button primary" :disabled="busy||(!selected.evidenceCount&&!selected.isDisambiguation)" @click="emit('open',{stageId:selected.stageId,label:selected.name,question:selected.name+'是什么？'})">{{selected.isDisambiguation?'选择具体对象':'开放实体关联资料（含后续剧情）'}}</button></section>
 </section>
</template>
