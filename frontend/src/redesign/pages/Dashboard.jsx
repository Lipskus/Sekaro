import {useState,useEffect,useCallback} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../../api';
import {useAuth} from '../../context/AuthContext';
import {useSystemHealth} from '../../context/SystemHealthContext';
import {Panel,Metric,Button,Badge,Avatar,Icon,Empty,ErrorNotice,dateTime} from '../ui';
import ActivityChart from '../ActivityChart';

export default function Dashboard(){
 const {user}=useAuth(),{overallStatus}=useSystemHealth();
 const [data,setData]=useState(null),[error,setError]=useState(''),[days,setDays]=useState(7);
 const load=useCallback(async()=>{
  setError('');const start=new Date();start.setUTCDate(start.getUTCDate()-days+1);
  try{const [inboxes,campaigns,daily,conversations,suppression]=await Promise.all([
   api.get('/inboxes'),api.get('/campaigns'),
   api.get(`/analytics/daily?start_date=${start.toISOString().slice(0,10)}&end_date=${new Date().toISOString().slice(0,10)}`),
   api.get('/ui/unibox?page=1&page_size=10&leads_only=true'),api.get('/leads/suppression')
  ]);setData({inboxes,campaigns,daily,conversations:conversations.items||[],suppression});}catch(e){setError(e);}
 },[days]);
 useEffect(()=>{load();},[load]);
 const inboxes=data?.inboxes||[],campaigns=data?.campaigns||[],daily=data?.daily||[];
 const sent=inboxes.reduce((a,i)=>a+(i.sent_today||0),0),limit=inboxes.reduce((a,i)=>a+(i.effective_max_per_day||i.max_emails_per_day||0),0);
 const today=new Date().toISOString().slice(0,10),replies=daily.filter(d=>d.date===today).reduce((a,d)=>a+(d.total_replies||0),0);
 const domains=[...new Set(inboxes.map(i=>i.email?.split('@')[1]).filter(Boolean))];
 const name=(user?.display_name||user?.name||user?.username||'Administratorze').split(' ')[0];
 const health=({error:['red','Wykryto problem'],warning:['amber','Wymaga uwagi'],ok:['green','Wszystko działa']})[overallStatus]||['neutral','Sprawdzanie…'];
 return <div className="sk-page sk-dashboard" aria-busy={!data&&!error}>
  <ErrorNotice error={error} onRetry={load}/>
  <div className="sk-page-heading"><div><h1>Witaj, {name}! <span aria-hidden="true">👋</span></h1><p>Oto podsumowanie kampanii i korespondencji.</p></div><div className="sk-heading-actions"><div className="sk-heading-meta"><Icon name="server" size={24}/><div>Self-hosted<small><Badge tone={health[0]} dot>{health[1]}</Badge></small></div></div><div className="sk-heading-meta"><Icon name="calendar" size={24}/><div>{new Date().toLocaleDateString('pl-PL',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}<small>{new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</small></div></div><Button to="/campaigns/add" icon="plus" variant="primary">Nowa kampania</Button></div></div>
  <div className="sk-metrics">
   <Metric icon="send" title="Wysłane dziś" value={data?sent:'—'} detail={`z limitu ${limit.toLocaleString('pl-PL')}`}/>
   <Metric icon="reply" title="Odpowiedzi" value={data?replies:'—'} detail="Dzisiaj · według raportu" tone="blue"/>
   <Metric icon="stack" title="Aktywne kampanie" value={data?campaigns.filter(c=>!c.paused).length:'—'} detail={`z ${campaigns.length} wszystkich`} tone="blue"/>
   <Metric icon="shield" title="Diagnostyka domeny" value="—" detail="Brak pomiaru DNS"/>
   <Metric icon="mail" title="Skrzynki" value={data?inboxes.length:'—'} detail={`${inboxes.filter(i=>!i.paused).length} aktywnych · SMTP/IMAP`} tone="blue"/>
   <Metric icon="unsubscribe" title="Wypisania" value={data?data.suppression.filter(x=>x.reason==='unsubscribe').length:'—'} detail="Na globalnej liście wykluczeń" tone="red"/>
  </div>
  <div className="sk-two-col"><Panel title="Aktywność wysyłki" icon="flash" action={<select className="sk-dashboard-range" aria-label="Zakres wykresu" value={days} onChange={e=>setDays(+e.target.value)}><option value={7}>Ostatnie 7 dni</option><option value={14}>Ostatnie 14 dni</option></select>}><ActivityChart rows={daily} days={days}/></Panel>
   <Panel title="Status domen i dostarczalność" icon="shield" action={<Button to="/domains" className="compact">Zobacz wszystkie <Icon name="arrow" size={14}/></Button>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Domena</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>Stan</th></tr></thead><tbody>{domains.slice(0,4).map(d=><tr key={d}><td>{d}</td><td>—</td><td>—</td><td>—</td><td><Badge>Nie sprawdzono</Badge></td></tr>)}</tbody></table>{!domains.length&&<Empty icon="globe">Dodaj skrzynkę, aby zobaczyć domenę nadawczą.</Empty>}</div>{domains.length>0&&<p className="sk-native-note">Brak pomiaru nie jest potwierdzeniem dostarczalności.</p>}</Panel></div>
  <div className="sk-quick-actions"><div className="sk-quick-title"><Icon name="flash" size={29}/><div><strong>Szybkie akcje</strong><small>Najczęściej używane działania</small></div></div>{[['/campaigns/add','plus','Nowa kampania','Utwórz i zaplanuj kampanię'],['/leads?import=1','upload','Import kontaktów','CSV, XLSX lub XLSM'],['/inboxes','mail','Dodaj skrzynkę','SMTP / IMAP'],['/domains','shield','Sprawdź domenę','Konfiguracja i diagnostyka']].map(([to,icon,title,desc],i)=><Link to={to} className={`sk-quick-action ${i===0?'primary':''}`} key={to}><Icon name={icon} size={25}/><div><strong>{title}</strong><small>{desc}</small></div></Link>)}</div>
  <div className="sk-two-col"><Panel title="Ostatnia aktywność kampanii" icon="calendar" action={<Button to="/campaigns" className="compact">Zobacz wszystkie <Icon name="arrow" size={14}/></Button>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Kampania</th><th>Status</th><th>Wysłane</th><th>Odpowiedzi</th><th>Utworzono</th></tr></thead><tbody>{campaigns.slice(0,4).map(c=><tr key={c.id}><td><Link to={'/campaigns/'+c.id}><strong>{c.name}</strong></Link></td><td><Badge dot tone={c.paused?'neutral':'green'}>{c.paused?'Wstrzymana':'Aktywna'}</Badge></td><td>{c.stats?.emails_sent??0}</td><td>{c.stats?.replies??0}</td><td>{dateTime(c.created_at)}</td></tr>)}</tbody></table>{!campaigns.length&&<Empty>Utwórz pierwszą kampanię.</Empty>}</div></Panel>
   <Panel title="Najnowsze rozmowy" icon="chat" action={<Button to="/unibox" className="compact">Zobacz wszystkie <Icon name="arrow" size={14}/></Button>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Kontakt</th><th>Wiadomość</th><th>Czas</th></tr></thead><tbody>{(data?.conversations||[]).slice(0,4).map(c=><tr key={c.inbox_id+':'+c.thread_id}><td><Link className="sk-inline-contact" to={`/unibox?thread=${encodeURIComponent(c.thread_id)}&inbox=${c.inbox_id}`}><Avatar size="small" name={c.lead_name||c.lead_email||c.subject}/><div><strong>{c.lead_name||c.lead_email?.split('@')[0]||c.subject}</strong><small>{c.lead_email}</small></div></Link></td><td><span className="sk-ellipsis sk-dashboard-snippet">{c.last_message_snippet||c.subject}</span></td><td>{dateTime(c.timestamp)}</td></tr>)}</tbody></table>{!(data?.conversations||[]).length&&<Empty icon="chat">Rozmowy pojawią się po synchronizacji IMAP.</Empty>}</div></Panel></div>
 </div>;
}
