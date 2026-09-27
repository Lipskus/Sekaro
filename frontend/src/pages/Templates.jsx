import {Link, useNavigate} from 'react-router-dom';
import {useEffect, useMemo, useRef, useState} from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {api} from '../api';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {PageFrame, ErrorNotice, StatePanel, dateTime} from '../redesign/ui';
import SafeEmail from '../redesign/SafeEmail';
import {useNotify} from '../context/NotificationContext';
import {useConfirm} from '../context/ConfirmContext';

const emptyDraft = {name:'', subject:'', body:'', is_html:false};
const latestVersion = row => row?.latest_version || row?.versions?.[0] || null;
const fromTemplate = row => ({name:row.name || '', subject:latestVersion(row)?.subject || '', body:latestVersion(row)?.body || '', is_html:!!latestVersion(row)?.is_html});
const token = key => `{{${key}}}`;
const valueText = value => value == null || value === '' ? 'Brak wartości' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export default function Templates(){
 const notify=useNotify(), confirm=useConfirm(), navigate=useNavigate();
 const [templates,setTemplates]=useState([]),[fields,setFields]=useState([]),[inboxes,setInboxes]=useState([]);
 const [selected,setSelected]=useState(null),[versionId,setVersionId]=useState(null);
 const [draft,setDraft]=useState(emptyDraft),[baseline,setBaseline]=useState(emptyDraft);
 const [mode,setMode]=useState('edit'),[sourceMode,setSourceMode]=useState(false),[query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[baseLoading,setBaseLoading]=useState(true),[baseError,setBaseError]=useState(null),[error,setError]=useState(null);
 const operation=useRef(false),alive=useRef(true),baseSeq=useRef(0),previewSeq=useRef(0),searchSeq=useRef(0);
 const [search,setSearch]=useState(''),[matches,setMatches]=useState([]),[searchState,setSearchState]=useState('idle'),[searchError,setSearchError]=useState(null);
 const [contact,setContact]=useState(null),[preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false),[previewError,setPreviewError]=useState(null);
 const [testInbox,setTestInbox]=useState(''),[testTo,setTestTo]=useState(''),[testBusy,setTestBusy]=useState(false),[testError,setTestError]=useState(null);
 const testLock=useRef(false);
 const dirty=JSON.stringify(draft)!==JSON.stringify(baseline), locked=busy||testBusy;
 const previewKey=JSON.stringify([draft.subject,draft.body,draft.is_html,contact?.id]);
 const currentPreviewKey=useRef(previewKey);currentPreviewKey.current=previewKey;
 const currentSearch=useRef(search);currentSearch.current=search;
 const shown=templates.filter(t=>t.name.toLocaleLowerCase('pl-PL').includes(query.toLocaleLowerCase('pl-PL')));
 const smtpInboxes=useMemo(()=>inboxes.filter(i=>(i.provider||'smtp')==='smtp'),[inboxes]);
 const activeVersion=selected?.versions?.find(v=>v.id===versionId);
 const update=(key,value)=>setDraft(d=>({...d,[key]:value}));

 async function loadBase(){
  const seq=++baseSeq.current;setBaseLoading(true);setBaseError(null);
  try{const [tpls,flds,ibxs]=await Promise.all([api.get('/templates'),api.get('/contact-fields'),api.get('/inboxes')]);
   if(!alive.current||seq!==baseSeq.current)return;
   setTemplates(Array.isArray(tpls)?tpls:[]);setFields(Array.isArray(flds)?flds:[]);setInboxes(Array.isArray(ibxs)?ibxs:[]);
   setTestInbox(old=>old||String((ibxs||[]).find(i=>(i.provider||'smtp')==='smtp'&&!i.paused)?.id||''));
  }catch(e){if(alive.current&&seq===baseSeq.current)setBaseError(e);}finally{if(alive.current&&seq===baseSeq.current)setBaseLoading(false);}
 }
 useEffect(()=>{alive.current=true;loadBase();return()=>{alive.current=false;++previewSeq.current;++searchSeq.current;++baseSeq.current;};},[]);
 useEffect(()=>{++previewSeq.current;setPreview(null);setPreviewBusy(false);setPreviewError(null);setTestError(null);},[previewKey]);
 useEffect(()=>{++searchSeq.current;setMatches([]);setSearchState('idle');setSearchError(null);},[search]);
 useEffect(()=>{const leave=e=>{if(dirty||locked){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty,locked]);
 // BrowserRouter does not expose useBlocker. Guard ordinary in-app links in capture phase.
 useEffect(()=>{const leave=e=>{const a=e.target.closest?.('a[href]');if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank')return;
  const url=new URL(a.href,window.location.href);if(url.origin!==window.location.origin||url.pathname===window.location.pathname)return;
  if(dirty||locked){e.preventDefault();e.stopPropagation();if(!locked)choose(()=>navigate(url.pathname+url.search+url.hash));}
 };document.addEventListener('click',leave,true);return()=>document.removeEventListener('click',leave,true);},[dirty,locked,navigate]);
 async function run(action){
  if(operation.current||testLock.current)return;operation.current=true;setBusy(true);setError(null);
  try{await action();}catch(e){if(alive.current)setError(e.message||'Nie udało się wykonać operacji.');}finally{operation.current=false;if(alive.current)setBusy(false);}
 }
 function choose(action){
  if(operation.current||testLock.current)return;
  if(!dirty){action();return;}
  operation.current=true;setBusy(true);
  confirm('Masz niezapisane zmiany szablonu. Odrzucić je i kontynuować?').then(ok=>{operation.current=false;if(alive.current){setBusy(false);if(ok)action();}});
 }
 function apply(row){const next=fromTemplate(row);setSelected(row);setDraft(next);setBaseline(next);setVersionId(latestVersion(row)?.id??null);setMode('edit');setSourceMode(false);setPreview(null);}
 function open(id){choose(()=>run(async()=>apply(await api.get(`/templates/${id}`))));}
 function reset(){setSelected(null);setVersionId(null);setDraft(emptyDraft);setBaseline(emptyDraft);setMode('edit');setSourceMode(false);setPreview(null);setError(null);}
 function duplicate(){if(locked)return;setSelected(null);setVersionId(null);setBaseline(emptyDraft);setDraft(d=>({...d,name:`${d.name} — kopia`.slice(0,255)}));setMode('edit');setError(null);}
 function save(){if(!draft.name.trim()){setError('Podaj nazwę szablonu.');return;}run(async()=>{
  const payload={...draft,name:draft.name.trim()};
  const row=await api.post(selected?`/templates/${selected.id}/versions`:'/templates',payload);
  if(!alive.current)return;apply(row);notify({type:'success',message:selected?'Zapisano nową wersję.':'Szablon utworzony.'});await loadBase();
 });}
 function remove(){run(async()=>{if(!selected)return;if(!await confirm(`Usunąć szablon „${selected.name}” wraz z historią wersji?`))return;
  await api.del(`/templates/${selected.id}`);if(!alive.current)return;reset();await loadBase();notify({type:'success',message:'Szablon usunięty.'});
 });}
 function loadVersion(id){choose(()=>{const v=selected?.versions?.find(v=>v.id===id);if(!v)return;setDraft(d=>({...d,subject:v.subject||'',body:v.body||'',is_html:!!v.is_html}));setVersionId(id);setSourceMode(false);setMode('edit');setPreview(null);});}
 function insert(key,target){if(locked)return;setMode('edit');update(target,`${draft[target]}${draft[target]&&!/\s$/.test(draft[target])?' ':''}${token(key)}`);}
 async function searchContacts(){
  if(!search.trim())return;const seq=++searchSeq.current,value=search;setSearchState('loading');setSearchError(null);setMatches([]);
  try{const rows=await api.get(`/leads?q=${encodeURIComponent(value.trim())}`);if(!alive.current||seq!==searchSeq.current||value!==currentSearch.current)return;setMatches(Array.isArray(rows)?rows.slice(0,25):[]);setSearchState('done');}
  catch(e){if(alive.current&&seq===searchSeq.current){setSearchError(e.message||'Nie udało się wyszukać kontaktów.');setSearchState('error');}}
 }
 async function renderPreview(){
  const seq=++previewSeq.current,key=previewKey;setPreviewBusy(true);setPreview(null);setPreviewError(null);
  try{const row=await api.post('/templates/preview/render',{subject:draft.subject,body:draft.body,is_html:draft.is_html,lead_id:contact?.id??null});
   if(alive.current&&seq===previewSeq.current&&key===currentPreviewKey.current)setPreview(row);
  }catch(e){if(alive.current&&seq===previewSeq.current)setPreviewError(e.message||'Nie udało się wygenerować podglądu.');}
  finally{if(alive.current&&seq===previewSeq.current)setPreviewBusy(false);}
 }
 async function sendTest(){
  if(testLock.current||operation.current)return;
  if(!testInbox||!/^\S+@\S+\.\S+$/.test(testTo.trim())){setTestError('Wybierz skrzynkę i podaj poprawny adres testowy.');return;}
  testLock.current=true;setTestBusy(true);setTestError(null);const recipient=testTo.trim();
  try{await api.post('/templates/actions/test-send',{inbox_id:Number(testInbox),to_email:recipient,subject:draft.subject,body:draft.body,is_html:draft.is_html,lead_id:contact?.id??null});if(alive.current)notify({type:'success',message:`Wiadomość testowa wysłana do ${recipient}.`});}
  catch(e){if(alive.current)setTestError(e.message||'Wysyłka testowa nie powiodła się.');}finally{testLock.current=false;if(alive.current)setTestBusy(false);}
 }
 const editing=mode==='edit';
 return <PageFrame className="sk-templates-page" title={editing?'Szablony wiadomości':'Podgląd i wysyłka testowa'} description={editing?'Twórz, wersjonuj i ponownie wykorzystuj wiadomości.':'Sprawdź zmienne na konkretnym kontakcie przed użyciem szablonu.'}
  actions={<>{selected&&editing&&<><Button variant="outline" onClick={duplicate} disabled={locked}>Duplikuj</Button><Button variant="destructive" onClick={remove} disabled={locked}>Usuń</Button></>}{!editing&&<Button variant="outline" onClick={()=>setMode('edit')}>Wróć do edycji</Button>}<Button onClick={()=>choose(reset)} disabled={locked}>Nowy szablon</Button></>}>
  <ErrorNotice error={baseError} onRetry={loadBase}/><ErrorNotice error={error}/>
  <div className={`sk-template-layout sk-template-workspace ${editing?'is-editing':'is-previewing'}`}>
   <Card hidden={!editing} className="sk-template-sidebar">
    <header className="sk-template-panel-heading"><h2>Szablony</h2><p>Wiadomości wielokrotnego użytku.</p></header>
    <input aria-label="Szukaj szablonów" placeholder="Szukaj szablonów…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="sk-template-list" aria-label="Lista szablonów">
     {baseLoading&&!templates.length?<StatePanel icon="refresh" title="Ładowanie szablonów"/>:baseError&&!templates.length?null:!templates.length?<p>Brak szablonów.</p>:!shown.length?<p>Brak pasujących szablonów.</p>:shown.map(t=><button key={t.id} type="button" disabled={locked} aria-pressed={selected?.id===t.id} onClick={()=>open(t.id)} className="sk-template-list-item"><strong>{t.name}</strong><small>wersja {t.latest_version?.version||1} · {t.latest_version?.is_html?'HTML':'tekst'}</small></button>)}
    </div><p className="sk-template-list-count">{shown.length} z {templates.length} szablonów</p>
   </Card>
   <Card hidden={editing} className="sk-template-contact">
    <header className="sk-template-panel-heading"><h2>Kontakt testowy</h2><p>Dane kontaktu użyte do renderowania zmiennych.</p></header>
    <form className="sk-template-contact-search" onSubmit={e=>{e.preventDefault();searchContacts();}}><input aria-label="Szukaj kontaktu do podglądu" placeholder="E-mail lub nazwa…" value={search} onChange={e=>setSearch(e.target.value)} disabled={locked}/><Button type="submit" disabled={locked||searchState==='loading'||!search.trim()}>{searchState==='loading'?'Szukanie…':'Szukaj'}</Button></form>
    <ErrorNotice error={searchError} onRetry={searchContacts}/>
    {searchState==='done'&&!matches.length&&<p role="status">Nie znaleziono kontaktów.</p>}
    <label>Kontakt do podglądu<select aria-label="Kontakt do podglądu" value={contact?.id||''} disabled={locked} onChange={e=>setContact([...matches,...(contact?[contact]:[])].find(c=>String(c.id)===e.target.value)||null)}><option value="">Bez kontaktu</option>{(contact&&!matches.some(c=>c.id===contact.id)?[contact,...matches]:matches).map(c=><option key={c.id} value={c.id}>{c.email}{c.name?` · ${c.name}`:''}</option>)}</select></label>
    {contact?<dl className="sk-template-contact-details"><dt>Nazwa / imię</dt><dd>{contact.name||'Brak'}</dd><dt>E-mail</dt><dd>{contact.email}</dd>{Object.entries(contact.custom_data||{}).map(([key,value])=><div key={key}><dt>{fields.find(f=>f.key===key)?.label||key}</dt><dd>{valueText(value)}</dd></div>)}</dl>:<p>Bez kontaktu pola pozostaną widoczne jako zmienne.</p>}
    <p className="sk-template-note">Podgląd nie zapisuje zmian w danych kontaktu.</p>
   </Card>
   <div className="sk-template-main">
    <div className="sk-template-mode" role="group" aria-label="Widok szablonu">{[['edit','Edytor'],['preview','Podgląd'],['test','Wysyłka testowa']].map(([value,label])=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{label}</button>)}</div>
    <Card hidden={!editing} className="sk-template-editor">
     <header className="sk-template-panel-heading"><h2>{selected?'Edytuj szablon':'Nowy szablon'}</h2><p>Zmiany tworzą nową, niezmienną wersję.</p>{activeVersion&&<span className="sk-template-version">v{activeVersion.version}</span>}</header>
     <fieldset disabled={locked||baseLoading||!!baseError}>
      <label>Nazwa szablonu<input aria-label="Nazwa szablonu" maxLength={255} value={draft.name} onChange={e=>update('name',e.target.value)} placeholder="Nazwa widoczna tylko w Sekaro"/></label>
      <label>Temat wiadomości<input aria-label="Temat wiadomości" maxLength={512} value={draft.subject} onChange={e=>update('subject',e.target.value)}/></label>
      <div className="sk-template-format" role="group" aria-label="Format wiadomości"><span>Format:</span><button type="button" aria-pressed={!draft.is_html} onClick={()=>update('is_html',false)}>Czysty tekst</button><button type="button" aria-pressed={draft.is_html} onClick={()=>update('is_html',true)}>HTML</button>{draft.is_html&&<button type="button" onClick={()=>setSourceMode(v=>!v)}>{sourceMode?'Edytor wizualny':'Kod HTML'}</button>}</div>
      <label htmlFor="template-body">Treść</label>
      {!draft.is_html||sourceMode?<textarea id="template-body" aria-label="Treść wiadomości" rows={15} value={draft.body} onChange={e=>update('body',e.target.value)} placeholder={draft.is_html?'<p>Treść HTML</p>':'Napisz wiadomość…'}/>:editing&&<div className="template-quill"><ReactQuill theme="snow" value={draft.body} onChange={(value,delta,source)=>{if(source==='user')update('body',value);}} readOnly={locked||baseLoading||!!baseError}/></div>}
     </fieldset>
     <footer className="sk-template-editor-footer"><p role="status">{busy?'Przetwarzanie…':dirty?'Niezapisane zmiany':'Brak niezapisanych zmian'}</p><Button variant="outline" onClick={()=>setMode('preview')}>Podgląd wiadomości</Button><Button variant="default" onClick={save} disabled={locked||baseLoading||!!baseError||!dirty}>{selected?'Zapisz nową wersję':'Utwórz szablon'}</Button></footer>
    </Card>
    <Card hidden={editing} className="sk-template-preview">
     <header className="sk-template-panel-heading"><h2>Podgląd wiadomości</h2><p>{draft.name||'Niezapisany szablon'}{activeVersion?` · wersja ${activeVersion.version}`:''}{dirty?' · zmiany robocze':''}</p></header>
     <Button variant="outline" onClick={renderPreview} disabled={locked||previewBusy||baseLoading||!!baseError}>{previewBusy?'Generowanie…':'Generuj podgląd'}</Button>
     <ErrorNotice error={previewError} onRetry={renderPreview}/>
     {previewBusy?<StatePanel icon="refresh" title="Generowanie podglądu"/>:preview?<>
      <p className={`sk-template-result ${preview.missing_variables?.length?'is-warning':'is-success'}`} role="status">{preview.missing_variables?.length?`Brak wartości: ${preview.missing_variables.map(token).join(', ')}`:'Wszystkie użyte zmienne mają wartości.'}</p>
      <article className="sk-template-message"><header>{contact&&<p>Kontakt: {contact.name||contact.email} · {contact.email}</p>}<h3>Temat: {preview.subject||'(brak)'}</h3></header>{preview.is_html?<SafeEmail html={preview.body}/>:<pre>{preview.body}</pre>}</article>
      <p>{preview.is_html?'HTML':'Czysty tekst'} · Treść podglądu nie jest wysyłana automatycznie.</p>
     </>:<StatePanel icon="template" title="Podgląd nie został wygenerowany" description="Wybierz kontakt i kliknij „Generuj podgląd”."/>}
    </Card>
   </div>
   <div className="sk-template-aside">
    <Card hidden={!editing} className="sk-template-history"><header className="sk-template-panel-heading"><h2>Historia wersji</h2><p>Wybór wczytuje treść do edytora. Zapis tworzy nową wersję.</p></header>{selected?.versions?.length?<ol>{selected.versions.map(v=><li key={v.id}><button type="button" aria-pressed={versionId===v.id} onClick={()=>loadVersion(v.id)} disabled={locked}><span><strong>Wersja {v.version}</strong>{v.id===latestVersion(selected)?.id&&<small>Aktualna</small>}</span><time dateTime={v.created_at}>{dateTime(v.created_at)}</time></button></li>)}</ol>:<p>Zapisane wersje szablonu pojawią się tutaj.</p>}{selected&&<p className="sk-template-note">Wcześniejsze wersje pozostają bez zmian po zapisaniu nowej.</p>}</Card>
    <Card className="sk-template-variables"><header className="sk-template-panel-heading"><h2>Zmienne</h2><p>{editing?'Wstaw pole kontaktu do tematu lub treści.':'Wartości użyte w ostatnim podglądzie.'}</p></header>{editing?<div className="sk-template-variable-list">{fields.map(f=><div key={f.key}><strong>{f.label||f.key}</strong><code>{token(f.key)}</code><div><button type="button" disabled={locked} onClick={()=>insert(f.key,'subject')} aria-label={`${f.label||f.key} — do tematu`}>do tematu</button><button type="button" disabled={locked} onClick={()=>insert(f.key,'body')} aria-label={`${f.label||f.key} — do treści`}>do treści</button></div></div>)}</div>:preview?<dl className="sk-template-values">{preview.variables?.length?preview.variables.map(key=><div key={key}><dt><code>{token(key)}</code></dt><dd>{valueText(preview.context?.[key])}</dd></div>):<p>Szablon nie zawiera zmiennych.</p>}</dl>:<p>Wygeneruj podgląd, aby sprawdzić podstawione wartości.</p>}</Card>
    <Card hidden={editing} className="sk-template-test"><header className="sk-template-panel-heading"><h2>Wyślij test</h2><p>Wysyłka przez wybraną skrzynkę SMTP.</p></header><ErrorNotice error={testError}/><form onSubmit={e=>{e.preventDefault();sendTest();}}><fieldset disabled={locked||baseLoading||!!baseError}><label>Skrzynka<select aria-label="Skrzynka do wysyłki testowej" value={testInbox} onChange={e=>setTestInbox(e.target.value)} required><option value="">Wybierz skrzynkę SMTP</option>{smtpInboxes.map(i=><option key={i.id} value={i.id} disabled={i.paused}>{i.email}{i.paused?' · wstrzymana':''}</option>)}</select></label><label>Adres testowy<input type="email" aria-label="Adres odbiorcy testowego" required value={testTo} onChange={e=>setTestTo(e.target.value)}/></label><Button type="submit" variant="default" disabled={!smtpInboxes.some(i=>!i.paused)}>{testBusy?'Wysyłanie…':'Wyślij test'}</Button></fieldset></form>{!smtpInboxes.some(i=>!i.paused)&&<p>Brak aktywnej skrzynki SMTP.</p>}<p className="sk-template-note">Kontakt do podstawienia danych: {contact?.email||'nie wybrano'}. Wiadomość trafi wyłącznie na adres testowy.</p></Card>
    <Card hidden={!editing} className="sk-template-fields"><h2>Własne pola kontaktów</h2><p>Pola z Kontaktów są dostępne jako zmienne szablonu.</p><Link to="/leads?fields=1" className="sk-btn sk-full-width">Zarządzaj polami</Link></Card>
   </div>
  </div>
 </PageFrame>;
}
