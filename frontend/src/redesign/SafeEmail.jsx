import {useEffect,useRef} from 'react';
import DOMPurify from 'dompurify';
/* Remote resources and sender CSS never enter the application document. */
export default function SafeEmail({html}){
 const ref=useRef(null);
 useEffect(()=>{
  const host=ref.current;if(!host)return;const root=host.shadowRoot||host.attachShadow({mode:'open'});
  const fragment=DOMPurify.sanitize(html||'',{RETURN_DOM_FRAGMENT:true,FORBID_TAGS:['script','style','svg','math','iframe','object','embed','form','input','button','textarea','select','link','meta','base','video','audio','source'],FORBID_ATTR:['style','srcset','background'],USE_PROFILES:{html:true}});
  fragment.querySelectorAll('img').forEach(img=>{const span=document.createElement('span');span.textContent=img.alt?'['+img.alt+']':'[Obraz zdalny zablokowany]';span.className='blocked-image';img.replaceWith(span);});
  fragment.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href')||'';if(!/^(https?:|mailto:)/i.test(href)||/\/([oc])\/[\w-]+/.test(href))a.removeAttribute('href');else {a.target='_blank';a.rel='noopener noreferrer nofollow';}});
  const style=document.createElement('style');style.textContent=':host{display:block;color:var(--sk-text);font:inherit;line-height:1.5;overflow-wrap:anywhere}*{box-sizing:border-box;max-width:100%}p{margin:0 0 1em}a{color:var(--sk-blue)}table{width:auto;border-collapse:collapse}td,th{padding:5px;border:1px solid var(--sk-line)}blockquote{border-left:2px solid var(--sk-line);padding-left:12px;margin:12px 0;color:var(--sk-muted)}pre{white-space:pre-wrap}.blocked-image{font-size:11px;color:var(--sk-muted)}';
  root.replaceChildren(style,fragment);
 },[html]);
 return <div ref={ref} className="sk-safe-email"/>;
}
