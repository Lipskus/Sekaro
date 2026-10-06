import {useEffect, useRef, useState} from 'react';
import {useOptionalAuth} from '../context/AuthContext';
import {useOperationsLanguage} from '../context/operationsLanguage';
import {api} from '../api';
import {Button, Panel, ErrorNotice} from './ui';

export default function GmailConnection(){
 const {user}=useOptionalAuth()||{};
 return user?.role==='admin'?<GmailPanel/>:null;
}
function GmailPanel(){
 const {ct}=useOperationsLanguage();
 const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 const pending=useRef(false);
 useEffect(()=>{let active=true;api.get('/gmail/status').then(d=>{if(active){setData(d);setError(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry]);
 async function connect(inbox_id=null){
  if(pending.current)return;pending.current=true;setBusy(true);setError(null);
  try{const d=await api.post('/gmail/authorize',{inbox_id});const url=new URL(d.url);if(url.origin!=='https://accounts.google.com')throw new Error(ct('Nieprawidłowy adres autoryzacji.'));window.location.assign(url.href);}
  catch(e){setError(e.message);pending.current=false;setBusy(false);}
 }
 const result=new URLSearchParams(window.location.search).get('gmail');
 return <Panel title="Gmail API">
  <p>{ct('Połącz Gmail lub Google Workspace. Nowa skrzynka rozpocznie pracę ze wstrzymaną wysyłką.')}</p>
  {result==='connected'&&<p role="status" className="sk-notice tone-green">{ct('Skrzynka Gmail została połączona.')}</p>}
  {result==='cancelled'&&<p role="status">{ct('Anulowano zgodę Google. Możesz spróbować ponownie.')}</p>}
  <ErrorNotice error={error} onRetry={()=>setRetry(n=>n+1)}/>
  {!data&&!error&&<p role="status">{ct('Sprawdzanie konfiguracji Gmail…')}</p>}
  {data&&<>
   {data.demo?<p className="sk-notice tone-amber">{ct('Połączenia Gmail są wyłączone w demo.')}</p>:!data.configured&&<p className="sk-notice tone-amber">{ct('Administrator serwera musi skonfigurować Google OAuth, HTTPS i klucz szyfrowania. Instrukcja: docs/STAGE_9_GMAIL.md.')}</p>}
   <Button disabled={busy||data.demo||!data.configured} onClick={()=>connect()}>{ct('Połącz Gmail')}</Button>
   {data.accounts.map(a=><div key={a.inbox_id} className="sk-notice">
    <strong>{a.email}</strong><p>{ct(a.paused?'Wysyłka wstrzymana':'Wysyłka aktywna')}</p>
    <Button disabled={busy||data.demo||!data.configured} onClick={()=>connect(a.inbox_id)}>{ct('Połącz ponownie')}</Button>
   </div>)}
  </>}
 </Panel>;
}
