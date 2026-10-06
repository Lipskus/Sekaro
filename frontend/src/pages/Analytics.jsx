import RecipientReport from '../redesign/RecipientReport';
import {useCampaignLanguage} from '../context/campaignLanguage';
import {useState,useEffect,useMemo,useRef} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../api';
import {PageFrame,Metric,Panel,Button,ErrorNotice,Empty,StatePanel} from '../redesign/ui';
import {analyticsRangeError,campaignDailyRows,analyticsCsv} from '../redesign/campaignAnalytics';
import {ResponsiveContainer,AreaChart,Area,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';

const series=[
 {key:'sent',name:'Wysłane',color:'var(--sk-accent)'},
 {key:'totalReplies',name:'Odpowiedzi',color:'#398bea'},
 {key:'totalOpens',name:'Otwarcia',color:'#d79a21'},
 {key:'totalClicks',name:'Kliknięcia',color:'#b079de'},
 {key:'uniqueOpens',name:'Unikalne IP otwarć / dzień / kampania',color:'#e07642'},
 {key:'uniqueClicks',name:'Unikalne IP kliknięć / dzień / kampania',color:'#dc6595'},
];
const count=v=>Number(v)||0;
const rate=(events,sent)=>sent?Math.round(events/sent*100):null;
const percent=value=>value===null?'—':`${value}%`;
function localIso(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function buildPresets(serverToday) {
  const t = serverToday || new Date();
  const todayStr = localIso(t);
  const d = (offset) => { const dt = new Date(t); dt.setDate(dt.getDate() + offset); return localIso(dt); };
  const monday = (dt) => { const x = new Date(dt); const day = x.getDay(); x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); return x; };
  const lastWeekEnd = new Date(monday(t)); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const lastWeekStart = localIso(monday(lastWeekEnd));
  const lastMonthStart = localIso(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  const lastMonthEnd = localIso(new Date(t.getFullYear(), t.getMonth(), 0));
  return [
    { label: 'Ostatnie 7 dni',  start: d(-6),          end: todayStr },
    { label: 'Poprzedni tydzień',    start: lastWeekStart,  end: localIso(lastWeekEnd) },
    { label: 'Ostatnie 30 dni', start: d(-29),         end: todayStr },
    { label: 'Poprzedni miesiąc',   start: lastMonthStart, end: lastMonthEnd },
    { label: 'Ostatnie 90 dni', start: d(-89),         end: todayStr },
  ];
}


export default function Analytics(){
  const {ct,language}=useCampaignLanguage();
 const [campaigns,setCampaigns]=useState([]),[campaignError,setCampaignError]=useState(null),[campaignLoading,setCampaignLoading]=useState(true),[campaignRetry,setCampaignRetry]=useState(0);
 const [presets,setPresets]=useState(()=>buildPresets(new Date()));
 const [activePreset,setActivePreset]=useState('Ostatnie 7 dni');
 const [startDate,setStartDate]=useState(presets[0].start),[endDate,setEndDate]=useState(presets[0].end);
 const rangeEdited=useRef(false);
 const [choice,setChoice]=useState(''),[selectedIds,setSelectedIds]=useState([]);
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(null),[retry,setRetry]=useState(0);
 const [visible,setVisible]=useState({sent:true,totalReplies:true,totalOpens:false,totalClicks:false,uniqueOpens:false,uniqueClicks:false});
 useEffect(()=>{let current=true;setCampaignLoading(true);setCampaignError(null);
  api.get('/campaigns').then(data=>{if(current)setCampaigns(data);}).catch(e=>{if(current)setCampaignError(e);}).finally(()=>{if(current)setCampaignLoading(false);});
  return()=>{current=false;};
 },[campaignRetry]);
 useEffect(()=>{let current=true;
  api.get('/settings/time-offset').then(data=>{if(!current)return;const today=new Date();today.setDate(today.getDate()+count(data.time_offset_days));const next=buildPresets(today);setPresets(next);if(!rangeEdited.current){setStartDate(next[0].start);setEndDate(next[0].end);}}).catch(()=>{});
  return()=>{current=false;};
 },[]);
 const rangeError=analyticsRangeError(startDate,endDate);
 useEffect(()=>{let current=true;if(rangeError){setLoading(false);setError(null);return;}
  setLoading(true);setError(null);
  const params=new URLSearchParams({start_date:startDate,end_date:endDate});selectedIds.forEach(id=>params.append('campaign_id',id));
  api.get('/analytics/daily?'+params).then(data=>{if(current)setRows(data);}).catch(()=>{if(current)setError('Nie udało się pobrać wyników analityki.');}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[startDate,endDate,selectedIds,retry,rangeError]);
 const filtered=selectedIds.length?campaigns.filter(c=>selectedIds.includes(String(c.id))):campaigns;
 const currentRows=useMemo(()=>rows.filter(r=>r.date>=startDate&&r.date<=endDate&&(!selectedIds.length||selectedIds.includes(String(r.campaign_id)))),[rows,startDate,endDate,selectedIds]);
 const chartData=useMemo(()=>campaignDailyRows(currentRows,startDate,endDate),[currentRows,startDate,endDate]);
 const totals=useMemo(()=>Object.fromEntries(series.map(s=>[s.key,chartData.reduce((sum,row)=>sum+row[s.key],0)])),[chartData]);
 const byCampaign=useMemo(()=>{const result={};for(const row of currentRows){const id=String(row.campaign_id);const entry=result[id]||(result[id]={sent:0,replies:0,opens:0,clicks:0});entry.sent+=count(row.sent);entry.replies+=count(row.total_replies);entry.opens+=count(row.total_opens);entry.clicks+=count(row.total_clicks);}return result;},[currentRows]);
 const ready=!loading&&!error&&!rangeError;
 const hasEvents=chartData.some(row=>series.some(s=>row[s.key]>0));
 const applyPreset=p=>{rangeEdited.current=true;setActivePreset(p.label);setStartDate(p.start);setEndDate(p.end);};
 const exportDaily=()=>{if(!ready||!hasEvents)return;const url=URL.createObjectURL(new Blob([analyticsCsv(chartData,ct)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`analityka-${startDate}-${endDate}.csv`;a.click();URL.revokeObjectURL(url);};
 const displayDate=d=>new Date(d+'T00:00:00Z').toLocaleDateString(language,{day:'numeric',month:'short',timeZone:'UTC'});
 return <PageFrame className="sk-analytics-page sk-analytics-workspace" title={ct("Analityka")} description={ct("Porównuj aktywność kampanii w wybranym okresie.")} actions={<Button icon="download" onClick={exportDaily} disabled={!ready||!hasEvents}>{ct("Eksport CSV")}</Button>}>
  <section className="sk-analytics-filters" aria-label={ct("Filtry analityki")}>
   <div className="sk-analytics-presets" aria-label={ct("Zakres czasu")}>{presets.map(p=><button key={p.label} aria-pressed={activePreset===p.label} className={activePreset===p.label?'is-active':''} onClick={()=>applyPreset(p)}>{ct(p.label)}</button>)}<button aria-pressed={activePreset==='custom'} className={activePreset==='custom'?'is-active':''} onClick={()=>{rangeEdited.current=true;setActivePreset('custom');}}>{ct("Własny zakres")}</button></div>
   {activePreset==='custom'&&<div className="sk-analytics-custom-range"><label>{ct("Od")} <input type="date" aria-label={ct("Data początkowa")} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>{ct("Do")} <input type="date" aria-label={ct("Data końcowa")} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label><span>{ct("Maksymalnie 366 dni")}</span></div>}
   <div className="sk-analytics-filter-line"><label htmlFor="campaign-select">{ct("Kampanie")}</label><select id="campaign-select" value={choice} disabled={campaignLoading||!!campaignError} onChange={e=>setChoice(e.target.value)}><option value="">{campaignLoading?ct("Wczytywanie kampanii…"):ct("Dodaj kampanię do porównania…")}</option>{campaigns.filter(c=>!selectedIds.includes(String(c.id))).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Button disabled={!choice||campaignLoading||!!campaignError} onClick={()=>{setSelectedIds(ids=>ids.includes(choice)?ids:[...ids,choice]);setChoice('');}}>{ct('Dodaj')}</Button><span className="sk-muted">{selectedIds.length?ct('{count} wybranych',{count:selectedIds.length}):ct("Wszystkie kampanie")}</span></div>
   {selectedIds.length>0&&<div className="sk-analytics-selected">{selectedIds.map(id=><button key={id} onClick={()=>setSelectedIds(ids=>ids.filter(x=>x!==id))} aria-label={ct('Usuń filtr kampanii {name}',{name:campaigns.find(c=>String(c.id)===id)?.name||id})}>{campaigns.find(c=>String(c.id)===id)?.name||id}<span aria-hidden="true">×</span></button>)}<Button onClick={()=>setSelectedIds([])}>{ct("Wyczyść filtry")}</Button></div>}
   <p className="sk-analytics-note">{ct("Odpowiedzi liczymy raz na kontakt, kampanię i dzień.")}</p>
   <p className="sk-analytics-period">{startDate} — {endDate} {ct("· zdarzenia według daty wystąpienia (UTC)")}</p>
  </section>
  <ErrorNotice error={campaignError} onRetry={()=>setCampaignRetry(n=>n+1)}/>
  <ErrorNotice error={ct(rangeError||error)} onRetry={rangeError?undefined:()=>setRetry(n=>n+1)}/>
  {loading?<StatePanel icon="refresh" title={ct("Ładowanie danych")} description={ct("Pobieramy wyniki dla wybranego okresu.")}/>:ready&&<>
   <div className="sk-analytics-metrics">
    <Metric icon="send" title={ct("Wysłane")} value={totals.sent.toLocaleString(language)} detail={ct("w wybranym zakresie")}/>
    <Metric icon="reply" title={ct("Odpowiedzi / wysyłki w okresie")} value={percent(rate(totals.totalReplies,totals.sent))} detail={ct('{count} odpowiedzi',{count:totals.totalReplies.toLocaleString(language)})} tone="blue"/>
    <Metric icon="eye" title={ct("Otwarcia")} value={totals.totalOpens.toLocaleString(language)} detail={ct("zdarzenia, także powtórne")} tone="amber"/>
    <Metric icon="link" title={ct("Kliknięcia")} value={totals.totalClicks.toLocaleString(language)} detail={ct("zdarzenia, także powtórne")} tone="purple"/>
   </div>
   {!hasEvents?<StatePanel icon="chart" title={ct("Brak danych")} description={ct("W wybranym okresie nie ma zdarzeń. Wybierz inny zakres lub kampanię.")}/>:<div className="sk-analytics-overview">
    <Panel title={ct("Aktywność wysyłki")} className="sk-analytics-chart-panel">
     <div className="sk-analytics-series" aria-label={ct("Serie wykresu")}>{series.map(s=><button key={s.key} aria-pressed={visible[s.key]} onClick={()=>setVisible(v=>({...v,[s.key]:!v[s.key]}))}><i style={{background:s.color}}/>{ct(s.name)}</button>)}</div>
     <div className="sk-analytics-plot" role="img" aria-label={ct("Dzienne zdarzenia kampanii. Dane są dostępne w eksporcie CSV.")}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:12,right:16,left:0,bottom:8}}><CartesianGrid stroke="var(--sk-line)" strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={displayDate} minTickGap={30} tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}} width={42}/><Tooltip labelFormatter={displayDate} contentStyle={{background:'var(--sk-surface)',borderColor:'var(--sk-line)',color:'var(--sk-text)',borderRadius:8}}/>{series.map(s=><Area key={s.key} dataKey={s.key} name={ct(s.name)} type="linear" stroke={s.color} fill={s.color} fillOpacity={.07} strokeWidth={2} hide={!visible[s.key]} isAnimationActive={false}/>)}</AreaChart></ResponsiveContainer></div>
     {!Object.values(visible).some(Boolean)&&<p className="sk-analytics-note" role="status">{ct("Włącz przynajmniej jedną serię nad wykresem.")}</p>}
    </Panel>
    <Panel title={ct("Zdarzenia w okresie")} className="sk-analytics-summary">{series.slice(0,4).map(s=><div className="sk-analytics-event" key={s.key}><div><span>{ct(s.name)}</span><strong>{totals[s.key].toLocaleString(language)}</strong></div><div className="sk-analytics-event-track"><i style={{width:`${totals[s.key]/Math.max(1,...series.slice(0,4).map(x=>totals[x.key]))*100}%`,background:s.color}}/></div></div>)}<p className="sk-analytics-note">{ct("Zdarzenia z tego okresu mogą dotyczyć wiadomości wysłanych wcześniej. Wskaźnik odpowiedzi może przekroczyć 100%; przy braku wysyłek pokazujemy „—”.")}</p><p className="sk-analytics-note">{ct("Unikalne IP są liczone oddzielnie dla dnia i kampanii. Ich suma nie oznacza liczby unikalnych odbiorców.")}</p></Panel>
   </div>}
   <RecipientReport startDate={startDate} endDate={endDate} selectedIds={selectedIds} rangeError={rangeError}/>
   <Panel title={ct("Wyniki kampanii")} className="sk-analytics-results" action={<span className="sk-muted">{campaignLoading?ct("Wczytywanie…"):campaignError?ct("Brak danych"):ct('{count} kampanii',{count:filtered.length})}</span>}>
    <p className="sk-analytics-note">{ct("Wysłane, odpowiedzi, otwarcia i kliknięcia dotyczą wybranego okresu. Kolejka i postęp opisują całą kampanię.")}</p>
    {campaignLoading?<Empty>{ct("Wczytywanie kampanii…")}</Empty>:campaignError?<Empty>{ct("Lista kampanii niedostępna.")}</Empty>:!filtered.length?<Empty icon="chart">{ct("Brak kampanii do analizy.")}</Empty>:<div className="sk-analytics-table-scroll" tabIndex={0} role="region" aria-label={ct("Wyniki kampanii — tabela")}><table className="sk-table"><thead><tr><th>{ct("Kampania")}</th><th>{ct("Wysłane")}</th><th>{ct("Odpowiedzi")}</th><th>{ct("Otwarcia")}</th><th>{ct("Kliknięcia")}</th><th>{ct("Kolejka · ogółem")}</th><th>{ct("Postęp · ogółem")}</th></tr></thead><tbody>{filtered.map(c=>{const r=byCampaign[String(c.id)]||{sent:0,replies:0,opens:0,clicks:0};const sent=count(c.stats?.emails_sent),scheduled=count(c.stats?.scheduled),progress=sent+scheduled?Math.round(sent/(sent+scheduled)*100):0;return <tr key={c.id}><td><Link to={`/campaigns/${c.id}#analytics`}>{c.name}</Link></td><td>{r.sent}</td><td><strong>{r.replies}</strong></td><td>{r.opens}</td><td>{r.clicks}</td><td>{scheduled}</td><td><div className="sk-analytics-progress"><progress max={100} value={progress} aria-label={ct('Postęp kampanii {name}',{name:c.name})}/><span>{progress}%</span></div></td></tr>;})}</tbody></table></div>}

   </Panel>
  </>}
 </PageFrame>;
}
