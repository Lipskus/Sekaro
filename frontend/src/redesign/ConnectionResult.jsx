import {useMessageText} from './MessageLanguage';
export default function ConnectionResult({result,cards=false}){
 const text=useMessageText();if(!result&&!cards)return <p>{text('Połączenie nie zostało sprawdzone.','Connection has not been tested.')}</p>;
 const parts=result?.last_test_results||result||{};
 return <div role="status" className={cards?'sk-mailbox-test-results':undefined}>{['smtp','imap'].map(key=>{const r=parts[key];return <p key={key}><strong>{key.toUpperCase()}: </strong>{!r?text('Nie testowano','Not tested'):r.detail?.includes('skipped')?text('Nie skonfigurowano','Not configured'):r.ok?text('Połączenie potwierdzone','Connection verified'):text('Błąd: ','Failed: ')+(r.error||'—')}</p>;})}{result?.last_tested_at&&<small>{text('Ostatni test: ','Last test: ')}{new Date(result?.last_tested_at).toLocaleString()}</small>}</div>;
}
