import {digest} from './story-sources.mjs';
export function reviewedDuplicate(duplicate,page,reviews){
 return reviews.find(r=>r.pageid===page.pageid&&r.revision===page.revision&&r.sha256===page.sha256&&r.textHash===digest(duplicate.text)&&r.occurrencesHash===digest(JSON.stringify(duplicate.occurrences))&&r.decision==='preserve');
}
