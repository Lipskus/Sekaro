import {useEffect,useState} from 'react';
import {api} from '../api';
import {useOperationsLanguage} from '../context/operationsLanguage';
import {Panel,Button,ErrorNotice,Empty} from './ui';

export const reportColumns=['label','sent','recipients','replied','reply_rate','bounced','bounce_rate','unsubscribed','unsubscribe_rate','status_known'];
const headings=['Grupa','Wysłane','Kontakty w kampaniach','Odpowiadający','Odpowiedzi %','Odbicia · stan','Odbicia % · stan','Wypisania · stan','Wypisania % · stan','Znany stan'];
export function recipientCsv(rows,ct=v=>v){
 const cell=value=>{let text=String(value??'—');if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 return '\uFEFF'+[headings.map(ct),...rows.map(row=>reportColumns.map(key=>key==='label'?(row.label??ct('Brak wartości')):row[key]))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export default function RecipientReport({startDate,endDate,selectedIds,rangeError}){
 const {ct}=useOperationsLanguage();
 const [group,setGroup]=useState('campaign'),[field,setField]=useState(''),[fields,setFields]=useState([]),[fieldError,setFieldError]=useState(null);
 const [result,setResult]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{let current=true;api.get('/contact-fields').then(data=>{if(current)setFields(Array.isArray(data)?data.filter(f=>!f.system):[]);}).catch(e=>{if(current)setFieldError(e);});return()=>{current=false;};},[]);
 useEffect(()=>{let current=true;setResult(null);setError(null);
  if(rangeError||(group==='field'&&!field)){setLoading(false);return()=>{current=false;};}
  setLoading(true);const params=new URLSearchParams({start_date:startDate,end_date:endDate,group_by:group});
  if(group==='field')params.set('field_key',field);selectedIds.forEach(id=>params.append('campaign_id',id));
  api.get('/analytics/report?'+params).then(data=>{if(current)setResult(data);}).catch(e=>{if(current)setError(e);}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[startDate,endDate,selectedIds,rangeError,group,field,retry]);
 const rows=result?.rows||[];
 const download=()=>{const url=URL.createObjectURL(new Blob([recipientCsv(rows,ct)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`odbiorcy-${group}-${startDate}-${endDate}.csv`;a.click();URL.revokeObjectURL(url);};
 return <Panel title={ct('Skuteczność wybranych wysyłek')} className="sk-analytics-results" action={<Button icon="download" disabled={loading||!!error||!!rangeError||!rows.length} onClick={download}>{ct('Eksport odbiorców CSV')}</Button>}>
  <div className="sk-analytics-filter-line"><label>{ct('Przekrój')} <select value={group} onChange={e=>setGroup(e.target.value)}><option value="campaign">{ct('Kampania')}</option><option value="inbox">{ct('Skrzynka')}</option><option value="field">{ct('Pole kontaktu')}</option></select></label>
  {group==='field'&&<label>{ct('Pole kontaktu')} <select value={field} onChange={e=>setField(e.target.value)}><option value="">{ct('Wybierz pole')}</option>{fields.map(f=><option key={f.key} value={f.key}>{f.label||f.key}</option>)}</select></label>}</div>
  <p className="sk-analytics-note">{ct('Jednostka: kontakt w kampanii z wysyłką w wybranym okresie UTC. Odpowiedzi do końca tego okresu przypisujemy do ostatniej poprzedzającej wysyłki. Ten sam kontakt może wystąpić w kilku grupach; grup nie należy sumować.')}</p>
  <p className="sk-analytics-note">{ct('Odbicia, wypisania i pola kontaktu opisują bieżący stan, bez daty zmiany. Brak pełnego stanu oznacza „—” zamiast procentu. Automatyczne odpowiedzi wykluczamy według bieżącej kategorii kontaktu w kampanii.')}</p>
  <ErrorNotice error={error} onRetry={()=>setRetry(v=>v+1)}/>{group==='field'&&<ErrorNotice error={fieldError}/>}
  {loading?<Empty>{ct('Wczytywanie…')}</Empty>:!error&&!rangeError&&(rows.length?<div className="sk-analytics-table-scroll" tabIndex={0} role="region" aria-label={ct('Raport odbiorców')}><table className="sk-table"><thead><tr>{headings.map(h=><th key={h}>{ct(h)}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}>{reportColumns.map(key=><td key={key}>{key==='label'?(row.label??ct('Brak wartości')):row[key]===null?'—':key.endsWith('_rate')?`${row[key]}%`:row[key]}</td>)}</tr>)}</tbody></table></div>:<Empty>{ct(group==='field'&&!field?'Wybierz pole':'Brak wysyłek w wybranym zakresie.')}</Empty>)}
 </Panel>;
}
