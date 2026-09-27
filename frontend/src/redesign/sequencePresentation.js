import DOMPurify from 'dompurify';

export function sequenceDay(sequences, index) {
  return sequences.slice(0,index+1).reduce((days,step)=>days+(Number(step.wait_days_after_previous)||0),0);
}

export function sequenceExcerpt(step) {
  const body=step.sequence_type==='personalized' ? step.fallback_body : step.body;
  if(!body) return 'Brak treści wiadomości';
  if(!step.is_html) return String(body).replace(/\s+/g,' ').trim();
  const fragment=DOMPurify.sanitize(body,{ALLOWED_TAGS:[],ALLOWED_ATTR:[],RETURN_DOM_FRAGMENT:true});
  return (fragment.textContent||'').replace(/\s+/g,' ').trim() || 'Wiadomość HTML';
}
