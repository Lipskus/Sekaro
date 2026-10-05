import {useEffect, useRef, useState} from 'react';
import {useOptionalAuth} from '../context/AuthContext';
import {useOperationsLanguage} from '../context/operationsLanguage';
import {api} from '../api';
import {Button, Panel, ErrorNotice} from './ui';

export default function Office365Connection(){
 const {user}=useOptionalAuth()||{};
 return user?.role==='admin'?<Office365Panel/>:null;
}
function Office365Panel(){
 const {ct}=useOperationsLanguage();
 const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 const pending=useRef(false);
 useEffect(()=>{let active=true;api.get('/office365/status').then(d=>{if(active){setData(d);setError(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry]);
 async function connect(inbox_id=null){
  if(pending.current)return;pending.current=true;setBusy(true);setError(null);
  try{const d=await api.post('/office365/authorize',{inbox_id});const url=new URL(d.url);if(url.origin!=='https://login.microsoftonline.com')throw new Error(ct('Nieprawidłowy adres autoryzacji.'));window.location.assign(url.href);}
  catch(e){setError(e.message);pending.current=false;setBusy(false);}
 }
 const result=new URLSearchParams(window.location.search).get('office365');
 return <Panel title="Microsoft 365">
  <p>{ct('Połącz Microsoft 365 lub Outlook. Nowa skrzynka rozpocznie pracę ze wstrzymaną wysyłką.')}</p>
  {result==='connected'&&<p role="status" className="sk-notice tone-green">{ct('Skrzynka Microsoft 365 została połączona.')}</p>}
  {result==='cancelled'&&<p role="status">{ct('Anulowano zgodę Microsoft. Możesz spróbować ponownie.')}</p>}
  <ErrorNotice error={error} onRetry={()=>setRetry(n=>n+1)}/>
  {!data&&!error&&<p role="status">{ct('Sprawdzanie konfiguracji Microsoft 365…')}</p>}
  {data&&<>
   {data.demo?<p className="sk-notice tone-amber">{ct('Połączenia Microsoft 365 są wyłączone w demo.')}</p>:!data.configured&&<p className="sk-notice tone-amber">{ct('Administrator serwera musi skonfigurować Microsoft OAuth, HTTPS i klucz szyfrowania. Instrukcja: docs/STAGE_10_MAIL.md.')}</p>}
   <Button disabled={busy||data.demo||!data.configured} onClick={()=>connect()}>{ct('Połącz Microsoft 365')}</Button>
   {data.accounts.map(a=><div key={a.inbox_id} className="sk-notice">
    <strong>{a.email}</strong><p>{ct(a.paused?'Wysyłka wstrzymana':'Wysyłka aktywna')}</p>
    <Button disabled={busy||data.demo||!data.configured} onClick={()=>connect(a.inbox_id)}>{ct('Połącz ponownie')}</Button>
   </div>)}
  </>}
 </Panel>;
}
