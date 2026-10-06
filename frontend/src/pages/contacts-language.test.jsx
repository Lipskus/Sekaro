import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {LanguageProvider,useLanguage,translate} from '../context/LanguageContext';
import {ConfirmProvider} from '../context/ConfirmContext';
import Contacts from '../redesign/pages/Contacts';
import LeadDetail from './LeadDetail';
import {contactStatusLabel,dateTime} from '../redesign/ui';
import {api} from '../api';
import copy from '../i18n/contacts.json';
import common from '../i18n/workspace.json';
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({user:{id:1}})}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>vi.fn()}));
const lead={id:1,name:'Żółć — klient',email:'qa@example.test',created_at:'2026-09-30T08:00:00Z',email_verification_status:'unknown',custom_data:{score:3,extra:{preserve:true}},campaigns:[{campaign_id:2,campaign_name:'Kampania klienta',status:'unsubscribed',interest:'interested',sending_paused:true,enrolled_at:'2026-09-01T10:00:00Z'}],interactions:[{kind:'sent',direction:'outbound',at:'2026-09-02T10:00:00Z',subject:'Temat klienta',campaign_id:2},{kind:'reply_marker',direction:'inbound',at:'2026-09-03T10:00:00Z',campaign_id:2}]};
const fields=[{key:'score',label:'Ocena klienta',field_type:'number',defined:true}];
function Switch(){const {setLanguage}=useLanguage();return <nav>{['pl','en','de','ru'].map(code=><button key={code} onClick={()=>setLanguage(code)}>{code}</button>)}</nav>;}
function mount(profile=false){render(<LanguageProvider><ConfirmProvider><MemoryRouter initialEntries={[profile?'/leads/1':'/leads']}><Switch/><Routes><Route path="/leads" element={<Contacts/>}/><Route path="/leads/:id" element={<LeadDetail/>}/></Routes></MemoryRouter></ConfirmProvider></LanguageProvider>);}
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();api.get.mockImplementation(async path=>path==='/leads/1'?lead:path==='/contact-fields'?fields:path==='/leads/lists'?[{id:7,name:'Lista klienta',member_count:1}]:path==='/leads/suppression'?[{id:9,email:'blocked@example.test',reason:'unsubscribe'}]:path==='/campaigns'?[{id:2,name:'Kampania klienta',paused:false}]:path.startsWith('/leads?')?[lead]:[]);});
afterEach(()=>{cleanup();localStorage.clear();});

it('retains filters, selection and stable column preferences when switching languages',async()=>{
 mount();await screen.findByRole('checkbox',{name:'Zaznacz qa@example.test'});
 fireEvent.change(screen.getByRole('combobox',{name:copy.pl.statusesLabel}),{target:{value:'unsubscribed'}});
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/leads?status=unsubscribed'));
 await waitFor(()=>expect(screen.getByRole('checkbox',{name:'Zaznacz qa@example.test'}).disabled).toBe(false));
 fireEvent.click(screen.getByRole('checkbox',{name:'Zaznacz qa@example.test'}));
 fireEvent.click(screen.getByRole('button',{name:copy.pl.columns}));
 fireEvent.click(screen.getByRole('checkbox',{name:copy.pl.name,exact:true}));
 const pref=localStorage.getItem('sekaro.contacts.columns.1');
 const requests=api.get.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(screen.getByRole('combobox',{name:copy.de.statusesLabel}).value).toBe('unsubscribed');
 expect(screen.getByRole('checkbox',{name:'qa@example.test auswählen'}).checked).toBe(true);
 expect(screen.getByRole('checkbox',{name:copy.de.name,exact:true}).checked).toBe(false);
 expect(localStorage.getItem('sekaro.contacts.columns.1')).toBe(pref);
 expect(api.get).toHaveBeenCalledTimes(requests);
 expect(api.post).not.toHaveBeenCalled();
});

it.each(['pl','en','de','ru'])('preserves a profile draft, typed fields and message history in %s',async language=>{
 mount(true);await screen.findByRole('textbox',{name:copy.pl.name});
 fireEvent.change(screen.getByRole('textbox',{name:copy.pl.name}),{target:{value:'Niezapisany klient'}});
 fireEvent.change(screen.getByRole('spinbutton',{name:'Ocena klienta'}),{target:{value:'7'}});
 const requests=api.get.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:language,exact:true}));
 const t=copy[language];
 expect(screen.getByRole('textbox',{name:t.name}).value).toBe('Niezapisany klient');
 expect(screen.getByRole('spinbutton',{name:'Ocena klienta'}).value).toBe('7');
 expect(api.get).toHaveBeenCalledTimes(requests);
 fireEvent.click(screen.getByRole('tab',{name:t.activity}));
 fireEvent.change(screen.getByRole('combobox',{name:t.activityType}),{target:{value:'reply_marker'}});
 const timeline=document.querySelector('.sk-contact-workspace-main ol');
 expect(within(timeline).getAllByRole('listitem')).toHaveLength(1);
 expect(timeline.textContent).toContain(t.eventReply);
 fireEvent.click(screen.getByRole('tab',{name:t.messages}));
 expect(document.querySelector('.sk-contact-workspace-main').textContent).not.toContain(t.eventReply);
 expect(screen.getByText('Temat klienta')).toBeTruthy();
 fireEvent.click(screen.getByRole('tab',{name:t.summary}));
 expect(screen.getByRole('textbox',{name:t.name}).value).toBe('Niezapisany klient');
 api.patch.mockResolvedValue({...lead,name:'Niezapisany klient',custom_data:{score:7,extra:{preserve:true}}});
 fireEvent.click(screen.getByRole('button',{name:t.save}));
 await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/leads/1',{name:'Niezapisany klient',custom_data:{score:7,extra:{preserve:true}}}));
 expect(api.post).not.toHaveBeenCalled();
});

it.each(['de','ru'])('retains explicit destructive confirmation for bulk deletion in %s',async language=>{
 localStorage.setItem('sekaro.language',language);mount();
 const t=copy[language],label=translate(language,'contacts.selectContact',{email:lead.email});
 await screen.findByRole('checkbox',{name:label});
 fireEvent.click(screen.getByRole('checkbox',{name:label}));
 fireEvent.click(screen.getByRole('button',{name:t.delete,exact:true}));
 const dialog=await screen.findByRole('dialog',{name:common[language].confirmDelete});
 expect(within(dialog).getByText(translate(language,'contacts.deleteWarning',{count:1}))).toBeTruthy();
 expect(within(dialog).getByRole('button',{name:common[language].delete}).className).toContain('sk-btn-danger');
 fireEvent.click(within(dialog).getByRole('button',{name:common[language].cancel}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(api.post).not.toHaveBeenCalled();expect(api.del).not.toHaveBeenCalled();
});

it('preserves the active-campaign warning and suppression warning in Russian',async()=>{
 localStorage.setItem('sekaro.language','ru');mount();const t=copy.ru;
 const checkbox=await screen.findByRole('checkbox',{name:'Выбрать qa@example.test'});fireEvent.click(checkbox);
 fireEvent.click(screen.getByRole('button',{name:t.enroll}));
 const assign=await screen.findByRole('dialog',{name:t.enrollTitle});
 fireEvent.change(within(assign).getByRole('combobox',{name:t.campaign}),{target:{value:'2'}});
 fireEvent.click(within(assign).getByRole('button',{name:t.enroll}));
 const warning=await screen.findByRole('dialog',{name:common.ru.confirmOperation});
 expect(within(warning).getByText(t.activeWarning)).toBeTruthy();
 fireEvent.click(within(warning).getByRole('button',{name:common.ru.cancel}));
 await waitFor(()=>expect(screen.getAllByRole('dialog')).toHaveLength(1));
 fireEvent.click(within(assign).getByRole('button',{name:t.cancel}));
 fireEvent.click(screen.getByRole('button',{name:t.suppression}));
 const suppression=await screen.findByRole('dialog',{name:t.suppressionTitle});
 expect(within(suppression).getByText(t.unsubscribe)).toBeTruthy();
 fireEvent.click(within(suppression).getByRole('button',{name:t.removeBlock}));
 const confirm=await screen.findByRole('dialog',{name:common.ru.confirmDelete});
 expect(within(confirm).getByText(translate('ru','contacts.removeBlockWarning',{email:'blocked@example.test'}))).toBeTruthy();
 fireEvent.click(within(confirm).getByRole('button',{name:common.ru.cancel}));
 expect(api.post).not.toHaveBeenCalled();expect(api.del).not.toHaveBeenCalled();
});

it('keeps unknown status codes visible and formats dates in the requested locale',()=>{
 const t=(key)=>translate('de',key);
 expect(contactStatusLabel('future_status',t)).toBe('future_status');
 expect(contactStatusLabel('unsubscribed',t)).toBe('Abgemeldet');
 const date='2026-09-30T08:00:00Z';
 expect(dateTime(date,{year:'numeric'},'de')).toBe(new Date(date).toLocaleString('de',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',year:'numeric'}));
});
