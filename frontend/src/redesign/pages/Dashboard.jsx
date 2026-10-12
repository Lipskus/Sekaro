import {useOperationsLanguage} from '../../context/operationsLanguage';
import {useState,useEffect,useCallback,useRef} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../../api';
import {useAuth} from '../../context/AuthContext';
import {useSystemHealth} from '../../context/SystemHealthContext';
import {Panel,Metric,Button,Badge,Avatar,Icon,Empty,ErrorNotice,StatePanel,dateTime} from '../ui';
import {campaignView} from '../campaignView';
import ActivityChart from '../ActivityChart';

export default function Dashboard(){
  const {ct,language}=useOperationsLanguage();
 const {user}=useAuth(),{overallStatus,loading:healthLoading,fetchError:healthError}=useSystemHealth();
 const [data,setData]=useState(null),[error,setError]=useState(''),[days,setDays]=useState(7);
 const requestId=useRef(0);
 const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  const request=++requestId.current;setLoading(true);setError('');const start=new Date();start.setUTCDate(start.getUTCDate()-days+1);
  try{const [inboxes,campaigns,daily,conversations,suppression]=await Promise.all([
   api.get('/inboxes'),api.get('/campaigns'),
   api.get(`/analytics/daily?start_date=${start.toISOString().slice(0,10)}&end_date=${new Date().toISOString().slice(0,10)}`),
   api.get('/ui/unibox?page=1&page_size=10&leads_only=true'),api.get('/leads/suppression')
  ]);if(request!==requestId.current)return;setData({inboxes,campaigns,daily,conversations:conversations.items||[],suppression});}catch(e){if(request===requestId.current)setError(e);}finally{if(request===requestId.current)setLoading(false);}
 },[days]);
 useEffect(()=>{load();return()=>{++requestId.current;};},[load]);
 const inboxes=data?.inboxes||[],campaigns=data?.campaigns||[],daily=data?.daily||[];
 const sent=inboxes.reduce((a,i)=>a+(i.sent_today||0),0),limit=inboxes.reduce((a,i)=>a+(i.effective_max_per_day||i.max_emails_per_day||0),0);
 const today=new Date().toISOString().slice(0,10),replies=daily.filter(d=>d.date===today).reduce((a,d)=>a+(d.total_replies||0),0);
 const replyRate=sent?((replies/sent)*100).toFixed(1):'0.0';
 const activeInboxes=inboxes.filter(i=>!i.paused).length;
 const domains=[...new Set(inboxes.map(i=>i.email?.split('@')[1]?.toLowerCase()).filter(Boolean))];
 const name=(user?.display_name||user?.name||user?.username||ct("Administratorze")).split(' ')[0];
 const health=healthError?['neutral','Brak danych']:healthLoading&&overallStatus==='unknown'?['neutral','Sprawdzanie…']:({error:['red','Wykryto problem'],warning:['amber','Wymaga uwagi'],ok:['green','Online']})[overallStatus]||['neutral','Stan nieznany'];
 return <div className="sk-page sk-dashboard" aria-busy={loading}>
  <ErrorNotice error={error} onRetry={load}/>
  <div className="sk-page-heading"><div><h1>{ct('Witaj, {name}!',{name})}</h1><p>{ct("Oto podsumowanie Twoich działań outreachowych.")}</p></div><div className="sk-heading-actions"><div className="sk-heading-meta"><Icon name="server" size={24}/><div>Self-hosted<small><Badge tone={health[0]} dot>{ct(health[1])}</Badge></small></div></div><div className="sk-heading-meta"><Icon name="calendar" size={24}/><div>{new Date().toLocaleDateString(language,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}<small>{new Date().toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'})}</small></div></div><Button to="/campaigns/add" icon="plus" variant="primary">{ct("Nowa kampania")}</Button></div></div>
  {!data ? <StatePanel icon={error?'warning':'refresh'} title={error?ct("Podsumowanie niedostępne"):ct("Ładowanie podsumowania")} description={error?ct("Spróbuj ponownie pobrać dane."):ct("Pobieramy kampanie, skrzynki i rozmowy.")}/> : <>
  {error && <p className="sk-notice tone-amber">{ct("Poniżej ostatnie poprawnie pobrane dane. Nie udało się ich odświeżyć.")}</p>}
  <div className="sk-metrics">
   <Metric icon="send" title={ct("Wysłane dziś")} value={data?sent:'—'} detail={ct('z limitu {count}',{count:limit.toLocaleString(language)})}/>
   <Metric icon="reply" title={ct("Odpowiedzi")} value={data?replies:'—'} detail={ct('{rate}% współczynnik',{rate:Number(replyRate).toLocaleString(language,{minimumFractionDigits:1,maximumFractionDigits:1})})} tone="blue"/>
   <Metric icon="stack" title={ct("Aktywne kampanie")} value={data?campaigns.filter(c=>campaignView(c).statusKey==='active').length:'—'} detail={ct('z {count} wszystkich',{count:campaigns.length})} tone="blue"/>
   <Metric icon="shield" title={ct("Zdrowie domeny")} value="—" detail={ct("Brak pomiaru DNS")}/>
   <Metric icon="mail" title={ct("Skrzynki")} value={data?inboxes.length:'—'} detail={inboxes.length&&activeInboxes===inboxes.length?ct("Wszystkie aktywne"):ct('{active} aktywnych · {paused} wstrzymanych',{active:activeInboxes,paused:inboxes.length-activeInboxes})} tone="blue"/>
   <Metric icon="unsubscribe" title={ct("Wypisania")} value={data?data.suppression.filter(x=>x.reason==='unsubscribe').length:'—'} detail={ct("Na globalnej liście wykluczeń")} tone="red"/>
  </div>
  <div className="sk-two-col"><Panel title={ct("Aktywność wysyłki")} icon="flash" action={<select className="sk-dashboard-range" aria-label={ct("Zakres wykresu")} value={days} onChange={e=>setDays(+e.target.value)}><option value={7}>{ct("Ostatnie 7 dni")}</option><option value={14}>{ct("Ostatnie 14 dni")}</option></select>}><div aria-busy={loading}>{loading?<StatePanel icon="refresh" title={ct("Aktualizowanie wykresu")}/>:error?<StatePanel icon="warning" title={ct("Wykres niedostępny")} description={ct("Nie udało się pobrać wybranego okresu.")}/>:<ActivityChart rows={daily} days={days}/>}</div></Panel>
   <Panel title={ct("Status domen i dostarczalność")} icon="shield" action={<Button to="/domains" className="compact">{ct("Zobacz wszystkie")} <Icon name="arrow" size={14}/></Button>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>{ct("Domena")}</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>{ct("Stan")}</th></tr></thead><tbody>{domains.slice(0,4).map(d=><tr key={d}><td>{d}</td><td>—</td><td>—</td><td>—</td><td><Badge>{ct("Nie sprawdzono")}</Badge></td></tr>)}</tbody></table>{!domains.length&&<Empty icon="globe">{ct("Dodaj skrzynkę, aby zobaczyć domenę nadawczą.")}</Empty>}</div>{domains.length>0&&<p className="sk-native-note">{ct("Brak pomiaru nie jest potwierdzeniem dostarczalności.")}</p>}</Panel></div>
  <div className="sk-quick-actions"><div className="sk-quick-title"><Icon name="flash" size={29}/><div><strong>{ct("Szybkie akcje")}</strong><small>{ct("Najczęściej używane działania")}</small></div></div>{[['/campaigns/add','plus','Nowa kampania','Utwórz i zaplanuj kampanię'],['/leads?import=1','upload','Import kontaktów','CSV, XLSX lub XLSM'],['/inboxes','mail','Dodaj skrzynkę','SMTP / IMAP'],['/domains','shield','Sprawdź domenę','Konfiguracja i diagnostyka']].map(([to,icon,title,desc],i)=><Link to={to} className={`sk-quick-action ${i===0?'primary':''}`} key={to}><Icon name={icon} size={25}/><div><strong>{ct(title)}</strong><small>{ct(desc)}</small></div></Link>)}</div>
  <div className="sk-two-col"><Panel title={ct("Ostatnia aktywność kampanii")} icon="calendar" action={<Button to="/campaigns" className="compact">{ct("Zobacz wszystkie")} <Icon name="arrow" size={14}/></Button>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>{ct("Kampania")}</th><th>{ct("Status")}</th><th>{ct("Wysłane")}</th><th>{ct("Odpowiedzi")}</th><th>{ct("Utworzono")}</th></tr></thead><tbody>{campaigns.slice(0,4).map(c=><tr key={c.id}><td><Link to={'/campaigns/'+c.id}><strong>{c.name}</strong></Link></td><td><Badge dot tone={campaignView(c).tone}>{ct(campaignView(c).statusLabel)}</Badge></td><td>{c.stats?.emails_sent??0}</td><td>{c.stats?.replies??0}</td><td>{dateTime(c.created_at,{},language)}</td></tr>)}</tbody></table>{!campaigns.length&&<Empty>{ct("Utwórz pierwszą kampanię.")}</Empty>}</div></Panel>
   <Panel title={ct("Najnowsze rozmowy")} icon="chat" action={<Button to="/unibox" className="compact">{ct("Zobacz wszystkie")} <Icon name="arrow" size={14}/></Button>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>{ct("Kontakt")}</th><th>{ct("Wiadomość")}</th><th>{ct("Czas")}</th></tr></thead><tbody>{(data?.conversations||[]).slice(0,4).map(c=><tr key={c.inbox_id+':'+c.thread_id}><td><Link className="sk-inline-contact" to={`/unibox?thread=${encodeURIComponent(c.thread_id)}&inbox=${c.inbox_id}`}><Avatar size="small" name={c.lead_name||c.lead_email||c.subject}/><div><strong>{c.lead_name||c.lead_email?.split('@')[0]||c.subject}</strong><small>{c.lead_email}</small></div></Link></td><td><span className="sk-ellipsis sk-dashboard-snippet">{c.last_message_snippet||c.subject}</span></td><td>{dateTime(c.timestamp,{},language)}</td></tr>)}</tbody></table>{!(data?.conversations||[]).length&&<Empty icon="chat">{ct("Rozmowy pojawią się po synchronizacji IMAP.")}</Empty>}</div></Panel></div>
 </>}
 </div>;
}
