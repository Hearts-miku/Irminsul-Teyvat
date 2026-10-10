<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { ArrowUp, ArrowUpRight, X, Square, BookOpen, Minus } from '@lucide/vue';
import WindSpirit from './WindSpirit.vue';
import { api, streamChat } from '../api';
import { sessionSync, type SessionSignal } from '../session-sync';
import type { Bootstrap, SessionView, Message, Evidence, ScopeSuggestion } from '../types';
const desktop=window.windborne;
const state=ref('idle'),expanded=ref(false),loading=ref(false),localBusy=ref(false),remoteBusy=ref(false);
const error=ref(''),status=ref(''),question=ref('');
const boot=ref<Bootstrap>(),view=ref<SessionView>(),messages=ref<Message[]>([]),evidence=ref<Evidence>();
const input=ref<HTMLTextAreaElement>(),scroll=ref<HTMLElement>();
const busy=computed(()=>localBusy.value||remoteBusy.value);
const stage=computed(()=>boot.value?.pack.stages.find(s=>s.id===view.value?.session.progress));
const followups=computed(()=>messages.value.filter(m=>m.role==='assistant').at(-1)?.followups??view.value?.suggestions??[]);
let cleanup:(()=>void)|undefined,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined,poll:ReturnType<typeof setInterval>|undefined;
let start:{x:number;y:number}|null=null,moved=false,resizing=false,sequence=0;
const shared=sessionSync(receive);
async function bottom(){await nextTick();scroll.value?.scrollTo({top:scroll.value.scrollHeight});}
async function load(){if(localBusy.value)return;const current=++sequence;loading.value=true;error.value='';try{const data=await api<Bootstrap>('/api/bootstrap');const active=localStorage.getItem('windborne-session');const found=data.sessions.find(s=>s.id===active)??data.sessions[0];if(!found)throw Error('主窗口正在准备会话，请稍后重试。');const result=await api<SessionView>(`/api/sessions/${found.id}`);if(current!==sequence||localBusy.value||localStorage.getItem('windborne-session')!==active)return;const changed=view.value?.session.id!==result.session.id||view.value?.session.progress!==result.session.progress;boot.value=data;view.value=result;messages.value=result.messages;remoteBusy.value=!!result.busy;if(changed)evidence.value=undefined;localStorage.setItem('windborne-session',found.id);await bottom();}catch(e){error.value=(e as Error).message;}finally{if(current===sequence)loading.value=false;}}
function receive(signal:SessionSignal){if(signal.type==='deleted'&&view.value?.session.id===signal.sessionId){question.value='';messages.value=[];evidence.value=undefined;view.value=undefined;}if(localBusy.value||!expanded.value)return;if(signal.type==='busy'&&signal.sessionId===view.value?.session.id){remoteBusy.value=!!signal.busy;if(signal.busy)return;}clearTimeout(timer);timer=setTimeout(()=>void load(),60);}
async function toggle(){if(resizing)return;resizing=true;try{const next=!expanded.value;await desktop?.setPetPanel(next);expanded.value=next;desktop?.setPetPassthrough(false);if(next){await load();await nextTick();input.value?.focus();}else evidence.value=undefined;}catch(e){error.value=(e as Error).message;}finally{resizing=false;}}
function down(event:PointerEvent){if(event.button!==0)return;start={x:event.screenX,y:event.screenY};moved=false;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
function move(event:PointerEvent){if(!start)return;const x=event.screenX-start.x,y=event.screenY-start.y;if(Math.abs(x)+Math.abs(y)>3){moved=true;desktop?.movePet({x,y});start={x:event.screenX,y:event.screenY};}}
function cancel(){start=null;moved=true;}
function activate(event:MouseEvent){if(!event.detail||!moved)void toggle();}
function escape(event:KeyboardEvent){if(event.key==='Escape'&&expanded.value){if(evidence.value)evidence.value=undefined;else void toggle();}}
function enter(event:KeyboardEvent){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void send();}}
async function source(id:string){try{evidence.value=await api<Evidence>(`/api/evidence/${id}?sessionId=${view.value!.session.id}`);}catch(e){error.value=(e as Error).message;}}
async function openEntity(action:ScopeSuggestion){if(busy.value)return;localBusy.value=true;try{const result=await api<SessionView>('/api/sessions',{method:'POST',body:JSON.stringify({progress:action.stageId})});view.value=result;messages.value=result.messages;evidence.value=undefined;boot.value=await api<Bootstrap>('/api/bootstrap');localStorage.setItem('windborne-session',result.session.id);shared.publish({type:'session',sessionId:result.session.id});localBusy.value=false;await send(action.question);}catch(e){error.value=(e as Error).message;}finally{localBusy.value=false;}}
async function send(value?:string){const text=(value??question.value).trim(),id=view.value?.session.id;if(!text||!id||busy.value||loading.value)return;if(text==='开放水仙十字结社专题（含后续剧情）'){try{const result=await api<SessionView>('/api/sessions',{method:'POST',body:JSON.stringify({progress:1900000001})});view.value=result;messages.value=result.messages;evidence.value=undefined;localStorage.setItem('windborne-session',result.session.id);shared.publish({type:'session',sessionId:result.session.id});await send('水仙十字结社是什么');}catch(e){error.value=(e as Error).message;}return;}localBusy.value=true;error.value='';question.value='';status.value='正在翻开这段故事…';controller=new AbortController();sequence++;shared.publish({type:'busy',sessionId:id,busy:true});messages.value.push({id:'pet-user',role:'user',text},{id:'pet-answer',role:'assistant',sections:[],citations:[]});await bottom();try{await streamChat(id,text,controller.signal,event=>{const pending=messages.value.find(m=>m.id==='pet-answer');if(event.type==='user'){const index=messages.value.findIndex(m=>m.id==='pet-user');if(index>=0)messages.value[index]=event.message;shared.publish({type:'updated',sessionId:id});}if(event.type==='status')status.value=event.text;if(event.type==='meta'&&pending)Object.assign(pending,{mode:event.mode,warning:event.warning,status:event.status,citations:event.citations});if(event.type==='section'&&pending)pending.sections!.push({text:'',kind:event.kind,citationIds:event.citationIds});if(event.type==='delta'&&pending)pending.sections![event.index]!.text+=event.text;if(event.type==='done'){const index=messages.value.findIndex(m=>m.id==='pet-answer');if(index>=0)messages.value[index]=event.message;}void bottom();});}catch(e){error.value=controller.signal.aborted?'已停止这次讲解，可以继续提问。':(e as Error).message;messages.value=messages.value.filter(m=>m.id!=='pet-answer');}finally{localBusy.value=false;status.value='';shared.publish({type:'busy',sessionId:id,busy:false});shared.publish({type:'updated',sessionId:id});await bottom();if(expanded.value)input.value?.focus();}}
onMounted(()=>{document.body.classList.add('pet-body');cleanup=desktop?.onState(value=>state.value=value);window.addEventListener('keydown',escape);poll=setInterval(()=>{if(expanded.value&&remoteBusy.value&&!localBusy.value)void load();},1500);});
onUnmounted(()=>{controller?.abort();cleanup?.();shared.close();clearTimeout(timer);clearInterval(poll);document.body.classList.remove('pet-body');window.removeEventListener('keydown',escape);});
</script>
<template>
<div class="pet-shell" :class="{'pet-expanded':expanded}">
  <section v-if="expanded" id="pet-dialogue" class="pet-dialogue" aria-label="桌宠对话面板">
    <header><div><small>STORIES ON THE WIND</small><h1>和风聊一会儿</h1></div><button aria-label="打开完整窗口" @click="desktop?.openChat()"><ArrowUpRight :size="18"/></button><button aria-label="收起对话面板" @click="toggle"><Minus :size="18"/></button></header>
    <div class="pet-scope"><BookOpen :size="13"/><span>{{stage?.title??'正在读取剧情范围…'}}</span><small>{{boot?.settings.mode==='cloud'?'在线讲解':'资料讲解'}}</small></div>
    <div ref="scroll" class="pet-messages" aria-live="polite">
      <p v-if="!messages.length" class="pet-welcome">{{loading?'正在翻开手记…':'想聊哪一段故事？可以直接问我，也可以接着上次聊。'}}</p>
      <article v-for="message in messages" :key="message.id" :class="['pet-message',message.role]">
        <p v-if="message.role==='user'">{{message.text}}</p>
        <template v-else><strong>风语精灵 <small>{{message.mode==='cloud'?'AI 讲解':'资料整理'}}</small></strong><p v-if="message.warning" class="pet-warning">{{message.warning}}</p><p v-for="(section,index) in message.sections" :key="index" :class="section.kind"><small v-if="section.kind==='inference'">【分析推断】</small>{{section.text}}</p><div class="pet-citations"><button v-for="(citation,index) in message.citations" :key="citation.id" :aria-label="`桌宠出处 ${index+1}`" @click="source(citation.id)">{{index+1}} · {{citation.topic}}</button></div></template>
      </article>
      <p v-if="busy" class="pet-status">{{localBusy?status:'主窗口正在讲解，请稍候…'}}</p>
    </div>
    <div v-if="error" class="pet-error" role="alert">{{error}} <button :disabled="busy" @click="load">重新读取</button></div>
    <div v-if="!busy&&messages.at(-1)?.scopeSuggestions?.length" class="pet-followups pet-scope-actions"><button v-for="action in messages.at(-1)?.scopeSuggestions" :key="action.stageId" @click="openEntity(action)">{{action.label}}</button></div>
    <div v-if="!busy&&followups.length" class="pet-followups"><button v-for="item in followups.slice(0,2)" :key="item" @click="send(item)">{{item}}</button></div>
    <form class="pet-composer" @submit.prevent="send()"><textarea ref="input" v-model="question" aria-label="桌宠剧情问题" placeholder="问问这段故事…" rows="2" maxlength="1000" :disabled="busy||loading" @keydown="enter"></textarea><button v-if="localBusy" type="button" aria-label="停止桌宠讲解" @click="controller?.abort()"><Square :size="14"/></button><button v-else type="submit" aria-label="发送桌宠问题" :disabled="busy||loading||!view||!question.trim()"><ArrowUp :size="18"/></button></form>
    <p class="pet-hint">Enter 发送 · Shift + Enter 换行 · 拖动精灵移动</p>
    <section v-if="evidence" class="pet-evidence" role="dialog" aria-label="桌宠资料出处"><button class="pet-evidence-close" aria-label="关闭桌宠出处" @click="evidence=undefined"><X :size="18"/></button><small>资料出处</small><h2>{{evidence.topic}}</h2><p>{{evidence.task}} · {{evidence.section}}</p><p>{{evidence.text}}</p><blockquote v-if="evidence.quote">{{evidence.quote}}</blockquote><p class="pet-warning">{{evidence.contentType==='source'?'自动解析原文，尚未逐条核对。':evidence.contentType==='outline'?'此条为剧情提纲。':'此条为资料整理，请结合来源核对。'}}</p><p v-if="evidence.source.note" class="pet-warning">{{evidence.source.note}}</p><small>{{evidence.source.publisher}} · {{evidence.source.revision}}</small><button class="pet-source-link" @click="desktop?.openExternal(evidence.source.url)">查看来源页 ↗</button></section>
  </section>
  <div class="pet-stage" @mouseenter="desktop?.setPetPassthrough(false)" @mouseleave="desktop?.setPetPassthrough(!expanded)"><button class="pet-open" :aria-label="expanded?'收起桌宠对话':'展开桌宠对话'" :aria-expanded="expanded" aria-controls="pet-dialogue" @pointerdown="down" @pointermove="move" @pointerup="start=null" @pointercancel="cancel" @click="activate"><WindSpirit :state="state"/></button><span class="pet-caption">{{state==='thinking'?'翻找故事中…':state==='speaking'?'听风讲故事':expanded?'我在这里，慢慢说':'点我聊聊剧情'}}</span></div>
</div>
</template>
