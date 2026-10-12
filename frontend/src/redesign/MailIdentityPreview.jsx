import {useState,useEffect} from 'react';
import {api} from '../api';
import {useOperationsLanguage} from '../context/operationsLanguage';
import SafeEmail from './SafeEmail';
import {ErrorNotice} from './ui';
export default function MailIdentityPreview({inboxId,body,isHtml=false}){
 const {ct}=useOperationsLanguage(),[data,setData]=useState(null),[error,setError]=useState(null);
 useEffect(()=>{let active=true;setData(null);setError(null);if(!inboxId||!body)return;const timer=setTimeout(()=>api.post(`/inboxes/${inboxId}/identity-preview`,{body,is_html:isHtml}).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}),350);return()=>{active=false;clearTimeout(timer);};},[inboxId,body,isHtml]);
 if(!body)return null;
 return <details><summary>{ct('Podgląd wiadomości ze stopką')}</summary><ErrorNotice error={error}/>{data?(<>{data.smime_enabled&&<p>S/MIME</p>}{data.is_html?<SafeEmail html={data.body}/>:<pre style={{whiteSpace:'pre-wrap'}}>{data.body}</pre>}</>):!error&&<p>{ct('Ładowanie…')}</p>}</details>;
}
