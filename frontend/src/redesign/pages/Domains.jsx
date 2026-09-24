import {useCallback,useEffect,useState} from 'react';
import {api} from '../../api';
import {Panel,Button,Badge,Empty,Icon,ErrorNotice} from '../ui';

export default function Domains(){
 const [inboxes,setInboxes]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{setInboxes(await api.get('/inboxes'));}catch(e){setError(e);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);
 const domains=[...new Set(inboxes.map(i=>i.email?.split('@')[1]).filter(Boolean))];

 return <div className="sk-page">
  <div className="sk-page-heading"><div><h1>Domeny</h1><p>Domeny nadawcze i stan konfiguracji skrzynek.</p></div><Button to="/system-health" icon="shield">Stan systemu</Button></div>
  <ErrorNotice error={error} onRetry={load}/>
  <div className="sk-notice tone-blue"><Icon name="info"/><span>Analiza DNS i reputacji jest zaplanowanym modułem. Brak pomiaru nie jest potwierdzeniem poprawnej konfiguracji ani dostarczalności.</span></div>
  <Panel title="Domeny nadawcze" icon="globe"><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Domena</th><th>Skrzynki</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>Diagnostyka</th></tr></thead><tbody>{domains.map(d=><tr key={d}><td><strong>{d}</strong></td><td>{inboxes.filter(i=>i.email.endsWith('@'+d)).length}</td><td><Badge>Nie sprawdzono</Badge></td><td><Badge>Nie sprawdzono</Badge></td><td><Badge>Nie sprawdzono</Badge></td><td><Button className="compact" to="/deliverability-tips">Zalecenia</Button></td></tr>)}</tbody></table>{loading?<Empty icon="globe">Wczytywanie domen…</Empty>:!domains.length&&!error?<Empty icon="globe">Nie dodano jeszcze skrzynek nadawczych.</Empty>:null}</div></Panel>
 </div>;
}
