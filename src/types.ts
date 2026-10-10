export interface ScopeSuggestion {stageId:number;label:string;question:string}
export interface SourcePage { pageid:number;stageId:number;title:string;revision:number;sha256:string;region:string;location:string;nationality:string;relation:string;verification:string }
export interface Source { id:string; title:string; publisher:string; revision:string; url:string; gameVersion:string;localDocument?:string;locator?:string;verificationLevel?:string;note?:string;links?:{title:string;url:string}[] }
export interface Evidence { sourcePages?:SourcePage[]; id:string; stage:number; topic:string; section:string; text:string;contentType?:string; quote?:string; speaker?:string; interpretation?:string; task:string; source:Source; verifiedAt:string; branch?:{group:string;option:string;joins:string} }
export interface Section { text:string; kind:'fact'|'inference'|'notice'; citationIds:string[] }
export interface Message { id:string; role:'user'|'assistant'; text?:string; sections?:Section[]; citations?:Evidence[]; followups?:string[]; mode?:string; warning?:string; status?:string;scopeSuggestions?:ScopeSuggestion[] }
export interface Session { id:string; title:string; progress:number; created_at:string }
export interface Settings { mode:'offline'|'cloud'; baseUrl:string; model:string; detail:'brief'|'normal'|'detailed'; hasKey:boolean; persistentKey:boolean; ready:boolean }
export interface Stage { id:number; title:string; subtitle:string; summary?:string; suggestions?:string[];category?:string;scopeMode?:string;contentType?:string;taskTitles?:string[];kind?:string;region?:string;series?:string;chapter?:string;chapterOrder?:number;isMainChapter?:boolean;childCount?:number;isOntology?:boolean }
export interface CatalogCounts {catalog:number;outlineScopes:number;outlineRecords:number;summaryScopes:number;summaryRecords:number;originalRecords:number}
export interface CatalogItem {id:string;title:string;kind:string;group:string;region:string;regionHint?:string;location?:string;sourceUrl:string;sourceRevision:string|null;sourceLine:number;lookupUrl:string;releaseStatus:string;guideIds:number[];summaryIds:number[];sourcePages?:SourcePage[];note?:string;sourceCaveat?:string;identityStatus?:string;source?:{title:string;url:string}}
export interface CatalogPage {items:CatalogItem[];total:number;page:number;pageSize:number;kinds:{id:string;title:string;count:number}[];regions:string[];counts:CatalogCounts;capturedOn:string}
export interface Bootstrap { pack:{id:string; title:string; chapter:string; version:string; coverage:string; verifiedAt:string; sha256:string; recordCount:number; stages:Stage[]};catalog:CatalogCounts; sessions:Session[]; settings:Settings }
export interface SessionView { session:Session; messages:Message[]; suggestions:string[];busy?:boolean }
declare global {
  interface Window { windborne?:{ openChat:()=>void;setPetPanel:(expanded:boolean)=>Promise<{expanded:boolean}>; hideChat:()=>void; openExternal:(url:string)=>void; setPetPassthrough:(enabled:boolean)=>void; movePet:(delta:{x:number;y:number})=>void; showPet:()=>void; onState:(fn:(state:string)=>void)=>()=>void } }
}
