import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {LanguageProvider,useLanguage} from '../context/LanguageContext';
import {campaignText,campaignWeekdays} from '../context/campaignLanguage';
import CampaignSettings from '../redesign/CampaignSettings';
import CampaignPreflight from '../redesign/CampaignPreflight';
import CampaignActivity from '../redesign/CampaignActivity';
import CampaignWorkspace from '../redesign/pages/CampaignWorkspace';
import {SequencesTab} from './CampaignDetail';
import {api} from '../api';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn(),refresh:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()},apiCache:{get:()=>null}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/LoadingContext',()=>({useLoading:()=>({start(){},stop(){}})}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({isProduction:false,isDemo:true})}));
vi.mock('react-quill',()=>({default:({value,onChange})=><textarea aria-label="HTML QA" value={value} onChange={e=>onChange(e.target.value)}/>}));
const campaign={id:1,name:'Kampania klienta',paused:true,inbox_ids:[2],sending_days:[0,2,4],sending_hours_start:'09:00',sending_hours_end:'17:00',timezone:'Europe/Warsaw',stop_on_reply:true};
const inboxes=[{id:2,email:'sender@example.test',paused:false,max_emails_per_day:50}];
const steps=[{id:3,position:0,subject:'Temat klienta',body:'Treść klienta',is_html:false,wait_days_after_previous:0},{id:4,position:1,subject:'Drugi temat',body:'Dalsza treść',is_html:false,wait_days_after_previous:3}];
const issue={code:'uncertain_send_attempts',severity:'error',message:'RAW PROVIDER ISSUE',details:{count:1,slot_ids:[9]}};
const report={ready:false,issues:[issue],summary:{sendable_contacts:1}};
const t=(language,text,params)=>campaignText(language,text,params);
function Switch(){const{setLanguage}=useLanguage();return <nav>{['pl','en','de','ru'].map(l=><button key={l} onClick={()=>setLanguage(l)}>{l}</button>)}</nav>;}
function mount(element,route='/campaigns/1'){return render(<LanguageProvider><MemoryRouter initialEntries={[route]}><Switch/><Routes><Route path="/campaigns/:id" element={element}/></Routes></MemoryRouter></LanguageProvider>);}
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();mocks.confirm.mockResolvedValue(false);api.patch.mockResolvedValue({});api.post.mockResolvedValue({subject:'Temat użytkownika',body:'Treść użytkownika',is_html:false});api.get.mockImplementation(async p=>p==='/campaigns/1'?campaign:p==='/inboxes'?inboxes:p.endsWith('/preflight')?report:p.endsWith('/sequences')?steps:p.endsWith('/queue')?[{slot_id:9,inbox_id:2,inbox_email:'sender@example.test',lead_email:'client@example.test',scheduled_date:'2026-09-30T10:00:00Z',sequence_index:0}]:[]);});
afterEach(()=>{cleanup();localStorage.clear();});
it.each(['de','ru'])('preserves settings drafts, API codes and stop rules in %s',async lang=>{
 mount(<CampaignSettings campaign={campaign} inboxes={inboxes} onSaved={mocks.refresh}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Nazwa kampanii'}),{target:{value:'Nowa nazwa klienta'}});
 fireEvent.change(screen.getByRole('combobox',{name:'Sekwencja spersonalizowana'}),{target:{value:'asap'}});
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('textbox',{name:t(lang,'Nazwa kampanii')}).value).toBe('Nowa nazwa klienta');
 expect(screen.getByRole('combobox',{name:t(lang,'Sekwencja spersonalizowana')}).value).toBe('asap');
 expect(screen.getByRole('checkbox',{name:campaignWeekdays(lang)[2]}).checked).toBe(true);
 expect(api.get).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:t(lang,'Zapisz zmiany')}));
 await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/campaigns/1',expect.objectContaining({name:'Nowa nazwa klienta',custom_sequence_mode:'asap',sending_days:[0,2,4],inbox_ids:[2],stop_on_reply:true,add_unsubscribe_header:true})));
 expect(api.post).not.toHaveBeenCalled();
 expect(await screen.findByText(t(lang,'Ustawienia zapisane.'))).toBeTruthy();
});
it.each(['de','ru'])('keeps pre-flight errors blocking start and cancellation blocking deletion in %s',async lang=>{
 localStorage.setItem('sekaro.language',lang);mount(<CampaignSettings campaign={campaign} inboxes={inboxes} onSaved={mocks.refresh}/>);
 fireEvent.click(screen.getByRole('button',{name:t(lang,'Zapisz i sprawdź przed startem')}));
 await screen.findByText('RAW PROVIDER ISSUE');expect(api.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText(t(lang,'Usuwanie kampanii'),{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:t(lang,'Usuń kampanię')}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith({danger:true,message:t(lang,'Usunąć tę kampanię wraz ze wszystkimi jej danymi? Tej operacji nie można cofnąć.')}));
 expect(api.del).not.toHaveBeenCalled();
});
it.each(['de','ru'])('retains dirty sequence content, cancellation and API data in %s',async lang=>{
 mount(<SequencesTab sequences={steps} campaignId={1} campaign={campaign} leads={[]} refresh={mocks.refresh}/>);
 fireEvent.click(screen.getByRole('button',{name:'Edytuj krok 1'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Temat wiadomości'}),{target:{value:'Roboczy temat'}});
 fireEvent.change(screen.getByPlaceholderText('Treść wiadomości…'),{target:{value:'Nie zgub treści'}});
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/templates'));const reads=api.get.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('textbox',{name:t(lang,'Temat wiadomości')}).value).toBe('Roboczy temat');
 expect(screen.getByPlaceholderText(t(lang,'Treść wiadomości…')).value).toBe('Nie zgub treści');expect(api.get).toHaveBeenCalledTimes(reads);
 fireEvent.click(screen.getByRole('button',{name:t(lang,'Pokaż krok {step}',{step:2})}));
 const dialog=screen.getByRole('dialog',{name:t(lang,'Odrzucić zmiany?')});fireEvent.click(within(dialog).getByRole('button',{name:t(lang,'Kontynuuj edycję')}));
 fireEvent.click(screen.getByRole('button',{name:t(lang,'Zapisz zmiany')}));
 await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/campaigns/1/sequences/3',expect.objectContaining({subject:'Roboczy temat',body:'Nie zgub treści',is_html:false,sequence_type:'standard'})));
 expect(api.post).not.toHaveBeenCalled();
});
it.each(['de','ru'])('translates an open preview without reloading or enabling DEMO test sends in %s',async lang=>{
 mount(<SequencesTab sequences={steps} campaignId={1} campaign={campaign} leads={[]} refresh={mocks.refresh}/>);
 fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));await screen.findByText('Temat użytkownika');const posts=api.post.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('dialog').textContent).toContain('Temat użytkownika');
 expect(screen.getByRole('button',{name:t(lang,'Wyślij test')}).disabled).toBe(true);expect(screen.getByRole('textbox',{name:t(lang,'Adres odbiorcy testu')}).disabled).toBe(true);
 expect(api.post).toHaveBeenCalledTimes(posts);expect(api.post.mock.calls.every(([p])=>p.endsWith('/preview'))).toBe(true);
});
it('preserves activity filters and requires the delivery warning before resetting an uncertain send',async()=>{
 mount(<CampaignActivity campaign={campaign} inboxes={inboxes}/>);await screen.findByText('RAW PROVIDER ISSUE');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'client@example.test'}});const reads=api.get.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'ru',exact:true}));expect(screen.getByRole('searchbox').value).toBe('client@example.test');expect(api.get).toHaveBeenCalledTimes(reads);
 fireEvent.click(screen.getByRole('button',{name:t('ru','Odblokuj #')+'9'}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('НЕ было доставлено')));
 expect(api.post).not.toHaveBeenCalled();
});
it('keeps unknown pre-flight issues visible and does not enable starting without a ready report',()=>{
 localStorage.setItem('sekaro.language','de');mount(<CampaignPreflight campaign={campaign} inboxes={inboxes} sequences={steps} report={{ready:false,issues:[{code:'future_blocker',message:'UNKNOWN BLOCKER',severity:'error'}]}} onStart={mocks.refresh}/>);
 expect(screen.getByText('UNKNOWN BLOCKER')).toBeTruthy();expect(screen.getByRole('button',{name:t('de','Uruchom kampanię')}).disabled).toBe(true);expect(mocks.refresh).not.toHaveBeenCalled();
});
it('does not refresh or discard an edited workspace schedule when language changes',async()=>{
 mount(<CampaignWorkspace/>);await screen.findByRole('heading',{name:'Kampania klienta'});
 fireEvent.change(screen.getByLabelText('Początek wysyłki'),{target:{value:'11:15'}});const reads=api.get.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));expect(screen.getByLabelText(t('de','Początek wysyłki')).value).toBe('11:15');expect(api.get).toHaveBeenCalledTimes(reads);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
it('localizes only sequence fallback text and never the saved message body',async()=>{
 const {sequenceExcerpt}=await import('../redesign/sequencePresentation');
 const ct=source=>campaignText('de',source);
 expect(sequenceExcerpt({body:''},ct)).toBe('Kein Nachrichtentext');
 expect(sequenceExcerpt({body:'Brak treści wiadomości',is_html:false},ct)).toBe('Brak treści wiadomości');
});
