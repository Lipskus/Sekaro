import {useUiLanguage} from '../context/LanguageContext';
import {useEffect, useState, useCallback, useRef, useMemo} from 'react';
import {Link, useParams, useNavigate} from 'react-router-dom';
import {api} from '../api';
import {Button, Panel, Avatar, ContactStatus, PageFrame, Badge, ErrorNotice, StatePanel, SectionTabs, contactStatusLabel, dateTime} from '../redesign/ui';
import {FieldInput} from '../redesign/FieldManager';
import {useNotify} from '../context/NotificationContext';
import {useConfirm} from '../context/ConfirmContext';
import {parseApiDate} from '../utils/datetime';

const displayValue = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const eventTitle = (row,t) => row.kind === 'operation' ? t('contacts.operation.'+row.action) : row.kind === 'enrolled' ? t('contacts.eventEnrolled') : row.kind === 'reply_marker' ? t('contacts.eventReply') : row.direction === 'outbound' ? t('contacts.eventSent') : t('contacts.eventReceived');
const timestamp = value => value ? +parseApiDate(value) || 0 : 0;
export function contactEvents(lead) {
  return [...(lead.operations || []), ...(lead.interactions || []), ...(lead.campaigns || []).map(c => ({kind:'enrolled', at:c.enrolled_at, campaign_id:c.campaign_id, campaign_name:c.campaign_name}))]
    .sort((a,b) => timestamp(b.at) - timestamp(a.at));
}
function Timeline({events, compact=false}) {
  const {t,language}=useUiLanguage();
  return events.length ? <ol className={`sk-contact-timeline ${compact?'is-compact':''}`}>{events.map((row,i) => <li key={`${row.at}-${row.kind}-${row.campaign_id}-${i}`}>
    <div className="sk-contact-event-heading"><strong>{eventTitle(row,t)}</strong><time>{dateTime(row.at,{year:'numeric'},language)}</time></div>{row.actor_name&&<small>{t('contacts.operationActor',{actor:row.actor_name})}</small>}
    {!compact && <>{row.campaign_name && <Link to={`/campaigns/${row.campaign_id}`}>{row.campaign_name}</Link>}{row.subject && <p>{row.subject}</p>}{row.snippet && <p className="sk-contact-event-snippet">{row.snippet}</p>}</>}
  </li>)}</ol> : <StatePanel title={t('contacts.noActivity')} description={t('contacts.noActivityHelp')} icon="history"/>;
}
function Campaigns({items}) {
  const {t,language}=useUiLanguage();
  return items.length ? <ul className="sk-contact-campaign-list">{items.map(c => <li key={c.campaign_id}>
    <Link to={`/campaigns/${c.campaign_id}#leads`}>{c.campaign_name}</Link>
    <div className="sk-contact-badges"><Badge tone={c.status==='unsubscribed'||c.status==='bounced'?'red':c.replied?'blue':'neutral'}>{contactStatusLabel(c.status||'active',t)}</Badge>{c.sending_paused&&<Badge tone="amber">{t('contacts.sendingPaused')}</Badge>}{c.interest&&<Badge tone="blue">{contactStatusLabel(c.interest,t)}</Badge>}</div>
    <p>{t('contacts.opened')} {c.opened?t('contacts.yesLower'):t('contacts.noLower')} · {t('contacts.clicked')} {c.clicked?t('contacts.yesLower'):t('contacts.noLower')} · {t('contacts.replied')} {c.replied?t('contacts.yesLower'):t('contacts.noLower')}</p>
    <small>{t('contacts.added')} {dateTime(c.enrolled_at,{year:'numeric'},language)}</small>
  </li>)}</ul> : <StatePanel title={t('contacts.noCampaigns')} description={t('contacts.noCampaignsHelp')} icon="campaign"/>;
}
export default function LeadDetail() {
  const {t,language}=useUiLanguage();
  const {id}=useParams(), notify=useNotify(), confirm=useConfirm(), navigate=useNavigate();
  const [tab,setTab]=useState('summary'),[lead,setLead]=useState(null),[fields,setFields]=useState([]);
  const [editName,setEditName]=useState(''),[editCustom,setEditCustom]=useState({});
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(null),[saveError,setSaveError]=useState(null);
  const [kind,setKind]=useState(''),[campaign,setCampaign]=useState('');
  const seq=useRef(0),saveLock=useRef(false),leaveLock=useRef(false);
  const dirty=!!lead&&(editName!==(lead.name||'')||JSON.stringify(editCustom)!==JSON.stringify(lead.custom_data||{}));
  const load=useCallback(async()=>{
    const request=++seq.current;setLoading(true);setError(null);setLead(null);setSaveError(null);setTab('summary');setKind('');setCampaign('');
    try{const [l,f]=await Promise.all([api.get(`/leads/${id}`),api.get('/contact-fields')]);if(request!==seq.current)return;setLead(l);setFields(Array.isArray(f)?f:[]);setEditName(l.name||'');setEditCustom({...l.custom_data});}
    catch(e){if(request===seq.current)setError(e);}
    finally{if(request===seq.current)setLoading(false);}
  },[id]);
  useEffect(()=>{load();return()=>{++seq.current;};},[load]);
  useEffect(()=>{const unload=e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[dirty,saving]);
  useEffect(()=>{const leave=async e=>{
    const a=e.target.closest?.('a[href]');if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank')return;
    const url=new URL(a.href,window.location.href);if(url.origin!==window.location.origin||url.pathname===window.location.pathname||(!dirty&&!saving))return;
    e.preventDefault();e.stopPropagation();if(saveLock.current||leaveLock.current)return;leaveLock.current=true;
    try{if(await confirm(t('contacts.leaveWarning')))navigate(url.pathname+url.search+url.hash);}finally{leaveLock.current=false;}
  };document.addEventListener('click',leave,true);return()=>document.removeEventListener('click',leave,true);},[dirty,saving,confirm,navigate,t]);
  const save=async e=>{
    e.preventDefault();if(!lead||!dirty||saveLock.current)return;saveLock.current=true;setSaving(true);setSaveError(null);const request=seq.current;
    try{const updated=await api.patch(`/leads/${lead.id}`,{name:editName,custom_data:editCustom});if(request!==seq.current)return;setLead(updated);setEditName(updated.name||'');setEditCustom({...updated.custom_data});notify({type:'success',message:t('contacts.saved')});}
    catch(e){if(request===seq.current)setSaveError(e);}
    finally{saveLock.current=false;setSaving(false);}
  };
  const archive=async()=>{
    if(!lead||saving||dirty||saveLock.current)return;
    if(!await confirm(t(lead.archived_at?'contacts.restoreWarning':'contacts.archiveWarning',{count:1})))return;
    saveLock.current=true;setSaving(true);setSaveError(null);
    try{await api.post('/leads/archive',{lead_ids:[lead.id],archived:!lead.archived_at});await load();}
    catch(e){setSaveError(e);}finally{saveLock.current=false;setSaving(false);}
  };
  const events=useMemo(()=>lead?contactEvents(lead):[],[lead]);
  const filtered=events.filter(e=>(!kind||(kind==='messages'?!!e.direction||e.kind==='reply_marker':e.kind===kind))&&(!campaign||String(e.campaign_id)===campaign));
  if(error)return <PageFrame title={t('contacts.contact')}><ErrorNotice error={error} onRetry={load}/><Button to="/leads">{t('contacts.back')}</Button></PageFrame>;
  if(loading||!lead)return <PageFrame title={t('contacts.contact')}><StatePanel title={t('contacts.loading')} description={t('contacts.loadingProfile')} icon="refresh"/></PageFrame>;
  const campaigns=lead.campaigns||[],interactions=lead.interactions||[];
  const outbound=interactions.filter(e=>e.direction==='outbound').length;
  const received=interactions.filter(e=>e.direction==='inbound'&&e.kind!=='reply_marker').length;
  const replies=interactions.filter(e=>e.kind==='reply_marker').length;
  const customFields=fields.filter(f=>!f.system);
  return <PageFrame className="sk-contact-workspace" title={lead.name||lead.email} description={lead.email} actions={<><Button disabled={saving||dirty} onClick={archive}>{t(lead.archived_at?'contacts.restore':'contacts.archive')}</Button><Button to="/leads" icon="back">{t('contacts.back')}</Button></>}>
    {tab!=='summary'&&<ErrorNotice error={saveError}/>}<SectionTabs ariaLabel={t('contacts.contactView')} items={[{id:'summary',label:t('contacts.summary')},{id:'activity',label:t('contacts.activity')},{id:'campaigns',label:t('contacts.campaigns')},{id:'messages',label:t('contacts.messages')}]} value={tab} onChange={setTab}/>
    <div className="sk-contact-workspace-grid"><div className="sk-contact-workspace-main">
      {tab==='summary'&&<form onSubmit={save}>
        <Panel className="sk-contact-profile"><div className="sk-contact-identity"><Avatar name={lead.name||lead.email}/><div><h2>{lead.name||lead.email}</h2><p>{lead.email}</p><small>{t('contacts.profileMeta',{id:lead.id,date:dateTime(lead.created_at,{year:'numeric'},language)})}</small></div><ContactStatus lead={lead}/></div>
          <fieldset disabled={saving} className="sk-contact-field-grid"><label>{t('contacts.email')}<input aria-label={t('contacts.email')} value={lead.email} readOnly/><code>{'{{email}}'}</code></label><label>{t('contacts.name')}<input aria-label={t('contacts.name')} maxLength={255} value={editName} onChange={e=>setEditName(e.target.value)}/><code>{'{{name}}'}</code></label></fieldset>
        </Panel>
        <Panel title={t('contacts.customFields')} action={<Button to="/leads?fields=1" icon="settings">{t('contacts.manageFields')}</Button>}>
          <p className="sk-muted sk-small">{t('contacts.customHelp')}</p>
          <fieldset disabled={saving} className="sk-contact-field-grid">{customFields.map(f=><label key={f.key}>{f.label||f.key}<FieldInput field={f} aria-label={f.label||f.key} value={editCustom[f.key]} onChange={v=>setEditCustom(p=>({...p,[f.key]:f.field_type==='number'&&v!==''?Number(v):v}))}/><code>{`{{${f.key}}}`}</code>{!f.defined&&<small className="sk-muted">{t('contacts.detected')}</small>}</label>)}</fieldset>
          {!customFields.length&&<p className="sk-muted">{t('contacts.noFields')}</p>}
          <ErrorNotice error={saveError}/><div className="sk-contact-savebar"><span role="status">{saving?t('contacts.saving'):dirty?t('contacts.unsaved'):t('contacts.clean')}</span><Button disabled={saving||!dirty} onClick={async()=>{if(await confirm(t('contacts.discardWarning'))){setEditName(lead.name||'');setEditCustom({...lead.custom_data});setSaveError(null);}}}>{t('contacts.discard')}</Button><Button type="submit" variant="primary" disabled={saving||!dirty}>{t('contacts.save')}</Button></div>
        </Panel>
        <Panel title={t('contacts.profileStatus')}><dl className="sk-contact-status-grid"><div><dt>{t('contacts.archived')}</dt><dd>{lead.archived_at?dateTime(lead.archived_at,{},language):t('contacts.no')}</dd></div><div><dt>{t('contacts.suppressed')}</dt><dd>{lead.suppressed?t('contacts.yes'):t('contacts.no')}</dd></div><div><dt>{t('contacts.sendingPaused')}</dt><dd>{campaigns.some(c=>c.sending_paused)?t('contacts.yes'):t('contacts.no')}</dd></div><div><dt>{t('contacts.verification')}</dt><dd>{lead.email_verification_status?contactStatusLabel(lead.email_verification_status,t):t('contacts.noResult')}</dd></div><div><dt>{t('contacts.campaignUnsubscribe')}</dt><dd>{campaigns.some(c=>c.status==='unsubscribed')?t('contacts.yes'):t('contacts.no')}</dd></div><div><dt>{t('contacts.campaignBounce')}</dt><dd>{campaigns.some(c=>c.status==='bounced')?t('contacts.yes'):t('contacts.no')}</dd></div></dl></Panel>
      </form>}
      {tab==='activity'&&<Panel title={t('contacts.timeline')}><p className="sk-muted sk-small">{t('contacts.timelineHelp')}</p><div className="sk-contact-activity-filters"><label>{t('contacts.activityType')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">{t('contacts.allEvents')}</option><option value="messages">{t('contacts.messagesReplies')}</option><option value="operation">{t('contacts.operations')}</option><option value="enrolled">{t('contacts.assignments')}</option><option value="reply_marker">{t('contacts.confirmedReplies')}</option></select></label><label>{t('contacts.campaign')}<select value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">{t('contacts.allCampaigns')}</option>{campaigns.map(c=><option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}</select></label></div><Timeline events={filtered}/></Panel>}
      {tab==='campaigns'&&<Panel title={t('contacts.contactCampaigns')}><Campaigns items={campaigns}/></Panel>}
      {tab==='messages'&&<Panel title={t('contacts.messages')}><p className="sk-muted sk-small">{t('contacts.messagesHelp')}</p><Timeline events={events.filter(e=>!!e.direction&&e.kind!=='reply_marker')}/><Button to="/unibox" icon="mail">{t('contacts.openInbox')}</Button></Panel>}
    </div><aside className="sk-contact-workspace-aside">
      <Panel title={t('contacts.summary')}><dl className="sk-contact-summary">{[[t('contacts.campaigns'),campaigns.length],[t('contacts.sent'),outbound],[t('contacts.received'),received],[t('contacts.replyMarkers'),replies]].map(([label,value])=><div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl></Panel>
      {tab==='summary'?<Panel title={t('contacts.recentActivity')}><Timeline events={events.slice(0,4)} compact/><Button className="sk-full-width" onClick={()=>setTab('activity')}>{t('contacts.fullHistory')}</Button></Panel>:<Panel title={t('contacts.relatedCampaigns')}><Campaigns items={campaigns}/></Panel>}
      <Panel title={t('contacts.variables')}><dl className="sk-contact-values">{[{key:'email',label:t('contacts.email')},{key:'name',label:t('contacts.name')},...customFields].map(f=><div key={f.key}><dt>{f.label||f.key}</dt><dd>{displayValue(f.key==='email'?lead.email:f.key==='name'?lead.name:lead.custom_data?.[f.key])}</dd></div>)}</dl><p className="sk-muted sk-small">{t('contacts.variablesHelp')}</p></Panel>
    </aside></div>
  </PageFrame>;
}
