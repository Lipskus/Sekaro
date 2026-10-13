import languages from './messageLanguages.json';
import {useUiLanguage} from '../context/LanguageContext';
export function useMessageText(){const {language}=useUiLanguage();return (pl,en)=>language==='pl'?pl:en;}
export default function LanguageSelect({value='',onChange,unknown=true,...props}){
 const text=useMessageText();
 return <select {...props} value={value} onChange={e=>onChange(e.target.value)}>{unknown&&<option value="">{text('Nieznany','Unknown')}</option>}{Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name} ({code.toUpperCase()})</option>)}</select>;
}
