import {useEffect,useState,useRef} from 'react';
import {api} from '../api';
import {Button,ErrorNotice} from './ui';

const labels={retained:'Na serwerze / oczekuje',deleted:'Usunięto z serwera',absent:'Brak oryginału na serwerze',error:'Wymaga uwagi'};
export default function MailboxArchive({inboxId,onDirtyChange=()=>{},onBusyChange=()=>{},disabled=false,revision=0}){
 const saving=useRef(false);
 const [data,setData]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 const [mode,setMode]=useState('keep'),[days,setDays]=useState(30),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[before,setBefore]=useState(null);
 const dirty=!!data&&(mode!==data.mode||Number(days)!==data.days);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{let active=true;setLoading(true);setError(null);api.get(`/smtp/inboxes/${inboxId}/archive${before?`?before=${before}`:''}`).then(d=>{if(active){setData(d);setMode(d.mode);setDays(d.days);setConfirmed(false);}}).catch(()=>{if(active)setError('Nie udało się pobrać archiwum skrzynki.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[inboxId,before,retry,revision]);
 async function save(){
  if(saving.current||disabled||!dirty)return;saving.current=true;setBusy(true);onBusyChange(true);setError(null);setSaved(false);
  try{const result=await api.put(`/smtp/inboxes/${inboxId}/retention`,{mode,days:Number(days),confirm_delete:confirmed});setData(d=>({...d,...result}));setConfirmed(false);setSaved(true);}catch(e){setError(e.message);}finally{saving.current=false;setBusy(false);onBusyChange(false);}
 }
 async function download(id){setError(null);try{const response=await api.download(`/smtp/inboxes/${inboxId}/archive/${id}/eml`);const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`sekaro-${inboxId}-${id}.eml`;link.click();URL.revokeObjectURL(url);}catch(e){setError(e.message);}}
 return <div className="sk-mailbox-archive">
  <h3>Przechowywanie wiadomości</h3>
  <p>Pełne wiadomości z folderu INBOX, razem z załącznikami, są archiwizowane w bazie Sekaro. Archiwum jest objęte kopią zapasową bazy.</p>
  <ErrorNotice error={error} onRetry={!data?()=>setRetry(n=>n+1):undefined}/>
  {loading&&!data?<p role="status">Wczytywanie archiwum…</p>:data&&<>
   <label>Oryginały na serwerze<select aria-label="Oryginały na serwerze" value={mode} disabled={disabled||busy} onChange={e=>{setMode(e.target.value);setConfirmed(false);setSaved(false);}}>
    <option value="keep">Zostaw na serwerze</option><option value="immediate" disabled={!data.imap_configured}>Usuń po zarchiwizowaniu</option><option value="days" disabled={!data.imap_configured}>Usuń po określonej liczbie dni</option>
   </select></label>
   {mode==='days'&&<label>Dni od zarchiwizowania<input aria-label="Dni od zarchiwizowania" type="number" min="1" max="3650" value={days} disabled={disabled||busy} onChange={e=>setDays(e.target.value)}/></label>}
   {mode!=='keep'&&<div className="sk-notice tone-amber"><p>Usunięte oryginały znikną też z webmaila i innych klientów IMAP. Reguła obejmuje także już zarchiwizowane wiadomości. Usuwanie odbywa się podczas synchronizacji, wyłącznie po potwierdzeniu kompletnego zapisu i zgodności oryginału.</p>{dirty&&<label><input type="checkbox" checked={confirmed} disabled={disabled||busy} onChange={e=>setConfirmed(e.target.checked)}/>Potwierdzam usuwanie oryginałów z serwera</label>}</div>}
   <Button type="button" disabled={disabled||busy||!dirty||(mode!=='keep'&&!confirmed)||!Number.isInteger(Number(days))||Number(days)<1||Number(days)>3650} onClick={save}>{busy?'Zapisywanie…':'Zapisz przechowywanie'}</Button>
   {saved&&<p role="status">Zasady przechowywania zapisane.</p>}
   <section className="sk-archive-summary"><h3>Archiwum i synchronizacja</h3><p>{data.count} wiadomości · {(data.bytes/1024/1024).toLocaleString('pl-PL',{maximumFractionDigits:2})} MB</p><p>Ostatnia synchronizacja: {data.last_sync_at?new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(data.last_sync_at)?data.last_sync_at:data.last_sync_at+'Z').toLocaleString('pl-PL'):'brak'}</p><ErrorNotice error={data.sync_error}/><p>Pierwsze pobranie starszej poczty odbywa się partiami. Inne foldery niż INBOX nie są importowane.</p>
    <Button type="button" disabled={disabled||busy||dirty||loading} onClick={()=>setRetry(n=>n+1)}>Odśwież status</Button>
   </section>
   {!data.messages.length?<p>Brak pełnych wiadomości w archiwum. Pojawią się po synchronizacji IMAP.</p>:<ul className="sk-archive-list">{data.messages.map(m=><li key={m.id}><strong>{m.subject||'Bez tematu'}</strong><small>{m.from_address} · {(m.size_bytes/1024).toLocaleString('pl-PL',{maximumFractionDigits:1})} KB</small><span>{labels[m.removal_status]||m.removal_status}</span>{m.last_error&&<p role="alert">{m.last_error}</p>}<Button type="button" onClick={()=>download(m.id)}>Pobierz .eml</Button></li>)}</ul>}
   <div className="sk-mailbox-edit-actions">{before&&<Button type="button" disabled={dirty||busy||loading} onClick={()=>setBefore(null)}>Najnowsze</Button>}{data.next_before&&<Button type="button" disabled={dirty||busy||loading} onClick={()=>setBefore(data.next_before)}>Starsze wiadomości</Button>}</div>
  </>}
 </div>;
}
