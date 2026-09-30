import {useOperationsLanguage} from '../../context/operationsLanguage';
import {useCallback,useEffect,useState,useRef} from 'react';
import {api} from '../../api';
import {Panel,Button,Badge,Empty,Icon,ErrorNotice} from '../ui';

export default function Domains(){
  const {ct,language}=useOperationsLanguage();
 const [inboxes,setInboxes]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const requestId=useRef(0);
 const load=useCallback(async()=>{
  const request=++requestId.current;setLoading(true);setError('');
  try{const rows=await api.get('/inboxes');if(request===requestId.current)setInboxes(rows);}catch(e){if(request===requestId.current)setError(e);}finally{if(request===requestId.current)setLoading(false);}
 },[]);
 useEffect(()=>{load();return()=>{++requestId.current;};},[load]);
 const domains=[...new Set(inboxes.map(i=>i.email?.split('@')[1]?.toLowerCase()).filter(Boolean))];

 return <div className="sk-page" aria-busy={loading}>
  <div className="sk-page-heading"><div><h1>{ct("Domeny")}</h1><p>{ct("Domeny nadawcze i stan konfiguracji skrzynek.")}</p></div><Button to="/system-health" icon="shield">{ct("Stan systemu")}</Button></div>
  <ErrorNotice error={error} onRetry={load}/>
  <div className="sk-notice tone-blue"><Icon name="info"/><span>{ct("Analiza DNS i reputacji jest zaplanowanym modułem. Brak pomiaru nie jest potwierdzeniem poprawnej konfiguracji ani dostarczalności.")}</span></div>
  <Panel title={ct("Domeny nadawcze")} icon="globe"><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>{ct("Domena")}</th><th>{ct("Skrzynki")}</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>{ct("Diagnostyka")}</th></tr></thead><tbody>{domains.map(d=><tr key={d}><td><strong>{d}</strong></td><td>{inboxes.filter(i=>i.email?.toLowerCase().endsWith('@'+d)).length}</td><td><Badge>{ct("Nie sprawdzono")}</Badge></td><td><Badge>{ct("Nie sprawdzono")}</Badge></td><td><Badge>{ct("Nie sprawdzono")}</Badge></td><td><Button className="compact" to="/deliverability-tips">{ct("Zalecenia")}</Button></td></tr>)}</tbody></table>{loading?<Empty icon="globe">{ct("Wczytywanie domen…")}</Empty>:!domains.length&&!error?<Empty icon="globe">{ct("Nie dodano jeszcze skrzynek nadawczych.")}</Empty>:null}</div></Panel>
 </div>;
}
