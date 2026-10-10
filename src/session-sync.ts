export type SessionSignal={type:'session'|'updated'|'busy'|'settings'|'deleted';sessionId?:string;busy?:boolean};
export function sessionSync(receive:(signal:SessionSignal)=>void){
 const channel=new BroadcastChannel('windborne-conversation-v1');
 channel.onmessage=event=>{const value=event.data;if(value&&['session','updated','busy','settings','deleted'].includes(value.type))receive(value);};
 const storage=(event:StorageEvent)=>{if(event.key==='windborne-session'&&event.newValue)receive({type:'session',sessionId:event.newValue});};
 window.addEventListener('storage',storage);
 return {publish:(value:SessionSignal)=>channel.postMessage(value),close:()=>{channel.close();window.removeEventListener('storage',storage);}};
}
