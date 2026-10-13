import {useMessageText} from './MessageLanguage';
export default function ConnectionResult({result}){
 const text=useMessageText();if(!result)return <p>{text('Połączenie nie zostało sprawdzone.','Connection has not been tested.')}</p>;
 const parts=result.last_test_results||result;
 return <div role="status">{['smtp','imap'].map(key=>{const r=parts[key];return <p key={key}><strong>{key.toUpperCase()}: </strong>{!r?text('Brak wyniku','No result'):r.detail?.includes('skipped')?text('Nie skonfigurowano','Not configured'):r.ok?text('Połączenie potwierdzone','Connection verified'):text('Błąd: ','Failed: ')+(r.error||'—')}</p>;})}{result.last_tested_at&&<small>{text('Ostatni test: ','Last test: ')}{new Date(result.last_tested_at).toLocaleString()}</small>}</div>;
}
