import {digest} from './story-sources.mjs';
export const recordFingerprint=r=>digest(JSON.stringify([r.text,r.interpretation??'',r.quote??'',r.branch??null,r.sourceId]));
export function applySemanticReviews(pack,pages,reviews){
 const byId=new Map(pages.map(p=>[p.pageid,p]));
 for(const record of pack.records){const review=reviews.find(r=>r.id===record.id);if(!review)continue;
  const valid=recordFingerprint(record)===review.recordHash&&review.evidence.length>0&&review.evidence.every(e=>{const p=byId.get(e.pageid);return p&&p.revision===e.revision&&p.sha256===e.sha256&&e.fragments.length>0&&e.fragments.every(f=>p.sections.some(s=>JSON.stringify(s.path)===JSON.stringify(f.path)&&digest(s.text)===f.textHash));});
  record.semanticReview={status:valid?'source-reviewed':'stale-needs-review',checkedAt:review.checkedAt,note:review.note,evidence:review.evidence};
 }
}
