import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=await createApp({root,dataDir:process.env.STORY_DATA_DIR ?? resolve(root,'.local/browser'),port:Number(process.env.PORT ?? 4210)});
console.log(`世界树-提瓦特已启动：${app.origin}`);
console.log('浏览器模式的密钥仅保留至本次服务退出；桌面版使用系统加密保存。');
for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{await app.close();process.exit(0);});
