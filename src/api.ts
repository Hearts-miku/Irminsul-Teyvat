const token = document.querySelector<HTMLMetaElement>('meta[name="app-token"]')?.content ?? '';
export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json','X-App-Token':token,...options.headers}});
  if(!response.ok){const data=await response.json().catch(()=>({error:'本地服务暂时没有响应'}));throw new Error(data.error ?? '请求失败');}
  return response.json();
}
export async function streamChat(sessionId:string,question:string,signal:AbortSignal,onEvent:(event:any)=>void) {
  const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify({sessionId,question}),signal});
  if(!response.ok){const data=await response.json();throw new Error(data.error ?? '讲解请求失败');}
  if(!response.body)throw new Error('本地服务没有返回内容');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',doneEvent=false;
  try {
    while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);for(const line of frame.split('\n'))if(line.startsWith('data: ')){const event=JSON.parse(line.slice(6));if(event.type==='done')doneEvent=true;if(event.type==='error')throw new Error(event.message);onEvent(event);}}
      if(done)break;
    }
    if(!doneEvent)throw new Error('讲解连接中断，请重试');
  } finally {reader.releaseLock();}
}
