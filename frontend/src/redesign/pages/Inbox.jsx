import {useState,useEffect,useMemo,useRef,useCallback} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api} from '../../api';
import {useNotify} from '../../context/NotificationContext';
import {useConfirm} from '../../context/ConfirmContext';
import {Button,Badge,Avatar,Icon,Empty,ErrorNotice,dateTime,ContactStatus} from '../ui';
import SafeEmail from '../SafeEmail';
const tabs=[['all','Wszystkie'],['unread','Nieprzeczytane'],['needs_reply','Do odpowiedzi'],['bounced','Odbicia']];
const address=text=>{const s=String(text||'');return (s.match(/<([^<>]+@[^<>]+)>/)?.[1]||s.split(',')[0]).trim();};
const plain=html=>new DOMParser().parseFromString(html||'','text/html').body.textContent||'';
const threadKey=t=>t?`${t.inbox_id}:${t.thread_id}`:'';
export default function Inbox(){
 const [params]=useSearchParams(),notify=useNotify(),confirm=useConfirm();
 const [inboxes,setInboxes]=useState([]),[templates,setTemplates]=useState([]),[fields,setFields]=useState([]),[items,setItems]=useState([]),[counts,setCounts]=useState({}),[total,setTotal]=useState(0);
 const [inboxId,setInboxId]=useState(params.get('inbox')||''),[q,setQ]=useState(params.get('q')||''),[query,setQuery]=useState(params.get('q')||''),[tab,setTab]=useState('all'),[page,setPage]=useState(1);
 const [selected,setSelected]=useState(null),[thread,setThread]=useState(null),[contact,setContact]=useState(null),[blocked,setBlocked]=useState(null),[selectionError,setSelectionError]=useState('');
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[sending,setSending]=useState(false),[body,setBody]=useState('');
 const drafts=useRef({}),activeRef=useRef(null),requestId=useRef(0),listRequest=useRef(0),deepOpened=useRef(false),bodyRef=useRef('');
 const key=threadKey(selected);
 useEffect(()=>{api.get('/inboxes').then(setInboxes).catch(setError);api.get('/templates').then(setTemplates).catch(setError);api.get('/contact-fields').then(setFields).catch(setError);},[]);
 const loadList=useCallback(async()=>{const request=++listRequest.current;setLoading(true);try{
  const p=new URLSearchParams({page:String(page),page_size:'30',tab,q:query});if(inboxId)p.set('inbox_id',inboxId);
  const result=await api.get('/ui/unibox?'+p);if(request!==listRequest.current)return;setItems(result.items);setTotal(result.total);setCounts(result.counts||{});setError('');
 }catch(e){if(request===listRequest.current)setError(e);}finally{if(request===listRequest.current)setLoading(false);}},[page,tab,query,inboxId]);
 useEffect(()=>{loadList();return()=>{listRequest.current++;};},[loadList]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(q.trim()),250);return()=>clearTimeout(timer);},[q]);
 useEffect(()=>{setPage(1);},[query,inboxId,tab]);
 const choose=useCallback(async t=>{
  const previous=threadKey(activeRef.current);if(previous)drafts.current[previous]=bodyRef.current;
  activeRef.current=t;const currentKey=threadKey(t);bodyRef.current=drafts.current[currentKey]||'';setBody(bodyRef.current);setSelected(t);setThread(null);setContact(null);setBlocked(null);setSelectionError('');
  const rid=++requestId.current;
  try{
   const data=await api.get(`/unibox/threads/${encodeURIComponent(t.thread_id)}?inbox_id=${t.inbox_id}`);
   if(rid!==requestId.current)return;setThread(data);
   const email=t.lead_email||address([...data.messages].reverse().find(m=>m.direction==='received')?.from)||address([...data.messages].reverse().find(m=>m.direction==='sent')?.to);
   const [matches,suppressions]=await Promise.all([t.lead_id?api.get('/leads/'+t.lead_id):email?api.get('/leads?q='+encodeURIComponent(email)):Promise.resolve([]),api.get('/leads/suppression')]);
   if(rid!==requestId.current)return;
   let lead=Array.isArray(matches)?matches.find(l=>l.email.toLowerCase()===email.toLowerCase()):matches;
   if(lead&&!lead.interactions){lead=await api.get('/leads/'+lead.id);if(rid!==requestId.current)return;}
   setContact(lead||null);setBlocked(suppressions.find(x=>x.email.toLowerCase()===email.toLowerCase())||false);
   await api.post(`/unibox/threads/${encodeURIComponent(t.thread_id)}/mark-read?inbox_id=${t.inbox_id}`,{});
   if(rid===requestId.current)setItems(prev=>prev.map(x=>threadKey(x)===currentKey?{...x,unread_lead_reply:false}:x));
  }catch(e){if(rid===requestId.current)setSelectionError(e);}
 },[]);
 useEffect(()=>{if(!deepOpened.current&&params.get('thread')&&items.length){const target=items.find(x=>x.thread_id===params.get('thread')&&String(x.inbox_id)===params.get('inbox'));if(target){deepOpened.current=true;choose(target);}}},[items,params,choose]);
 useEffect(()=>{const warn=e=>{if(bodyRef.current.trim()||Object.values(drafts.current).some(v=>v.trim())){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 const editBody=value=>{bodyRef.current=value;drafts.current[key]=value;setBody(value);};
 const box=inboxes.find(i=>i.id===selected?.inbox_id);
 const recipient=contact?.email||selected?.lead_email||address([...(thread?.messages||[])].reverse().find(m=>m.direction==='received')?.from)||address([...(thread?.messages||[])].reverse().find(m=>m.direction==='sent')?.to);
 const title=contact?.name||selected?.lead_name||recipient||'Rozmowa';
 const sync=async()=>{setSyncing(true);try{await api.post('/unibox/sync',inboxId?{inbox_id:Number(inboxId)}:{});notify({type:'success',message:'Synchronizacja IMAP zlecona. Odśwież listę po jej zakończeniu.'});await loadList();}catch(e){setError(e);}finally{setSyncing(false);}};
 const send=async()=>{
  if(!body.trim()||!thread||sending||blocked!==false)return;
  const current=activeRef.current,currentKey=threadKey(current),text=body;
  if(!await confirm(`Wysłać odpowiedź do ${recipient} ze skrzynki ${box?.email||thread.inbox_account}?`))return;
  setSending(true);setSelectionError('');
  try{await api.post('/ui/reply',{inbox_id:current.inbox_id,to_email:recipient,subject:/^re:/i.test(thread.subject)?thread.subject:'Re: '+thread.subject,body:text,is_html:false,thread_id:current.thread_id});
   drafts.current[currentKey]='';if(threadKey(activeRef.current)===currentKey){bodyRef.current='';setBody('');await choose(current);}notify({type:'success',message:'Odpowiedź wysłana.'});await loadList();
  }catch(e){setSelectionError(e);}finally{setSending(false);}
 };
 const useTemplate=async id=>{const template=templates.find(t=>String(t.id)===id),v=template?.latest_version;if(!v)return;
  if(body.trim()&&!await confirm('Zastąpić treść szkicu wybranym szablonem?'))return;
  try{const r=await api.post('/templates/preview/render',{subject:v.subject,body:v.body,is_html:v.is_html,lead_id:contact?.id||null});if(r.missing_variables?.length){notify({type:'error',message:'Uzupełnij brakujące pola: '+r.missing_variables.join(', ')});return;}editBody(v.is_html?plain(r.body):r.body);notify({type:'success',message:v.is_html?'Wstawiono treść szablonu jako zwykły tekst.':'Wstawiono treść szablonu.'});}catch(e){setSelectionError(e);}
 };
 const block=async reason=>{if(!recipient||!await confirm(`Dodać ${recipient} do globalnej listy wykluczeń? Kolejne wysyłki do tego adresu zostaną zablokowane.`))return;try{const r=await api.post('/leads/suppression',{email:recipient,reason,source:'inbox'});setBlocked(r);notify({type:'success',message:'Adres został wykluczony z wysyłki.'});}catch(e){setSelectionError(e);}};
 const interactions=contact?.interactions||[];
 return <div className="sk-page sk-inbox-page">
  <div className="sk-page-heading"><div><h1>Wątki</h1><p>Prowadź rozmowy i odpowiadaj na wiadomości bezpośrednio w Sekaro.</p></div><div className="sk-heading-actions"><div className="sk-mailbox-select"><Icon name="mail" size={23}/><div className="sk-mailbox-select-body"><label htmlFor="inbox-picker">Skrzynka</label><select id="inbox-picker" value={inboxId} onChange={e=>setInboxId(e.target.value)}><option value="">Wszystkie skrzynki</option>{inboxes.map(i=><option key={i.id} value={i.id}>{i.email}</option>)}</select></div></div><Button className="compact" icon="refresh" onClick={sync} disabled={syncing}>{syncing?'Synchronizacja…':'Synchronizuj'}</Button></div></div>
  <ErrorNotice error={error} onRetry={loadList}/>
  <div className="sk-inbox-toolbar"><nav className="sk-tabs" aria-label="Filtry wiadomości">{tabs.map(([v,l])=><button className={`sk-tab ${v===tab?'active':''}`} key={v} onClick={()=>setTab(v)}>{l}<small>{counts[v]||0}</small></button>)}</nav><div className="sk-search-input"><Icon name="search" size={17}/><input aria-label="Szukaj w wątkach" placeholder="Szukaj w wątkach…" value={q} onChange={e=>setQ(e.target.value)}/></div><button className="sk-icon-button" aria-label="Odśwież listę" onClick={loadList}><Icon name="refresh" size={18}/></button></div>
  <div className={`sk-inbox-columns ${selected?'has-thread':''}`}>
   <section className="sk-thread-list" aria-label="Lista rozmów">{items.map(t=><button key={threadKey(t)} className={`sk-thread-item ${threadKey(t)===key?'active':''}`} onClick={()=>choose(t)} disabled={sending}><Avatar name={t.lead_name||t.lead_email||t.subject}/><div className="sk-thread-copy"><div className="sk-thread-name"><strong>{t.lead_name||t.lead_email||t.subject}</strong><small>{dateTime(t.timestamp,{day:undefined,month:undefined})}{t.unread_lead_reply&&<i className="sk-dot"/>}</small></div><div className="sk-thread-subject">{t.subject}</div><div className="sk-thread-snippet">{t.last_message_snippet}</div><div className="sk-thread-tags">{t.needs_reply&&<Badge tone="green">Odpowiedź</Badge>}{t.lead_status==='bounced'&&<Badge tone="red">Odbicie</Badge>}{t.campaign_name&&<Badge tone="blue">Kampania: {t.campaign_name}</Badge>}</div></div></button>)}{!items.length&&<Empty icon="chat">{loading?'Wczytywanie…':'Brak rozmów dla wybranego filtra.'}</Empty>}{total>30&&<div className="sk-pagination sk-pagination-centered"><button aria-label="Poprzednie rozmowy" disabled={page===1} onClick={()=>setPage(p=>p-1)}><Icon name="prev"/></button><span>{page} / {Math.ceil(total/30)}</span><button aria-label="Następne rozmowy" disabled={page>=Math.ceil(total/30)} onClick={()=>setPage(p=>p+1)}><Icon name="next"/></button></div>}</section>
   <section className="sk-conversation" aria-label="Wątek rozmowy">{!selected?<Empty icon="chat">Wybierz rozmowę z listy.</Empty>:<>
    <div className="sk-conversation-head"><button className="sk-icon-button sk-mobile-back" aria-label="Wróć do listy rozmów" onClick={()=>{drafts.current[key]=body;setSelected(null);activeRef.current=null;requestId.current++;}}><Icon name="back"/></button><h2>{thread?.subject||selected.subject}</h2>{selected.campaign_name&&<Badge tone="blue">{selected.campaign_name}</Badge>}</div>
    <div className="sk-messages"><ErrorNotice error={selectionError}/>{!thread&&!selectionError?<Empty>Wczytywanie wątku…</Empty>:[...(thread?.messages||[])].reverse().map(m=><article className="sk-message" key={m.message_id}><div className="sk-message-head"><Avatar name={m.direction==='sent'?box?.display_name||box?.email||m.from:title}/><div><strong>{m.direction==='sent'?box?.display_name||m.from:title}</strong> <span className="sk-muted">{m.direction==='sent'?'':address(m.from)}</span><small>do {m.direction==='received'?'mnie':m.to}</small></div><time>{dateTime(m.timestamp)}</time></div>{m.body_html?<SafeEmail html={m.body_html}/>:<pre>{m.body_plain||m.snippet}</pre>}</article>)}</div>
    <div className="sk-compose"><div className="sk-compose-inner"><div className="sk-compose-heading"><span>Odpowiedz</span><span className="sk-muted sk-small">{recipient}</span></div><textarea aria-label="Treść odpowiedzi" placeholder="Napisz odpowiedź…" value={body} onChange={e=>editBody(e.target.value)} disabled={!thread||sending}/><div className="sk-compose-actions"><span className="sk-compose-status">Czysty tekst · szkic w tej sesji</span><select aria-label="Użyj szablonu" value="" onChange={e=>useTemplate(e.target.value)} disabled={!thread||sending}><option value="">Użyj szablonu</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><Button variant="primary" icon="send" onClick={send} disabled={!body.trim()||!thread||blocked!==false||box?.paused||sending}>{sending?'Wysyłanie…':'Wyślij'}</Button></div></div>{blocked&&<p className="sk-small sk-inline-error">Adres znajduje się na liście wykluczeń.</p>}{blocked===null&&thread&&<p className="sk-small sk-muted sk-inline-status">Oczekiwanie na sprawdzenie blokady adresu.</p>}</div>
   </>}</section>
   <aside className="sk-contact-context" aria-label="Kontekst kontaktu">{selected?<>
    <div className="sk-contact-card"><div className="sk-contact-head"><Avatar name={title} size="large"/><div><h3>{title}</h3><small>{selected.campaign_name||'Korespondencja'}</small>{contact?<ContactStatus lead={contact}/>:<Badge>Kontakt spoza listy</Badge>}</div></div><div className="sk-contact-attribute"><Icon name="mail"/><span>{recipient||'—'}</span></div>{Object.entries(contact?.custom_data||{}).filter(([,v])=>v!==''&&v!=null).slice(0,4).map(([k,v])=><div className="sk-contact-attribute" key={k}><Icon name="tag"/><span>{fields.find(f=>f.key===k)?.label||k}: {typeof v==='object'?JSON.stringify(v):String(v)}</span></div>)}{contact&&<Button to={'/leads/'+contact.id} className="sk-full-width compact">Zobacz pełny profil <Icon name="arrow" size={15}/></Button>}</div>
    <div className="sk-contact-card"><h4><Icon name="chart"/>Aktywność kontaktu</h4>{interactions.length?interactions.slice(-5).reverse().map((x,i)=><div className="sk-timeline-row" key={i}><Icon name={x.type==='reply'?'reply':'check'}/><span>{x.subject||x.event||x.type||'Wiadomość'}</span><time>{dateTime(x.timestamp||x.sent_at||x.created_at)}</time></div>):<p className="sk-small sk-muted">Historia jest dostępna w wątku rozmowy.</p>}</div>
    <div className="sk-contact-card"><h4><Icon name="shield"/>Status korespondencji</h4><div className="sk-contact-status-row"><span>Lista wykluczeń</span><strong>{blocked===null?'Sprawdzanie':blocked?'Tak':'Nie'}</strong></div><div className="sk-contact-status-row"><span>Skrzynka</span><strong>{box?(box.paused?'Wstrzymana':'Aktywna'):'Nieznana'}</strong></div><div className="sk-contact-status-row"><span>Dostarczenie do odbiorcy</span><strong>Niepotwierdzone</strong></div></div>
    <div className="sk-contact-card actions"><h4><Icon name="contacts"/>Zarządzanie kontaktem</h4><Button icon="block" onClick={()=>block('manual')} disabled={!recipient||!!blocked}>Dodaj do wykluczeń</Button><Button icon="unsubscribe" onClick={()=>block('unsubscribe')} disabled={!recipient||!!blocked}>Oznacz jako wypisanego</Button>{contact&&<Button icon="edit" to={'/leads/'+contact.id}>Edytuj dane kontaktu</Button>}</div>
   </>:<div className="sk-contact-card"><Empty icon="contacts">Dane wybranego kontaktu</Empty></div>}</aside>
  </div>
 </div>;
}
