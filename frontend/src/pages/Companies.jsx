import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {api} from '../api';
import {Button,Panel,PageFrame,ErrorNotice,dateTime,Avatar,Badge,Icon,Empty} from '../redesign/ui';
import Modal from '../redesign/Modal';
import {useConfirm} from '../context/ConfirmContext';
import {useUiLanguage} from '../context/LanguageContext';
import {useCrmText} from './crm-text';
import './crm.css';
export default function Companies(){
 const {t:ui,language}=useUiLanguage();
 const t=useCrmText(),{id}=useParams(),navigate=useNavigate(),confirm=useConfirm(),lock=useRef(false),generation=useRef(0);
 const [items,setItems]=useState([]),[data,setData]=useState(null),[query,setQuery]=useState(''),[archived,setArchived]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(null),[busy,setBusy]=useState(false),[create,setCreate]=useState(false),[form,setForm]=useState({name:'',domain:'',description:''}),[reload,setReload]=useState(0);
 useEffect(()=>{const seq=++generation.current;setLoading(true);setError(null);setData(null);const timer=setTimeout(()=>api.get(id?`/crm/companies/${id}`:`/crm/companies?q=${encodeURIComponent(query)}&archived=${archived}`).then(result=>{if(seq!==generation.current)return;if(id){setData(result);setForm({name:result.name,domain:result.domain,description:result.description});}else setItems(result);}).catch(e=>{if(seq===generation.current)setError(e);}).finally(()=>{if(seq===generation.current)setLoading(false);}),id?0:200);return()=>{clearTimeout(timer);++generation.current;};},[id,query,archived,reload]);
 const dirty=data?form.name!==data.name||form.domain!==data.domain||form.description!==data.description:create&&Object.values(form).some(Boolean);
 useEffect(()=>{const unload=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};const leave=async e=>{const a=e.target.closest?.('a[href]');if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||(!dirty&&!busy))return;const url=new URL(a.href,window.location.href);if(url.origin!==window.location.origin||url.pathname===window.location.pathname)return;e.preventDefault();e.stopPropagation();if(busy)return;if(await confirm(ui('contacts.leaveWarning')))navigate(url.pathname+url.search+url.hash);};window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};},[dirty,busy,confirm,navigate,ui]);
 const mutate=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{const result=await fn();setCreate(false);if(!id&&result?.id)navigate('/companies/'+result.id);else setReload(x=>x+1);}catch(e){setError(e);}finally{lock.current=false;setBusy(false);}};
 const historyText=h=>{try{const parsed=JSON.parse(h.summary);return ['name','domain','description'].filter(k=>parsed.before[k]!==parsed.after[k]).map(k=>t(k)+': '+(parsed.before[k]||'—')+' → '+(parsed.after[k]||'—')).join(' · ');}catch{return h.summary;}};
 const fields=<fieldset disabled={busy} className="sk-crm-fields"><label>{t('name')}<input required maxLength={255} value={form.name} onChange={e=>setForm(x=>({...x,name:e.target.value}))}/></label><label>{t('domain')}<input maxLength={255} value={form.domain} onChange={e=>setForm(x=>({...x,domain:e.target.value}))}/></label><label>{t('description')}<textarea maxLength={10000} rows={4} value={form.description} onChange={e=>setForm(x=>({...x,description:e.target.value}))}/></label><Button type="submit" variant="primary" disabled={busy||!form.name.trim()}>{t('save')}</Button></fieldset>;
 const status=c=><Badge dot tone={c.archived_at?'neutral':'green'}>{t(c.archived_at?'archived':'active')}</Badge>;
 const identity=c=><div className="sk-company-identity"><Avatar name={c.name||c.email}/><div><Link to={'/companies/'+c.id}>{c.name}</Link><small>#{c.id}</small></div></div>;
 return <PageFrame className="sk-companies" title={id?data?.name||t('companies'):t('companies')} description={t('companyHelp')} actions={id?<Button icon="back" to="/companies">{t('back')}</Button>:<Button icon="plus" variant="primary" onClick={()=>{setForm({name:'',domain:'',description:''});setCreate(true);}}>{t('newCompany')}</Button>}>
 <div className="sk-crm-stack"><ErrorNotice error={error}/>{loading&&id?<p role="status">{t('loading')}</p>:id?data&&<>
  <section className="sk-panel sk-company-overview" aria-label={t('companyProfile')}>
   <div className="sk-company-identity"><Avatar name={data.name} size="large"/><div><span className="sk-company-eyebrow">{t('companyProfile')} · #{data.id}</span><h2>{data.name}</h2><span className="sk-muted">{data.domain||t('noDomain')}</span></div></div>
   <dl className="sk-company-facts"><div><dt>{t('status')}</dt><dd>{status(data)}</dd></div><div><dt>{t('contacts')}</dt><dd>{data.contacts.length}</dd></div><div><dt>{t('created')}</dt><dd>{dateTime(data.created_at,{year:'numeric'},language)}</dd></div></dl>
  </section>
  <div className="sk-company-columns">
   <div className="sk-crm-stack">
    <Panel title={t('companyDetails')} icon="text" className="sk-company-editor"><form onSubmit={e=>{e.preventDefault();mutate(()=>api.patch(`/crm/companies/${id}`,form));}}>{fields}</form></Panel>
    <Panel title={t('contacts')} icon="contacts" action={<Badge>{data.contacts.length}</Badge>}>
     {data.contacts.length?<ul className="sk-company-contacts">{data.contacts.map(c=><li key={c.id}><Avatar name={c.name||c.email}/><div><Link to={'/leads/'+c.id}>{c.name||c.email}</Link><small>{c.email}</small>{c.role&&<span className="sk-company-role">{c.role}</span>}</div>{c.archived_at&&<Badge>{t('archived')}</Badge>}<Link className="sk-company-open" to={'/leads/'+c.id} aria-label={t('openContact')+': '+(c.name||c.email)}><Icon name="external" size={18}/></Link></li>)}</ul>:<Empty icon="contacts">{t('noContacts')}</Empty>}
     <div className="sk-company-card-footer"><Button to="/leads" icon="contacts">{t('browseContacts')}</Button></div>
    </Panel>
   </div>
   <aside className="sk-crm-stack sk-company-sidebar">
    <Panel title={t('history')} icon="history" action={<Badge>{data.history.length}</Badge>}>
     {!data.history.length?<Empty icon="history">{t('noHistory')}</Empty>:<ol className="sk-company-timeline">{data.history.map((h,i)=><li key={i}><span className="sk-company-event-dot"/><div><strong>{t(({create:'add',update:'save',archive:'archive',restore:'restore',contact_link:'link',contact_unlink:'remove'})[h.action]||'operation')}</strong><small>{dateTime(h.at,{year:'numeric'},language)}{h.actor_name&&' · '+h.actor_name}</small>{h.summary&&<p>{historyText(h)}</p>}</div></li>)}</ol>}
    </Panel>
    <Panel title={t('recordStatus')} icon="archive"><p className="sk-crm-empty">{t('archiveHelp')}</p><Button disabled={busy||dirty} onClick={async()=>{if(await confirm(t('archiveWarning')))mutate(()=>api.post(`/crm/companies/${id}/archive`,{archived:!data.archived_at}));}}>{t(data.archived_at?'restore':'archive')}</Button></Panel>
   </aside>
  </div>
 </>:<Panel className="sk-company-directory">
  <div className="sk-company-filters"><label className="sk-company-search">{t('search')}<span><Icon name="search" size={18}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></span></label><label>{t('status')}<select value={String(archived)} onChange={e=>setArchived(e.target.value==='true')}><option value="false">{t('active')}</option><option value="true">{t('archived')}</option></select></label><span className="sk-company-result-count" aria-live="polite">{loading?t('loading'):t('results')+': '+items.length}</span></div>
  <div className="sk-table-wrap" aria-busy={loading}><table className="sk-table"><thead><tr><th scope="col">{t('name')}</th><th scope="col">{t('domain')}</th><th scope="col">{t('status')}</th><th scope="col">{t('created')}</th><th scope="col"><span className="sk-company-sr-only">{t('openCompany')}</span></th></tr></thead><tbody>{items.map(c=><tr key={c.id}><td>{identity(c)}</td><td className="sk-muted">{c.domain||t('noDomain')}</td><td>{status(c)}</td><td className="sk-muted">{dateTime(c.created_at,{year:'numeric'},language)}</td><td><Link className="sk-company-open" to={'/companies/'+c.id} aria-label={t('openCompany')+': '+c.name}><Icon name="external" size={18}/></Link></td></tr>)}</tbody></table></div>
  {!loading&&!items.length&&<Empty icon="contacts">{t('empty')}</Empty>}<footer className="sk-company-directory-footer"><Icon name="info" size={16}/><span>{t('limited')}</span></footer>
 </Panel>}</div>
 {create&&<Modal busy={busy} title={t('newCompany')} onClose={async()=>{if(!busy&&(!dirty||await confirm(ui('contacts.discardWarning'))))setCreate(false);}}><ErrorNotice error={error}/><form onSubmit={e=>{e.preventDefault();mutate(()=>api.post('/crm/companies',form));}}>{fields}</form></Modal>}
 </PageFrame>;
}
