import {useUiLanguage} from '../../context/LanguageContext';
import {useState,useEffect,useRef,useCallback} from 'react';
import {useSearchParams,useNavigate} from 'react-router-dom';
import {api} from '../../api';
import {useNotify} from '../../context/NotificationContext';
import {useConfirm} from '../../context/ConfirmContext';
import {Button,Badge,Avatar,Icon,Empty,ErrorNotice,dateTime,ContactStatus} from '../ui';
import SafeEmail from '../SafeEmail';
const address=text=>{const s=String(text||'');return (s.match(/<([^<>]+@[^<>]+)>/)?.[1]||s.split(',')[0]).trim();};
const plain=html=>new DOMParser().parseFromString(html||'','text/html').body.textContent||'';
const threadKey=t=>t?`${t.inbox_id}:${t.thread_id}`:'';
export default function Inbox(){
 const {t:tr,language}=useUiLanguage();
 const tabs=[['all',tr('outreach.all')],['unread',tr('outreach.unread')],['needs_reply',tr('outreach.needsReply')],['bounced',tr('outreach.bounces')]];
 const [params]=useSearchParams(),notify=useNotify(),confirm=useConfirm(),navigate=useNavigate();
 const [inboxes,setInboxes]=useState([]),[templates,setTemplates]=useState([]),[fields,setFields]=useState([]),[items,setItems]=useState([]),[counts,setCounts]=useState({}),[total,setTotal]=useState(0);
 const [inboxLoading,setInboxLoading]=useState(true),[inboxError,setInboxError]=useState(null);
 const [inboxId,setInboxId]=useState(params.get('inbox')||''),[q,setQ]=useState(params.get('q')||''),[query,setQuery]=useState(params.get('q')||''),[tab,setTab]=useState('all'),[page,setPage]=useState(1);
 const [selected,setSelected]=useState(null),[thread,setThread]=useState(null),[contact,setContact]=useState(null),[blocked,setBlocked]=useState(null),[selectionError,setSelectionError]=useState('');
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[sending,setSending]=useState(false),[body,setBody]=useState('');
 const drafts=useRef({}),activeRef=useRef(null),requestId=useRef(0),listRequest=useRef(0),deepOpened=useRef(false),bodyRef=useRef('');
 const sendLock=useRef(false),syncLock=useRef(false),blockLock=useRef(false),leaveLock=useRef(false),templateRequest=useRef(0),draftRevision=useRef(0),alive=useRef(true);
 const [templateBusy,setTemplateBusy]=useState(false),[blocking,setBlocking]=useState(false);
 const key=threadKey(selected);
 const hasDrafts=()=>!!bodyRef.current.trim()||Object.values(drafts.current).some(v=>v.trim());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;++requestId.current;++templateRequest.current;};},[]);
 useEffect(()=>{const leave=async e=>{
  const a=e.target.closest?.('a[href]');if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank')return;
  const url=new URL(a.href,window.location.href);if(url.origin!==window.location.origin||url.pathname===window.location.pathname||(!hasDrafts()&&!sendLock.current))return;
  e.preventDefault();e.stopPropagation();if(sendLock.current||leaveLock.current)return;leaveLock.current=true;
  try{if(await confirm(tr('outreach.leaveDrafts')))navigate(url.pathname+url.search+url.hash);}finally{leaveLock.current=false;}
 };document.addEventListener('click',leave,true);return()=>document.removeEventListener('click',leave,true);},[confirm,navigate,tr]);
 const loadInboxes=useCallback(async()=>{setInboxLoading(true);setInboxError(null);try{setInboxes(await api.get('/inboxes'));}catch(e){setInboxError(e);}finally{setInboxLoading(false);}},[]);
 useEffect(()=>{loadInboxes();api.get('/templates').then(setTemplates).catch(setError);api.get('/contact-fields').then(setFields).catch(setError);},[]);
 const loadList=useCallback(async()=>{const request=++listRequest.current;setLoading(true);try{
  const p=new URLSearchParams({page:String(page),page_size:'30',tab,q:query});if(inboxId)p.set('inbox_id',inboxId);
  const result=await api.get('/ui/unibox?'+p);if(request!==listRequest.current)return;setItems(result.items);setTotal(result.total);setCounts(result.counts||{});setError('');
 }catch(e){if(request===listRequest.current)setError(e);}finally{if(request===listRequest.current)setLoading(false);}},[page,tab,query,inboxId]);
 useEffect(()=>{loadList();return()=>{listRequest.current++;};},[loadList]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(q.trim()),250);return()=>clearTimeout(timer);},[q]);
 useEffect(()=>{setPage(1);},[query,inboxId,tab]);
 const choose=useCallback(async t=>{
  if(sendLock.current)return;
  ++templateRequest.current;setTemplateBusy(false);++draftRevision.current;
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
   if(rid===requestId.current)await loadList();
  }catch(e){if(rid===requestId.current)setSelectionError(e);}
 },[loadList]);
 useEffect(()=>{if(!deepOpened.current&&params.get('thread')&&items.length){const target=items.find(x=>x.thread_id===params.get('thread')&&String(x.inbox_id)===params.get('inbox'));if(target){deepOpened.current=true;choose(target);}}},[items,params,choose]);
 useEffect(()=>{const warn=e=>{if(hasDrafts()||sendLock.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 const editBody=value=>{++draftRevision.current;bodyRef.current=value;drafts.current[key]=value;setBody(value);};
 const box=inboxes.find(i=>i.id===selected?.inbox_id);
 const headerBox=inboxes.find(i=>String(i.id)===String(inboxId));
 const headerHealth=inboxLoading?['neutral',tr('outreach.loading')]:inboxError?['neutral',tr('outreach.noData')]:!inboxes.length?['neutral',tr('outreach.noInboxes')]:headerBox
  ? (headerBox.paused?['amber',tr('outreach.paused')]:['green',tr('outreach.active')])
  : (inboxes.some(i=>i.paused)?['amber',tr('outreach.somePaused')]:['green',tr('outreach.allActive')]);
 const recipient=contact?.email||selected?.lead_email||address([...(thread?.messages||[])].reverse().find(m=>m.direction==='received')?.from)||address([...(thread?.messages||[])].reverse().find(m=>m.direction==='sent')?.to);
 const title=contact?.name||selected?.lead_name||recipient||tr('outreach.conversation');
 const sync=async()=>{if(syncLock.current)return;syncLock.current=true;setSyncing(true);try{await api.post('/unibox/sync',inboxId?{inbox_id:Number(inboxId)}:{});notify({type:'success',message:tr('outreach.syncRequested')});await loadList();}catch(e){setError(e);}finally{syncLock.current=false;if(alive.current)setSyncing(false);}};
 const send=async()=>{
  if(!body.trim()||!thread||sendLock.current||blockLock.current||blocked!==false||box?.paused||templateBusy)return;
  sendLock.current=true;setSending(true);
  const current=activeRef.current,currentKey=threadKey(current),text=body;
  try{
   if(!await confirm(tr('outreach.sendWarning',{recipient,mailbox:box?.email||thread.inbox_account})))return;
   if(!alive.current)return;
   setSelectionError('');
   await api.post('/ui/reply',{inbox_id:current.inbox_id,to_email:recipient,subject:/^re:/i.test(thread.subject)?thread.subject:'Re: '+thread.subject,body:text,is_html:false,thread_id:current.thread_id});
   drafts.current[currentKey]='';
   if(alive.current&&threadKey(activeRef.current)===currentKey){bodyRef.current='';setBody('');sendLock.current=false;await choose(current);}
   if(alive.current){notify({type:'success',message:tr('outreach.replySent')});await loadList();}
  }catch(e){if(alive.current)setSelectionError(e);}finally{sendLock.current=false;if(alive.current)setSending(false);}
 };
 const useTemplate=async id=>{
  const template=templates.find(t=>String(t.id)===id),v=template?.latest_version;if(!v||sendLock.current)return;
  const targetKey=threadKey(activeRef.current),revision=draftRevision.current,request=++templateRequest.current,leadId=contact?.id||null;
  const current=()=>alive.current&&request===templateRequest.current&&targetKey===threadKey(activeRef.current)&&revision===draftRevision.current;
  setTemplateBusy(true);
  try{
   if(bodyRef.current.trim()&&!await confirm(tr('outreach.replaceDraft')))return;
   if(!current())return;
   const r=await api.post('/templates/preview/render',{subject:v.subject,body:v.body,is_html:v.is_html,lead_id:leadId});
   if(!current())return;
   if(r.missing_variables?.length){notify({type:'error',message:tr('outreach.missingFields',{fields:r.missing_variables.join(', ')})});return;}
   editBody(v.is_html?plain(r.body):r.body);notify({type:'success',message:v.is_html?tr('outreach.templatePlain'):tr('outreach.templateInserted')});
  }catch(e){if(current())setSelectionError(e);}finally{if(alive.current&&request===templateRequest.current)setTemplateBusy(false);}
 };
 const block=async reason=>{
  if(!recipient||blocked!==false||blockLock.current||sendLock.current)return;
  blockLock.current=true;setBlocking(true);const email=recipient,targetKey=threadKey(activeRef.current);
  try{
   if(!await confirm(tr('outreach.blockWarning',{email})))return;
   if(!alive.current)return;
   const r=await api.post('/leads/suppression',{email,reason,source:'inbox'});
   if(alive.current){if(targetKey===threadKey(activeRef.current))setBlocked(r);notify({type:'success',message:tr('outreach.blockedResult',{email})});}
  }catch(e){if(alive.current&&targetKey===threadKey(activeRef.current))setSelectionError(e);}finally{blockLock.current=false;if(alive.current)setBlocking(false);}
 };
 const interactions=contact?.interactions||[];
 return <div className="sk-page sk-inbox-page" aria-busy={loading||syncing}>
  <div className="sk-page-heading"><div><h1>{tr('outreach.inboxTitle')}</h1><p>{tr('outreach.inboxDescription')}</p></div><div className="sk-heading-actions"><div className="sk-mailbox-select"><Icon name="mail" size={23}/><div className="sk-mailbox-select-body"><label htmlFor="inbox-picker">{tr('outreach.mailbox')}</label><select id="inbox-picker" value={inboxId} onChange={e=>setInboxId(e.target.value)}><option value="">{tr('outreach.allInboxes')}</option>{inboxes.map(i=><option key={i.id} value={i.id}>{i.email}</option>)}</select></div></div><div className={`sk-inbox-health tone-${headerHealth[0]}`}><i className="sk-dot"/><div><small>{tr('outreach.sendingStatus')}</small><strong>{headerHealth[1]}</strong></div></div></div></div>
  <ErrorNotice error={inboxError} onRetry={loadInboxes}/>
  <ErrorNotice error={error} onRetry={loadList}/>
  <div className="sk-inbox-toolbar"><nav className="sk-tabs" aria-label={tr('outreach.messageFilters')}>{tabs.map(([v,l])=><button className={`sk-tab ${v===tab?'active':''}`} aria-pressed={v===tab} key={v} onClick={()=>setTab(v)}>{l}<small>{counts[v]||0}</small></button>)}</nav><div className="sk-search-input"><Icon name="search" size={17}/><input aria-label={tr('outreach.searchThreads')} placeholder={tr('outreach.searchThreadsPlaceholder')} value={q} onChange={e=>setQ(e.target.value)}/></div><Button className="compact" icon="refresh" onClick={sync} disabled={syncing}>{syncing?tr('outreach.syncing'):tr('outreach.sync')}</Button></div>
  <div className={`sk-inbox-columns ${selected?'has-thread':''}`}>
   <section className="sk-thread-list" aria-label={tr('outreach.threadList')}>{items.map(t=><button key={threadKey(t)} className={`sk-thread-item ${threadKey(t)===key?'active':''}`} onClick={()=>choose(t)} disabled={sending}><Avatar name={t.lead_name||t.lead_email||t.subject}/><div className="sk-thread-copy"><div className="sk-thread-name"><strong>{t.lead_name||t.lead_email||t.subject}</strong><small>{dateTime(t.timestamp,{day:undefined,month:undefined},language)}{t.unread_lead_reply&&<i className="sk-dot"/>}</small></div><div className="sk-thread-subject">{t.subject}</div><div className="sk-thread-snippet">{t.last_message_snippet}</div><div className="sk-thread-tags">{t.needs_reply&&<Badge tone="green">{tr('outreach.reply')}</Badge>}{t.lead_status==='bounced'&&<Badge tone="red">{tr('outreach.bounce')}</Badge>}{t.campaign_name&&<Badge tone="blue">{tr('outreach.campaignPrefix')} {t.campaign_name}</Badge>}</div></div></button>)}{!items.length&&!error&&<Empty icon="chat">{loading?tr('outreach.loading'):tr('outreach.noThreads')}</Empty>}{total>30&&<div className="sk-pagination sk-pagination-centered"><button aria-label={tr('outreach.previousThreads')} disabled={page===1} onClick={()=>setPage(p=>p-1)}><Icon name="prev"/></button><span>{page} / {Math.ceil(total/30)}</span><button aria-label={tr('outreach.nextThreads')} disabled={page>=Math.ceil(total/30)} onClick={()=>setPage(p=>p+1)}><Icon name="next"/></button></div>}</section>
   <section className="sk-conversation" aria-label={tr('outreach.thread')}>{!selected?<Empty icon="chat">{tr('outreach.chooseThread')}</Empty>:<>
    <div className="sk-conversation-head"><button className="sk-icon-button sk-mobile-back" aria-label={tr('outreach.backThreads')} disabled={sending} onClick={()=>{++templateRequest.current;setTemplateBusy(false);drafts.current[key]=body;setSelected(null);activeRef.current=null;requestId.current++;}}><Icon name="back"/></button><h2>{thread?.subject||selected.subject}</h2>{selected.campaign_name&&<Badge tone="blue">{selected.campaign_name}</Badge>}</div>
    <div className="sk-messages"><ErrorNotice error={selectionError}/>{!thread&&!selectionError?<Empty>{tr('outreach.loadingThread')}</Empty>:[...(thread?.messages||[])].reverse().map(m=><article className="sk-message" key={m.message_id}><div className="sk-message-head"><Avatar name={m.direction==='sent'?box?.display_name||box?.email||m.from:title}/><div><strong>{m.direction==='sent'?box?.display_name||m.from:title}</strong> <span className="sk-muted">{m.direction==='sent'?'':address(m.from)}</span><small>{tr('outreach.to')} {m.direction==='received'?tr('outreach.me'):m.to}</small></div><time>{dateTime(m.timestamp,{},language)}</time></div>{m.body_html?<SafeEmail html={m.body_html}/>:<pre>{m.body_plain||m.snippet}</pre>}</article>)}</div>
    <div className="sk-compose"><div className="sk-compose-inner"><div className="sk-compose-heading"><span>{tr('outreach.replyAction')}</span><span className="sk-muted sk-small">{recipient}</span></div><textarea aria-label={tr('outreach.replyBody')} placeholder={tr('outreach.replyPlaceholder')} value={body} onChange={e=>editBody(e.target.value)} disabled={!thread||sending}/><div className="sk-compose-actions"><span className="sk-compose-status" role="status">{templateBusy?tr('outreach.loadingTemplate'):tr('outreach.draftStatus')}</span><select aria-label={tr('outreach.useTemplate')} value="" onChange={e=>useTemplate(e.target.value)} disabled={!thread||sending||templateBusy}><option value="">{tr('outreach.useTemplate')}</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><Button variant="primary" icon="send" onClick={send} disabled={!body.trim()||!thread||blocked!==false||box?.paused||sending||templateBusy||blocking}>{sending?tr('outreach.sending'):tr('outreach.send')}</Button></div></div>{blocked&&<p className="sk-small sk-inline-error">{tr('outreach.suppressedHint')}</p>}{box?.paused&&thread&&<p className="sk-small sk-inline-error">{tr('outreach.pausedHint')}</p>}{blocked===null&&thread&&<p className="sk-small sk-muted sk-inline-status">{tr('outreach.checkingBlock')}</p>}</div>
   </>}</section>
   <aside className="sk-contact-context" aria-label={tr('outreach.contactContext')}>{selected?<>
    <div className="sk-contact-card"><div className="sk-contact-head"><Avatar name={title} size="large"/><div><h3>{title}</h3><small>{selected.campaign_name||tr('outreach.correspondence')}</small>{contact?<ContactStatus lead={contact}/>:<Badge>{tr('outreach.externalContact')}</Badge>}</div></div><div className="sk-contact-attribute"><Icon name="mail"/><span>{recipient||'—'}</span></div>{Object.entries(contact?.custom_data||{}).filter(([,v])=>v!==''&&v!=null).slice(0,4).map(([k,v])=><div className="sk-contact-attribute" key={k}><Icon name="tag"/><span>{fields.find(f=>f.key===k)?.label||k}: {typeof v==='object'?JSON.stringify(v):String(v)}</span></div>)}{contact&&<Button to={'/leads/'+contact.id} className="sk-full-width compact">{tr('outreach.fullProfile')}<Icon name="arrow" size={15}/></Button>}</div>
    <div className="sk-contact-card"><h4><Icon name="chart"/>{tr('outreach.contactActivity')}</h4>{interactions.length?interactions.slice(-5).reverse().map((x,i)=><div className="sk-timeline-row" key={i}><Icon name={x.direction==='inbound'?'reply':'check'}/><span>{x.subject||x.event||(x.kind==='reply_marker'?tr('outreach.contactReply'):x.direction==='outbound'?tr('outreach.messageSent'):tr('outreach.messageReceived'))}</span><time>{dateTime(x.at||x.timestamp||x.sent_at||x.created_at,{},language)}</time></div>):<p className="sk-small sk-muted">{tr('outreach.historyHint')}</p>}</div>
    <div className="sk-contact-card"><h4><Icon name="shield"/>{tr('outreach.correspondenceStatus')}</h4><div className="sk-contact-status-row"><span>{tr('outreach.suppression')}</span><strong>{blocked===null?tr('outreach.checking'):blocked?tr('outreach.yes'):tr('outreach.no')}</strong></div><div className="sk-contact-status-row"><span>{tr('outreach.mailbox')}</span><strong>{box?(box.paused?tr('outreach.paused'):tr('outreach.active')):tr('outreach.unknown')}</strong></div><div className="sk-contact-status-row"><span>{tr('outreach.delivery')}</span><strong>{tr('outreach.unconfirmed')}</strong></div></div>
    <div className="sk-contact-card actions"><h4><Icon name="contacts"/>{tr('outreach.manageContact')}</h4><Button icon="block" onClick={()=>block('manual')} disabled={!recipient||blocked!==false||blocking||sending}>{tr('outreach.addSuppression')}</Button><Button icon="unsubscribe" onClick={()=>block('unsubscribe')} disabled={!recipient||blocked!==false||blocking||sending}>{tr('outreach.markUnsubscribed')}</Button>{contact&&<Button icon="edit" to={'/leads/'+contact.id}>{tr('outreach.editContact')}</Button>}</div>
   </>:<div className="sk-contact-card"><Empty icon="contacts">{tr('outreach.selectedContact')}</Empty></div>}</aside>
  </div>
 </div>;
}
