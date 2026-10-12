import {useEffect,useState} from 'react';
import {api} from '../api';
import {useOptionalAuth} from '../context/AuthContext';
import {useOperationsLanguage} from '../context/operationsLanguage';
import {Panel,Button,ErrorNotice,Badge} from './ui';

export default function PublicEndpointStatus(){
 const {user}=useOptionalAuth()||{};
 const {ct}=useOperationsLanguage();
 const [data,setData]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0);
 useEffect(()=>{if(user?.role!=='admin')return;let live=true;api.get('/public-endpoint/status').then(d=>{if(live){setData(d);setError(null);}}).catch(e=>{if(live)setError(e);});return()=>{live=false;};},[user?.role,retry]);
 if(user?.role!=='admin')return null;
 const names={legacy:'Dotychczasowa konfiguracja',private:'Prywatny — bez linków publicznych',unsubscribe:'Tylko rezygnacje',tracking:'Śledzenie i rezygnacje',invalid:'Niepoprawna konfiguracja'};
 return <details className="sk-endpoint-status"><summary>{ct('Publiczny endpoint')}</summary><Panel title={ct('Publiczny endpoint')} actions={<Button onClick={()=>setRetry(n=>n+1)}>{ct('Odśwież')}</Button>}>
  <div className="sk-provider-content"><ErrorNotice error={error} onRetry={()=>setRetry(n=>n+1)}/>
  {data&&<><Badge tone={data.mode==='invalid'?'red':'neutral'}>{ct(names[data.mode]||names.invalid)}</Badge>
   <p>{ct('Zmianę trybu i połączenia wykonuje administrator instalacji. Brak synchronizacji rezygnacji blokuje zależne wysyłki.')}</p>
   {data.mode==='private'&&<p>{ct('W tym trybie nie dodajemy nagłówka rezygnacji. Usuń {{unsubscribe_link}} z szablonów i wyłącz śledzenie w kampanii.')}</p>}
   {(data.endpoints||[]).map(p=><div key={p.id}><strong>{p.id}</strong> <Badge tone={p.ready?'green':'red'}>{ct(p.ready?'Połączony':'Wysyłka zablokowana')}</Badge><p>{p.public_url}</p><small>{ct('Oczekujące zdarzenia')}: {p.pending??'—'}{p.retired?' · '+ct('Zachowany dla starych linków'):''}</small></div>)}
  </>}
  </div></Panel></details>;
}
