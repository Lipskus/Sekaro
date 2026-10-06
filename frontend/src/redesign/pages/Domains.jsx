import {useOperationsLanguage} from '../../context/operationsLanguage';
import {useCallback,useEffect,useState,useRef} from 'react';
import {api} from '../../api';
import {Panel,Button,Badge,Empty,ErrorNotice} from '../ui';
const states={not_measured:'Nie sprawdzono',present:'Rekord obecny',missing:'Brak rekordu w tym miejscu',error:'Błąd pomiaru',invalid:'Niejednoznaczny rekord',revoked:'Klucz odwołany',null_mx:'Null MX · brak odbioru',listed:'Wpis na liście',not_listed:'Brak wpisu w tej liście',passed:'Test zakończony powodzeniem',failed:'Test nieudany',not_configured:'Brak konfiguracji',observed:'Zarejestrowano synchronizację'};
function DomainRow({domain,count,demo}){
 const {ct,language}=useOperationsLanguage();const [selector,setSelector]=useState(''),[ip,setIp]=useState(''),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
 const requestId=useRef(0);useEffect(()=>()=>{++requestId.current;},[]);
 const check=async()=>{const id=++requestId.current;setBusy(true);setError(null);setResult(null);try{const value=await api.post('/diagnostics/domains/'+encodeURIComponent(domain),{selector,sending_ipv4:ip});if(id===requestId.current)setResult(value);}catch(e){if(id===requestId.current)setError(e);}finally{if(id===requestId.current)setBusy(false);}};
 const edit=(setter,value)=>{setter(value);setResult(null);setError(null);};
 return <Panel title={`${domain} · ${count}`} icon="globe">
  <div className="sk-analytics-filter-line"><label>{ct('Selektor DKIM')} <input value={selector} disabled={busy} placeholder="selector1" onChange={e=>edit(setSelector,e.target.value)}/></label><label>{ct('Publiczne IPv4 wysyłki')} <input value={ip} disabled={busy} onChange={e=>edit(setIp,e.target.value)}/></label><Button disabled={busy||demo} onClick={check}>{ct(busy?'Sprawdzanie…':'Sprawdź DNS')}</Button></div>
  <ErrorNotice error={error} onRetry={check}/>
  {result&&<p className="sk-muted">{ct('Pomiar')}: {new Date(result.checked_at).toLocaleString(language)}</p>}
  <div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>{ct('Pomiar')}</th><th>{ct('Wynik')}</th><th>{ct('Rekordy DNS')}</th></tr></thead><tbody>{['SPF','DKIM','DMARC','MX','Blacklist'].map(key=>{const r=result?.checks?.[key];return <tr key={key}><td>{key==='Blacklist'?'Spamhaus ZEN':key}</td><td><Badge>{ct(states[r?.state]||'Nie sprawdzono')}</Badge></td><td style={{maxWidth:480,overflowWrap:'anywhere',whiteSpace:'normal'}}>{r?.records?.join(' · ')||'—'}</td></tr>;})}</tbody></table></div>
 </Panel>;
}
export default function Domains(){
 const {ct,language}=useOperationsLanguage();const [data,setData]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(true);const requestId=useRef(0);
 const load=useCallback(async()=>{const id=++requestId.current;setLoading(true);setError(null);try{const value=await api.get('/diagnostics/mailboxes');if(id===requestId.current)setData(value);}catch(e){if(id===requestId.current)setError(e);}finally{if(id===requestId.current)setLoading(false);}},[]);
 useEffect(()=>{load();return()=>{++requestId.current;};},[load]);
 const rows=data?.rows||[];const domains=[...new Set(rows.map(i=>i.email?.split('@')[1]?.toLowerCase()).filter(Boolean))];
 const time=v=>v?new Date(v+'Z').toLocaleString(language):'—';
 return <div className="sk-page sk-analytics-workspace" aria-busy={loading}>
  <div className="sk-page-heading"><div><h1>{ct('Domeny')}</h1><p>{ct('Domeny nadawcze i stan konfiguracji skrzynek.')}</p></div><Button to="/inboxes">{ct('Ustawienia skrzynek')}</Button></div>
  <ErrorNotice error={error} onRetry={load}/>
  <p className="sk-notice tone-blue">{ct('Obecność rekordów nie potwierdza poprawności podpisu, autoryzacji IP ani dostarczalności. DMARC sprawdzamy tylko pod podaną domeną, bez dziedziczenia polityki. DKIM wymaga selektora; lista blokad wymaga rzeczywistego IP wysyłki. Wynik listy dotyczy wyłącznie Spamhaus ZEN.')}</p>
  {data?.demo&&<p className="sk-notice tone-amber">{ct('Demo: diagnostyka sieci jest wyłączona, a stan skrzynek jest fikcyjny.')}</p>}
  {loading?<Empty>{ct('Wczytywanie domen…')}</Empty>:!error&&!domains.length?<Empty>{ct('Nie dodano jeszcze skrzynek nadawczych.')}</Empty>:domains.map(d=><DomainRow key={d} domain={d} count={rows.filter(i=>i.email.toLowerCase().endsWith('@'+d)).length} demo={data?.demo}/>)}
  {!!rows.length&&<Panel title={ct('Stan skrzynek')}><p className="sk-analytics-note">{ct('Ostatni zapisany test SMTP/IMAP i synchronizacja nie są testem na żywo. Zmiana konfiguracji połączenia unieważnia wynik testu.')}</p><div className="sk-table-wrap"><table className="sk-table"><thead><tr>{['Skrzynka','Test SMTP/IMAP','Synchronizacja','Limit dzienny / godzinowy','Wstrzymana','Retencja EML'].map(h=><th key={h}>{ct(h)}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.email}</td><td>{ct(states[r.connection_test])}<small>{time(r.last_tested_at)}</small></td><td>{ct(states[r.sync_state])}<small>{time(r.last_sync_at)}</small></td><td>{r.max_emails_per_day} / {r.max_emails_per_hour||'—'}</td><td>{ct(r.paused?'Tak':'Nie')}</td><td>{r.retention_mode==='days'?`${r.retention_days} ${ct('dni')}`:ct(r.retention_mode==='keep'?'Zachowaj':r.retention_mode==='immediate'?'Usuń natychmiast':'Brak konfiguracji')}</td></tr>)}</tbody></table></div></Panel>}
 </div>;
}
