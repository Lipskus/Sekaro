import {useEffect,useState,useCallback} from 'react';
import {useParams,useLocation,Link} from 'react-router-dom';
import {api} from '../../api';
import CampaignDetail from '../../pages/CampaignDetail';
import {Panel,Metric,Button,Badge,Icon,Empty,ErrorNotice,dateTime} from '../ui';
import ActivityChart from '../ActivityChart';
const tabs=[['overview','Przegląd'],['sequences','Sekwencja'],['leads','Odbiorcy'],['inboxes','Skrzynki'],['settings','Ustawienia'],['analytics','Analityka'],['queue','Aktywność']];
const plain=html=>new DOMParser().parseFromString(html||'','text/html').body.textContent||'';
export default function CampaignWorkspace(){
 const {id}=useParams(),location=useLocation(),tab=location.hash.slice(1)||'overview';
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[report,setReport]=useState(null),[calendar,setCalendar]=useState(null),[details,setDetails]=useState(false),[saved,setSaved]=useState('');
 const load=useCallback(async()=>{
  try{const from=new Date();from.setUTCDate(from.getUTCDate()-6);
   const [campaign,inboxes,sequences,leads,daily]=await Promise.all([api.get('/campaigns/'+id),api.get('/inboxes'),api.get(`/campaigns/${id}/sequences`),api.get(`/campaigns/${id}/leads`),api.get(`/analytics/daily?campaign_id=${id}&start_date=${from.toISOString().slice(0,10)}&end_date=${new Date().toISOString().slice(0,10)}`)]);
   setData({campaign,inboxes,sequences,leads,daily});setCalendar({sending_days:campaign.sending_days||[],sending_hours_start:campaign.sending_hours_start,sending_hours_end:campaign.sending_hours_end,timezone:campaign.timezone||'UTC'});
  }catch(e){setError(e);}
 },[id]);
 const check=useCallback(async()=>{setBusy(true);setError('');setReport(null);try{const r=await api.get(`/campaigns/${id}/preflight`);setReport(r);return r;}catch(e){setError(e);return null;}finally{setBusy(false);}},[id]);
 useEffect(()=>{setData(null);setReport(null);load();check();},[id]);
 // On returning from an editor, refresh both values and diagnostics.
 useEffect(()=>{if(tab==='overview'&&data){load();check();}},[tab]);
 const action=async()=>{setBusy(true);setError('');try{
  if(data.campaign.paused){await api.patch(`/campaigns/${id}`,calendar);const r=await api.get(`/campaigns/${id}/preflight`);setReport(r);if(!r.ready){setDetails(true);return;}await api.post(`/campaigns/${id}/start`,{});}
  else await api.post(`/campaigns/${id}/pause`,{});
  await load();
 }catch(e){setError(e);}finally{setBusy(false);}};
 const saveCalendar=async()=>{setBusy(true);setError('');setSaved('');try{await api.patch(`/campaigns/${id}`,calendar);setSaved('Harmonogram zapisany.');await load();setReport(await api.get(`/campaigns/${id}/preflight`));}catch(e){setError(e);}finally{setBusy(false);}};
 if(!data)return <div className="sk-page"><ErrorNotice error={error} onRetry={load}/>{!error&&<Empty>Wczytywanie kampanii…</Empty>}</div>;
 const {campaign:c,sequences,leads,daily}=data,ib=data.inboxes.filter(i=>(c.inbox_ids||[]).includes(i.id)),first=ib[0];
 const blocking=(report?.issues||[]).some(i=>i.severity==='error');
 const campaignState=c.paused?(report?.ready?['green','Gotowa do startu']:blocking?['red','Wymaga poprawek']:['amber','Wstrzymana']):['blue','Aktywna'];
 const preflightTone=report?.ready?'green':report?(blocking?'red':'amber'):'neutral';
 const preflightMessage=report?.ready?'Kampania jest gotowa do uruchomienia!':report?(blocking?'Popraw błędy przed uruchomieniem.':'Sprawdź ostrzeżenia przed uruchomieniem.'):'Sprawdzanie gotowości…';
 const jitterMinutes=first?Math.max(0,Math.round((Number(first.max_jitter_seconds)||0)/60)):'—';
 const groups=[['mail','Skrzynki SMTP',['no_inboxes','inbox_paused','smtp_missing','smtp_not_verified'],`${ib.length} przypisanych skrzynek`],['stack','Sekwencja wiadomości',['no_sequences','first_subject_missing','empty_sequence_body'],`${sequences.length} kroków`],['contacts','Kontakty',['no_contacts','no_sendable_contacts','custom_emails_pending'],`${report?.summary?.sendable_contacts??leads.length} kwalifikujących się do wysyłki`],['template','Zmienne w szablonach',['missing_variable_values'],'Sprawdzenie wartości kontaktów'],['warning','Potencjalne ryzyka',[],`${report?.warnings?.length||0} ostrzeżeń`],['shield','Bezpieczeństwo kolejki',['uncertain_send_attempts'],'Kontrola niepewnych wysyłek']];
 let cumulative=0;
 return <div className="sk-page sk-campaign-page">
  <div className="sk-breadcrumb"><Link to="/campaigns">Kampanie</Link><Icon name="next" size={13}/><span>{c.name}</span></div>
  <div className="sk-page-heading sk-campaign-heading"><div><div className="sk-title-line"><h1>{c.name}</h1><Badge tone={campaignState[0]} dot>{campaignState[1]}</Badge></div><p>Wiadomości, odbiorcy i harmonogram kampanii.</p></div><div className="sk-heading-actions"><div className="sk-heading-meta"><Icon name="calendar"/><div>Utworzona<small>{dateTime(c.created_at)}</small></div></div><Button icon={c.paused?'play':'pause'} variant={c.paused?'primary':'outline'} disabled={busy} onClick={action}>{busy?'Proszę czekać…':c.paused?'Uruchom kampanię':'Wstrzymaj'}</Button></div></div>
  <ErrorNotice error={error} onRetry={load}/>
  <nav className="sk-tabs" aria-label="Sekcje kampanii">{tabs.map(([key,label])=><Link className={`sk-tab ${tab===key?'active':''}`} aria-current={tab===key?'page':undefined} to={'#'+key} key={key}>{label}</Link>)}</nav>
  {tab==='overview'?<>
   <div className="sk-metrics four"><Metric icon="send" title="Kontakty w kampanii" value={leads.length} detail="Odbiorcy tej kampanii"/><Metric icon="mail" tone="blue" title="Skrzynki nadawcze" value={ib.length} detail={`${ib.filter(i=>!i.paused).length} aktywnych`}/><Metric icon="reply" tone="purple" title="Odpowiedzi" value={c.stats?.replies??0} detail="Rzeczywiste wyniki kampanii"/><Metric icon="chart" title="Status kampanii" value={<span className="sk-campaign-status-value">{campaignState[1]}</span>} detail="Kontrola przed uruchomieniem"/></div>
   <div className="sk-campaign-grid"><div>
    <Panel title="Harmonogram wysyłki" icon="calendar"><div className="sk-schedule-form">
     <div className="sk-schedule-row"><label>Dni wysyłki</label><div className="sk-days">{['Pon','Wto','Śro','Czw','Pią','Sob','Nie'].map((l,i)=><label key={i}><input type="checkbox" checked={calendar.sending_days.includes(i)} onChange={()=>setCalendar(p=>({...p,sending_days:p.sending_days.includes(i)?p.sending_days.filter(d=>d!==i):[...p.sending_days,i]}))}/>{l}</label>)}</div></div>
     <div className="sk-schedule-row"><label>Godziny wysyłki</label><div className="sk-time-range"><input aria-label="Początek wysyłki" type="time" value={calendar.sending_hours_start} onChange={e=>setCalendar(p=>({...p,sending_hours_start:e.target.value}))}/><span>–</span><input aria-label="Koniec wysyłki" type="time" value={calendar.sending_hours_end} onChange={e=>setCalendar(p=>({...p,sending_hours_end:e.target.value}))}/></div></div>
     <div className="sk-schedule-row"><label htmlFor="campaign-tz">Strefa czasowa</label><select id="campaign-tz" value={calendar.timezone} onChange={e=>setCalendar(p=>({...p,timezone:e.target.value}))}>{[...new Set([calendar.timezone,'UTC',...(Intl.supportedValuesOf?.('timeZone')||[])])].map(t=><option key={t}>{t}</option>)}</select></div>
     <dl className="sk-mailbox-limits">{[['Dzienny limit na skrzynkę',first?.max_emails_per_day,'wiadomości'],['Godzinowy limit na skrzynkę',first?.max_emails_per_hour||'—','wiadomości'],['Minimalny odstęp',first?.wait_minutes_between,'minut'],['Losowe opóźnienie',first?'0–'+jitterMinutes:'—','minut']].map(([label,value,unit])=><div key={label}><dt>{label}</dt><dd><strong>{value??'—'}</strong> {unit}</dd></div>)}</dl>
     <div className="sk-form-actions sk-form-actions-between"><span className="sk-small sk-muted">{saved||first?.email||'Brak skrzynki'}</span><Button className="compact" disabled={busy} onClick={saveCalendar}>Zapisz harmonogram</Button></div>
    </div></Panel>
    <Panel title="Sekwencja wiadomości" icon="mail" action={<Button icon="edit" className="compact" to="#sequences">Edytuj sekwencję</Button>}><div className="sk-sequence-list">{sequences.map((s,i)=>{cumulative+=s.wait_days_after_previous||0;return <div className="sk-sequence-step" key={s.id}><span className="sk-step-number">{i+1}</span><div className="sk-sequence-copy"><strong>{i===0?'Pierwsza wiadomość':`Ponowienie #${i}`}</strong><small>Temat: {s.subject||'Odpowiedź w wątku'}</small><small>{plain(s.body||s.fallback_body)}</small></div><Badge tone="blue">Dzień {cumulative}</Badge><Button className="compact" to="#sequences" icon="edit">Edytuj</Button></div>})}{!sequences.length&&<Empty>Dodaj pierwszą wiadomość.</Empty>}<Button to="#sequences" className="sk-full-width compact" icon="plus">Dodaj kolejny krok</Button></div></Panel>
   </div><div>
    <div className="sk-preflight"><div className="sk-panel-heading"><h2><Icon name="shield"/>Pre-flight — sprawdź przed startem</h2><Button icon="refresh" variant="ghost" className="compact" onClick={check} disabled={busy}>Sprawdź ponownie</Button></div><div className="sk-preflight-rows">{groups.map(([icon,title,codes,desc])=>{const issues=title==='Potencjalne ryzyka'?report?.warnings||[]:(report?.issues||[]).filter(i=>codes.includes(i.code));const severe=issues.some(i=>i.severity==='error'),tone=severe?'red':issues.length?'amber':'green';return <div className="sk-preflight-row" key={title}><Icon name={icon} size={22}/><div><strong>{title}</strong><small>{issues.length?issues[0].message:desc}</small></div><Badge tone={report?tone:'neutral'}><Icon name={!report?'clock':issues.length?'warning':'check'} size={16}/></Badge><Button className="compact" onClick={()=>setDetails(v=>!v)}>Szczegóły</Button></div>})}<div className={`sk-notice tone-${preflightTone}`}><Icon name={report?.ready?'success':'warning'} size={25}/><span><strong>{preflightMessage}</strong><br/>Wysyłka rozpoczyna się po ręcznym uruchomieniu.</span></div></div></div>
    {details&&<Panel title="Szczegóły kontroli" icon="info"><div className="sk-panel-body-compact">{!report?<p className="sk-muted sk-small">Brak aktualnych wyników kontroli.</p>:!(report.issues||[]).length?<p className="sk-muted sk-small">Brak zgłoszonych problemów.</p>:(report.issues||[]).map((x,i)=><div className={`sk-notice tone-${x.severity==='error'?'red':'amber'}`} key={i}>{x.message}</div>)}<Button to="#settings" className="compact">Ustawienia i obsługa błędów</Button></div></Panel>}
    <Panel title="Prognoza i statystyki" icon="chart" action={<Badge>Ostatnie 7 dni</Badge>}><div className="sk-campaign-stats">{[['send',c.stats?.scheduled||0,'W kolejce'],['mail',c.stats?.emails_sent||0,'Wysłano'],['reply',c.stats?.replies||0,'Odpowiedzi'],['contacts',leads.length,'Kontakty']].map(([icon,value,label])=><div key={label}><strong><Icon name={icon}/>{value}</strong><small>{label}</small></div>)}</div><ActivityChart rows={daily}/></Panel>
   </div></div>
  </>:tab==='inboxes'?<Panel title="Skrzynki przypisane do kampanii" icon="mail"><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Skrzynka</th><th>Limit dzienny</th><th>Limit godzinowy</th><th>Odstęp</th><th></th></tr></thead><tbody>{ib.map(i=><tr key={i.id}><td>{i.email}</td><td>{i.max_emails_per_day}</td><td>{i.max_emails_per_hour||'Brak'}</td><td>{i.wait_minutes_between} min</td><td><Button to={'/inboxes?inbox='+i.id} className="compact">Ustawienia skrzynki</Button></td></tr>)}</tbody></table>{!ib.length&&<Empty icon="mail">Ta kampania nie ma jeszcze przypisanej skrzynki.</Empty>}<Button to="#settings" className="compact sk-top-gap">Zmień przypisanie</Button></div></Panel>:<div className="sk-legacy-campaign"><CampaignDetail key={`${id}:${tab}`} embedded/></div>}
 </div>;
}
