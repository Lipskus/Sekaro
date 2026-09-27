import {useEffect, useState, useCallback, useRef, useMemo} from 'react';
import {Link, useParams, useNavigate} from 'react-router-dom';
import {api} from '../api';
import {Button, Panel, Avatar, ContactStatus, PageFrame, Badge, ErrorNotice, StatePanel, SectionTabs, statusLabels, dateTime} from '../redesign/ui';
import {FieldInput} from '../redesign/FieldManager';
import {useNotify} from '../context/NotificationContext';
import {useConfirm} from '../context/ConfirmContext';
import {parseApiDate} from '../utils/datetime';

const displayValue = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const eventTitle = row => row.kind === 'enrolled' ? 'Dodano do kampanii' : row.kind === 'reply_marker' ? 'Potwierdzona odpowiedź' : row.direction === 'outbound' ? 'Wysłano wiadomość' : 'Odebrano wiadomość';
const timestamp = value => value ? +parseApiDate(value) || 0 : 0;
export function contactEvents(lead) {
  return [...(lead.interactions || []), ...(lead.campaigns || []).map(c => ({kind:'enrolled', at:c.enrolled_at, campaign_id:c.campaign_id, campaign_name:c.campaign_name}))]
    .sort((a,b) => timestamp(b.at) - timestamp(a.at));
}
function Timeline({events, compact=false}) {
  return events.length ? <ol className={`sk-contact-timeline ${compact?'is-compact':''}`}>{events.map((row,i) => <li key={`${row.at}-${row.kind}-${row.campaign_id}-${i}`}>
    <div className="sk-contact-event-heading"><strong>{eventTitle(row)}</strong><time>{dateTime(row.at,{year:'numeric'})}</time></div>
    {!compact && <>{row.campaign_name && <Link to={`/campaigns/${row.campaign_id}`}>{row.campaign_name}</Link>}{row.subject && <p>{row.subject}</p>}{row.snippet && <p className="sk-contact-event-snippet">{row.snippet}</p>}</>}
  </li>)}</ol> : <StatePanel title="Brak aktywności" description="Powiązane wiadomości i przypisania do kampanii pojawią się tutaj." icon="history"/>;
}
function Campaigns({items}) {
  return items.length ? <ul className="sk-contact-campaign-list">{items.map(c => <li key={c.campaign_id}>
    <Link to={`/campaigns/${c.campaign_id}#leads`}>{c.campaign_name}</Link>
    <div className="sk-contact-badges"><Badge tone={c.status==='unsubscribed'||c.status==='bounced'?'red':c.replied?'blue':'neutral'}>{statusLabels[c.status||'active']||c.status}</Badge>{c.sending_paused&&<Badge tone="amber">Wysyłka wstrzymana</Badge>}{c.interest&&<Badge tone="blue">{statusLabels[c.interest]||c.interest}</Badge>}</div>
    <p>Otwarcie: {c.opened?'tak':'nie'} · Kliknięcie: {c.clicked?'tak':'nie'} · Odpowiedź: {c.replied?'tak':'nie'}</p>
    <small>Dodano {dateTime(c.enrolled_at,{year:'numeric'})}</small>
  </li>)}</ul> : <StatePanel title="Brak kampanii" description="Kontakt nie jest przypisany do żadnej kampanii." icon="campaign"/>;
}
export default function LeadDetail() {
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
    try{if(await confirm('Masz niezapisane zmiany kontaktu. Odrzucić je i kontynuować?'))navigate(url.pathname+url.search+url.hash);}finally{leaveLock.current=false;}
  };document.addEventListener('click',leave,true);return()=>document.removeEventListener('click',leave,true);},[dirty,saving,confirm,navigate]);
  const save=async e=>{
    e.preventDefault();if(!lead||!dirty||saveLock.current)return;saveLock.current=true;setSaving(true);setSaveError(null);const request=seq.current;
    try{const updated=await api.patch(`/leads/${lead.id}`,{name:editName,custom_data:editCustom});if(request!==seq.current)return;setLead(updated);setEditName(updated.name||'');setEditCustom({...updated.custom_data});notify({type:'success',message:'Dane kontaktu zapisane.'});}
    catch(e){if(request===seq.current)setSaveError(e);}
    finally{saveLock.current=false;setSaving(false);}
  };
  const events=useMemo(()=>lead?contactEvents(lead):[],[lead]);
  const filtered=events.filter(e=>(!kind||(kind==='messages'?e.kind!=='enrolled':e.kind===kind))&&(!campaign||String(e.campaign_id)===campaign));
  if(error)return <PageFrame title="Kontakt"><ErrorNotice error={error} onRetry={load}/><Button to="/leads">Wróć do kontaktów</Button></PageFrame>;
  if(loading||!lead)return <PageFrame title="Kontakt"><StatePanel title="Wczytywanie" description="Pobieramy profil, kampanie i historię kontaktu." icon="refresh"/></PageFrame>;
  const campaigns=lead.campaigns||[],interactions=lead.interactions||[];
  const outbound=interactions.filter(e=>e.direction==='outbound').length;
  const received=interactions.filter(e=>e.direction==='inbound'&&e.kind!=='reply_marker').length;
  const replies=interactions.filter(e=>e.kind==='reply_marker').length;
  const customFields=fields.filter(f=>!f.system);
  return <PageFrame className="sk-contact-workspace" title={lead.name||lead.email} description={lead.email} actions={<Button to="/leads" icon="back">Wróć do kontaktów</Button>}>
    <SectionTabs ariaLabel="Widok kontaktu" items={[{id:'summary',label:'Podsumowanie'},{id:'activity',label:'Aktywność'},{id:'campaigns',label:'Kampanie'},{id:'messages',label:'Wiadomości'}]} value={tab} onChange={setTab}/>
    <div className="sk-contact-workspace-grid"><div className="sk-contact-workspace-main">
      {tab==='summary'&&<form onSubmit={save}>
        <Panel className="sk-contact-profile"><div className="sk-contact-identity"><Avatar name={lead.name||lead.email}/><div><h2>{lead.name||lead.email}</h2><p>{lead.email}</p><small>Kontakt #{lead.id} · Dodano {dateTime(lead.created_at,{year:'numeric'})}</small></div><ContactStatus lead={lead}/></div>
          <fieldset disabled={saving} className="sk-contact-field-grid"><label>E-mail<input aria-label="E-mail" value={lead.email} readOnly/><code>{'{{email}}'}</code></label><label>Nazwa / imię<input aria-label="Nazwa / imię" maxLength={255} value={editName} onChange={e=>setEditName(e.target.value)}/><code>{'{{name}}'}</code></label></fieldset>
        </Panel>
        <Panel title="Pola własne" action={<Button to="/leads?fields=1" icon="settings">Zarządzaj polami</Button>}>
          <p className="sk-muted sk-small">Dane używane przez szablony i filtrowanie kontaktów.</p>
          <fieldset disabled={saving} className="sk-contact-field-grid">{customFields.map(f=><label key={f.key}>{f.label||f.key}<FieldInput field={f} aria-label={f.label||f.key} value={editCustom[f.key]} onChange={v=>setEditCustom(p=>({...p,[f.key]:f.field_type==='number'&&v!==''?Number(v):v}))}/><code>{`{{${f.key}}}`}</code>{!f.defined&&<small className="sk-muted">Wykryte w danych</small>}</label>)}</fieldset>
          {!customFields.length&&<p className="sk-muted">Brak własnych pól. Dodaj je w zarządzaniu polami.</p>}
          <ErrorNotice error={saveError}/><div className="sk-contact-savebar"><span role="status">{saving?'Zapisywanie…':dirty?'Niezapisane zmiany':'Brak niezapisanych zmian'}</span><Button disabled={saving||!dirty} onClick={async()=>{if(await confirm('Odrzucić niezapisane zmiany kontaktu?')){setEditName(lead.name||'');setEditCustom({...lead.custom_data});setSaveError(null);}}}>Odrzuć zmiany</Button><Button type="submit" variant="primary" disabled={saving||!dirty}>Zapisz dane</Button></div>
        </Panel>
        <Panel title="Status kontaktu"><dl className="sk-contact-status-grid"><div><dt>Weryfikacja adresu</dt><dd>{statusLabels[lead.email_verification_status]||lead.email_verification_status||'Brak wyniku'}</dd></div><div><dt>Wypisanie w kampaniach</dt><dd>{campaigns.some(c=>c.status==='unsubscribed')?'Tak':'Nie'}</dd></div><div><dt>Odbicie w kampaniach</dt><dd>{campaigns.some(c=>c.status==='bounced')?'Tak':'Nie'}</dd></div></dl></Panel>
      </form>}
      {tab==='activity'&&<Panel title="Oś czasu"><p className="sk-muted sk-small">Wiadomości, potwierdzone odpowiedzi i przypisania do kampanii, od najnowszych.</p><div className="sk-contact-activity-filters"><label>Rodzaj aktywności<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">Wszystkie zdarzenia</option><option value="messages">Wiadomości i odpowiedzi</option><option value="enrolled">Przypisania do kampanii</option><option value="reply_marker">Potwierdzone odpowiedzi</option></select></label><label>Kampania<select value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">Wszystkie kampanie</option>{campaigns.map(c=><option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}</select></label></div><Timeline events={filtered}/></Panel>}
      {tab==='campaigns'&&<Panel title="Kampanie kontaktu"><Campaigns items={campaigns}/></Panel>}
      {tab==='messages'&&<Panel title="Wiadomości"><p className="sk-muted sk-small">Zarejestrowane wiadomości. Potwierdzenie odpowiedzi nie jest dodatkową wiadomością.</p><Timeline events={events.filter(e=>e.kind!=='enrolled'&&e.kind!=='reply_marker')}/><Button to="/unibox" icon="mail">Otwórz Wątki</Button></Panel>}
    </div><aside className="sk-contact-workspace-aside">
      <Panel title="Podsumowanie"><dl className="sk-contact-summary">{[['Kampanie',campaigns.length],['Wysłane',outbound],['Odebrane',received],['Potwierdzenia odpowiedzi',replies]].map(([label,value])=><div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl></Panel>
      {tab==='summary'?<Panel title="Ostatnia aktywność"><Timeline events={events.slice(0,4)} compact/><Button className="sk-full-width" onClick={()=>setTab('activity')}>Zobacz pełną historię</Button></Panel>:<Panel title="Powiązane kampanie"><Campaigns items={campaigns}/></Panel>}
      <Panel title="Zmienne kontaktu"><dl className="sk-contact-values">{[{key:'email',label:'E-mail'},{key:'name',label:'Nazwa / imię'},...customFields].map(f=><div key={f.key}><dt>{f.label||f.key}</dt><dd>{displayValue(f.key==='email'?lead.email:f.key==='name'?lead.name:lead.custom_data?.[f.key])}</dd></div>)}</dl><p className="sk-muted sk-small">Zapisane wartości dostępne w szablonach.</p></Panel>
    </aside></div>
  </PageFrame>;
}
