import LanguageSelect,{useMessageText} from './MessageLanguage';
import {useState} from 'react';
import {Button} from './ui';
import SafeEmail from './SafeEmail';
export default function LanguageVariants({value={},onChange,footer=false,defaultLanguage='en'}){
 const text=useMessageText(),[lang,setLang]=useState('de');const current=value[lang];
 const change=(key,v)=>onChange({...value,[lang]:{...current,[key]:v}});
 return <div className="sk-language-variants"><label>{text('Wariant językowy','Language variant')}<LanguageSelect unknown={false} value={lang} onChange={setLang}/></label>
 <p>{text('Zapisane wersje: ','Saved languages: ')}{Object.keys(value).join(', ')||'—'}</p>
 {!footer&&lang===defaultLanguage?<p>{text('Wersję domyślną edytuj w głównym edytorze wiadomości.','Edit the default version in the main message editor.')}</p>:!current?<Button type="button" onClick={()=>onChange({...value,[lang]:footer?{footer_text:'',footer_html:''}:{subject:'',body:'',is_html:false,preview_text:''}})}>{text('Dodaj wersję','Add language')}</Button>:<>
 {!footer&&<label>{text('Temat','Subject')}<input value={current.subject||''} maxLength={512} onChange={e=>change('subject',e.target.value)}/></label>}
 <label>{text(footer?'Stopka tekstowa':'Treść wiadomości',footer?'Plain-text signature':'Message body')}<textarea rows={7} value={current[footer?'footer_text':'body']||''} onChange={e=>change(footer?'footer_text':'body',e.target.value)}/></label>
 {footer?<label>{text('Stopka HTML (opcjonalna)','HTML signature (optional)')}<textarea rows={4} value={current.footer_html||''} onChange={e=>change('footer_html',e.target.value)}/></label>:<><label><input type="checkbox" checked={!!current.is_html} onChange={e=>change('is_html',e.target.checked)}/>HTML</label><label>{text('Tekst podglądu','Preview text')}<input value={current.preview_text||''} onChange={e=>change('preview_text',e.target.value)}/></label></>}
 {!footer&&<details><summary>{text('Treść zapasowa kroku spersonalizowanego','Personalized step fallback content')}</summary><label>{text('Temat zapasowy','Fallback subject')}<input value={current.fallback_subject||''} onChange={e=>change('fallback_subject',e.target.value)}/></label><label>{text('Treść zapasowa','Fallback body')}<textarea value={current.fallback_body||''} onChange={e=>change('fallback_body',e.target.value)}/></label></details>}
 <details><summary>{text('Podgląd wariantu','Variant preview')}</summary>{footer||current.is_html?<SafeEmail html={footer?current.footer_html||current.footer_text:current.body}/>:<pre style={{whiteSpace:'pre-wrap'}}>{current.body}</pre>}</details>
 <Button type="button" onClick={()=>{const next={...value};delete next[lang];onChange(next);}}>{text('Usuń wersję','Remove language')}</Button>
 </>}
 </div>;
}
