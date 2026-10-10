const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('windborne', {
  openChat:()=>ipcRenderer.send('story:open-chat'),
  setPetPanel:expanded=>ipcRenderer.invoke('story:pet-panel',expanded),
  hideChat:()=>ipcRenderer.send('story:hide-chat'),
  showPet:()=>ipcRenderer.send('story:show-pet'),
  movePet:delta=>ipcRenderer.send('story:move-pet',delta),
  setPetPassthrough:enabled=>ipcRenderer.send('story:pet-passthrough',enabled),
  openExternal:url=>ipcRenderer.send('story:open-external',url),
  onState:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('story:state',handler);return()=>ipcRenderer.removeListener('story:state',handler);}
});
