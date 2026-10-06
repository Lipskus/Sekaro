import {useEffect,useRef,useState} from 'react';
import ReactQuill from 'react-quill';
import {useOptionalAuth} from '../context/AuthContext';
import {useOperationsLanguage} from '../context/operationsLanguage';
import {api} from '../api';
import {Button,ErrorNotice} from './ui';
import SafeEmail from './SafeEmail';

export default function MailIdentity(props){
 const {user}=useOptionalAuth()||{}, {ct}=useOperationsLanguage();
 return user?.role==='admin'?<Editor {...props}/>:<p>{ct('Podpisami skrzynki zarządza administrator.')}</p>;
}
function Editor({inboxId,onDirtyChange,onBusyChange}){
 const {ct}=useOperationsLanguage();
 const [data,setData]=useState(null),[draft,setDraft]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[retry,setRetry]=useState(0);
 const lock=useRef(false),fileRef=useRef(null);
 const dirty=!!data&&JSON.stringify(draft)!==JSON.stringify(data);
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{let active=true;setData(null);setDraft(null);api.get(`/inboxes/${inboxId}/identity`).then(d=>{if(active){setData(d);setDraft(d);setError(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[inboxId,retry]);
 const change=(key,value)=>{setDraft(d=>({...d,[key]:value}));setSaved(false);};
 async function fileChanged(file){
  if(!file)return;if(file.size>250000){setError(ct('Certyfikat jest zbyt duży (maks. 250 KB).'));return;}
  try{const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);change('certificate',btoa(raw));change('remove_certificate',false);setError(null);}catch{setError(ct('Nie udało się odczytać certyfikatu.'));}
 }
 async function save(){
  if(lock.current||!dirty)return;lock.current=true;setBusy(true);onBusyChange?.(true);setError(null);
  try{const result=await api.put(`/inboxes/${inboxId}/identity`,{revision:data.revision,footer_enabled:draft.footer_enabled,footer_html:draft.footer_html,footer_text:draft.footer_text,smime_enabled:draft.smime_enabled,...(draft.certificate!==undefined?{certificate:draft.certificate,password:draft.password||''}:{}),remove_certificate:!!draft.remove_certificate});setData(result);setDraft(result);if(fileRef.current)fileRef.current.value='';setSaved(true);}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);onBusyChange?.(false);}
 }
 return <div className="sk-mailbox-archive">
  <h3>{ct('Stopka i S/MIME')}</h3><p>{ct('Obie opcje są niezależne i domyślnie wyłączone.')}</p>
  <ErrorNotice error={error} onRetry={!data?()=>setRetry(x=>x+1):undefined}/>
  {draft&&<fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
   <label><input type="checkbox" checked={draft.footer_enabled} onChange={e=>change('footer_enabled',e.target.checked)}/>{ct('Automatycznie dodawaj stopkę')}</label>
   <label>{ct('Stopka tekstowa')}<textarea aria-label={ct('Stopka tekstowa')} value={draft.footer_text} onChange={e=>change('footer_text',e.target.value)} maxLength={10000}/></label>
   <p>{ct('Stopka z formatowaniem')}</p><ReactQuill theme="snow" value={draft.footer_html} onChange={value=>change('footer_html',value)} modules={{toolbar:[['bold','italic','underline'],[{list:'ordered'},{list:'bullet'}],['link','clean']]}}/>
   <details><summary>{ct('Podgląd stopki')}</summary><SafeEmail html={draft.footer_html}/><pre style={{whiteSpace:'pre-wrap'}}>{draft.footer_text}</pre></details>
   <hr/><label><input type="checkbox" checked={draft.smime_enabled} disabled={!draft.encryption_ready} onChange={e=>change('smime_enabled',e.target.checked)}/>{ct('Podpisuj wiadomości certyfikatem S/MIME')}</label>
   <p>{ct('Włączone S/MIME blokuje wysyłkę, jeśli certyfikat jest nieprawidłowy. Nie gwarantuje ominięcia spamu.')}</p>
   {!draft.encryption_ready&&<p role="status">{ct('Import certyfikatu wymaga klucza szyfrowania na serwerze.')}</p>}
   {data.has_certificate&&<p>{ct('Certyfikat')}: {data.certificate_status==='valid'?ct('Ważny'):data.certificate_status} · {data.certificate_expires||'—'}</p>}
   <label>{ct('Certyfikat P12 / PFX')}<input ref={fileRef} type="file" accept=".p12,.pfx" disabled={!draft.encryption_ready} onChange={e=>fileChanged(e.target.files?.[0])}/></label>
   <label>{ct('Hasło certyfikatu')}<input type="password" autoComplete="new-password" value={draft.password||''} disabled={!draft.certificate} onChange={e=>change('password',e.target.value)}/></label>
   {data.has_certificate&&<label><input type="checkbox" checked={!!draft.remove_certificate} disabled={draft.smime_enabled} onChange={e=>{change('remove_certificate',e.target.checked);change('certificate',undefined);change('password',undefined);}}/>{ct('Usuń zapisany certyfikat przy zapisie')}</label>}
   <div className="sk-form-actions"><Button disabled={!dirty||busy} onClick={save}>{ct('Zapisz podpisy')}</Button><Button disabled={!dirty||busy} onClick={()=>{setDraft(data);setError(null);if(fileRef.current)fileRef.current.value='';}}>{ct('Anuluj')}</Button></div>
   {saved&&<p role="status">{ct('Podpisy zapisane.')}</p>}
  </fieldset>}
 </div>;
}
