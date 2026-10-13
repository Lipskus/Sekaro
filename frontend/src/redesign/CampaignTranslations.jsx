import {useState} from 'react';
import {api} from '../api';
import {Button,Panel,ErrorNotice} from './ui';
import LanguageVariants from './LanguageVariants';
import {useMessageText} from './MessageLanguage';
import LanguageSelect from './MessageLanguage';
import SafeEmail from './SafeEmail';
export default function CampaignTranslations({campaign,sequences,refresh}){
 const text=useMessageText();
 if(!campaign?.multilingual)return null;
 return <Panel title={text('Wersje językowe sekwencji','Sequence translations')} icon="mail"><div className="sk-settings-card-body"><p>{text('Główne edytory zawierają wersję domyślną kampanii. Zapisz każdą zmienioną wersję poniżej. Stopka pochodzi ze skrzynki nadawczej; bez tłumaczenia użyta będzie jej stopka domyślna.','Main editors contain the campaign default language. Save each changed version below. Signatures come from the sender mailbox; missing signature translations use its default signature.')}</p>{sequences.map(s=><div key={s.id}><TranslationEditor key={s.id} campaign={campaign} step={s} refresh={refresh}/>{(s.variants||[]).map(v=><TranslationEditor key={'v'+v.id} campaign={campaign} step={s} variant={v} refresh={refresh}/>)}</div>)}</div></Panel>;
}
function TranslationEditor({campaign,step,variant,refresh}){
 const text=useMessageText(),object=variant||step;const [draft,setDraft]=useState(object.translations||{}),[busy,setBusy]=useState(false),[error,setError]=useState(null),[saved,setSaved]=useState(false),[preview,setPreview]=useState(null),[language,setLanguage]=useState(campaign.default_language||'en');
 async function save(){setBusy(true);setError(null);try{await api.patch(`/campaigns/${campaign.id}/sequences/${step.id}`+(variant?`/variants/${variant.id}`:''),{translations:draft});setSaved(true);await refresh();}catch(e){setError(e);}finally{setBusy(false);}}
 async function show(){setBusy(true);setError(null);try{setPreview(await api.post(`/campaigns/${campaign.id}/preview`,{sequence_id:step.id,variant_id:variant?.id,language}));}catch(e){setError(e);}finally{setBusy(false);}}
 return <details className="sk-translation-step"><summary>{text('Krok','Step')} {step.position+1}{variant?' · A/B: '+variant.label:''}</summary><fieldset disabled={busy} className="sk-language-fields"><ErrorNotice error={error}/><LanguageVariants defaultLanguage={campaign.default_language} value={draft} onChange={v=>{setDraft(v);setSaved(false);setPreview(null);}}/><Button onClick={save}>{text('Zapisz tłumaczenia','Save translations')}</Button>{saved&&<p role="status">{text('Zapisano','Saved')}</p>}<hr/><label>{text('Język podglądu zapisanej wiadomości','Saved message preview language')}<LanguageSelect unknown={false} value={language} onChange={setLanguage}/></label><Button onClick={show} disabled={JSON.stringify(draft)!==JSON.stringify(object.translations||{})}>{text('Podgląd ze stopką','Preview with signature')}</Button>{preview&&<><strong>{preview.subject}</strong><p>{text('Wybrany język: ','Selected language: ')}{preview.language}</p>{preview.is_html?<SafeEmail html={preview.body}/>:<pre style={{whiteSpace:'pre-wrap'}}>{preview.body}</pre>}</>}</fieldset></details>;
}
