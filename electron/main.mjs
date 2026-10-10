import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, safeStorage, shell } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { createApp } from '../server/app.mjs';
import {petBounds} from './pet-bounds.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.STORY_DATA_DIR ?? (app.isPackaged?join(dirname(app.getPath('exe')),'user-data'):join(root,'.local','desktop'));
mkdirSync(dataDir,{recursive:true});
app.setPath('userData',dataDir);app.setPath('sessionData',join(dataDir,'chromium'));app.setPath('crashDumps',join(dataDir,'crashes'));app.setAppLogsPath(join(dataDir,'logs'));
const testMode=process.env.STORY_TEST_MODE==='1';
let mainWindow,petWindow,tray,service,quitting=false,petExpanded=false;
const single=app.requestSingleInstanceLock();
if(!single)app.quit();
else {
  app.on('second-instance',()=>{mainWindow?.show();mainWindow?.focus();});
  app.whenReady().then(start).catch(error=>{console.error('桌面应用启动失败：',error.message);app.exit(1);});
}

function trayImage(){
  const size=32,bitmap=Buffer.alloc(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const p=(y*size+x)*4,inside=(x-16)**2+(y-16)**2<200,eye=((x-11)**2+(y-15)**2<3)||((x-21)**2+(y-15)**2<3);
    const color=eye?[72,99,61]:[216,229,188];bitmap[p]=color[2];bitmap[p+1]=color[1];bitmap[p+2]=color[0];bitmap[p+3]=inside?255:0;
  }
  return nativeImage.createFromBitmap(bitmap,{width:size,height:size});
}
function showChat(){if(mainWindow?.isMinimized())mainWindow.restore();mainWindow?.show();mainWindow?.focus();}
function harden(win){
  win.webContents.setWindowOpenHandler(({url})=>{openSource(url);return{action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==service.origin){event.preventDefault();openSource(url);}});
  win.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
}
function openSource(value){try{const url=new URL(value);if(url.protocol==='https:' && url.hostname==='wiki.biligame.com' && !url.username && !url.password)void shell.openExternal(url.href);}catch{}}

async function start(){
  const keyPath=join(dataDir,'model-key.enc');
  const secrets={
    persistent:safeStorage.isEncryptionAvailable(),
    read:()=>{if(!existsSync(keyPath))return'';try{return safeStorage.decryptString(readFileSync(keyPath));}catch{return'';}},
    write:value=>{if(!safeStorage.isEncryptionAvailable())throw new Error('系统密钥加密暂不可用，请检查当前登录用户');const temp=`${keyPath}.tmp`;writeFileSync(temp,safeStorage.encryptString(value));renameSync(temp,keyPath);},
    clear:()=>{if(existsSync(keyPath))unlinkSync(keyPath);}
  };
  service=await createApp({root,dataDir,port:0,secrets,onState:state=>{if(petWindow && !petWindow.isDestroyed())petWindow.webContents.send('story:state',state);}});
  const options={preload:join(root,'electron','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false};
  mainWindow=new BrowserWindow({width:1320,height:930,minWidth:800,minHeight:650,title:'世界树-提瓦特',backgroundColor:'#f8f7ef',show:false,autoHideMenuBar:true,webPreferences:options});
  mainWindow.setMenu(null);harden(mainWindow);
  mainWindow.on('close',event=>{if(!quitting){event.preventDefault();mainWindow.hide();petWindow?.showInactive();}});
  const area=screen.getPrimaryDisplay().workArea;
  petWindow=new BrowserWindow({width:240,height:260,x:area.x+area.width-265,y:area.y+area.height-290,frame:false,transparent:true,resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,show:false,webPreferences:options});
  petWindow.setAlwaysOnTop(true,'floating');harden(petWindow);
  petWindow.on('close',event=>{if(!quitting){event.preventDefault();petWindow.hide();}});
  const trusted=event=>[mainWindow?.webContents,petWindow?.webContents].includes(event.sender) && new URL(event.senderFrame.url).origin===service.origin;
  ipcMain.on('story:open-chat',event=>{if(trusted(event))showChat();});
  ipcMain.on('story:hide-chat',event=>{if(trusted(event)){mainWindow.hide();petWindow.showInactive();}});
  ipcMain.on('story:show-pet',event=>{if(trusted(event))petWindow.showInactive();});
  ipcMain.on('story:open-external',(event,url)=>{if(trusted(event) && typeof url==='string')openSource(url);});
  ipcMain.handle('story:pet-panel',(event,expanded)=>{
    if(!trusted(event)||event.sender!==petWindow.webContents||typeof expanded!=='boolean')throw Error('无效桌宠请求');
    const bounds=petWindow.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    petExpanded=expanded;petWindow.setIgnoreMouseEvents(false);
    petWindow.setBounds(petBounds(bounds,area,expanded));
    if(expanded){petWindow.show();petWindow.focus();}
    return {expanded};
  });
  ipcMain.on('story:pet-passthrough',(event,enabled)=>{if(trusted(event)&&event.sender===petWindow.webContents&&typeof enabled==='boolean')petWindow.setIgnoreMouseEvents(!petExpanded&&enabled,{forward:true});});
  ipcMain.on('story:move-pet',(event,delta)=>{
    if(event.sender!==petWindow.webContents || !Number.isFinite(delta?.x) || !Number.isFinite(delta?.y) || Math.abs(delta.x)>1000 || Math.abs(delta.y)>1000)return;
    const bounds=petWindow.getBounds(),display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const x=Math.max(display.x,Math.min(display.x+display.width-bounds.width,bounds.x+Math.round(delta.x)));
    const y=Math.max(display.y,Math.min(display.y+display.height-bounds.height,bounds.y+Math.round(delta.y)));
    petWindow.setPosition(x,y);
  });
  await Promise.all([mainWindow.loadURL(`${service.origin}/chat`),petWindow.loadURL(`${service.origin}/pet`)]);
  if(!testMode){mainWindow.show();petWindow.showInactive();}
  tray=new Tray(trayImage());tray.setToolTip('世界树-提瓦特 · 剧情与你同行');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'打开剧情对话',click:showChat},{label:'显示桌宠',click:()=>petWindow.showInactive()},{label:'隐藏桌宠',click:()=>petWindow.hide()},{type:'separator'},{label:'退出世界树-提瓦特',click:()=>app.quit()}]));
  tray.on('double-click',showChat);
  globalShortcut.register('CommandOrControl+Shift+Space',showChat);
}
app.on('activate',()=>showChat());
app.on('window-all-closed',()=>{});
app.on('before-quit',event=>{
  if(quitting)return;event.preventDefault();quitting=true;globalShortcut.unregisterAll();tray?.destroy();
  void Promise.resolve(service?.close()).finally(()=>app.quit());
});
