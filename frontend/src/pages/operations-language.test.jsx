import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act,within} from '@testing-library/react';
import {MemoryRouter,Link} from 'react-router-dom';
import {LanguageProvider,useLanguage} from '../context/LanguageContext';
import {operationsText} from '../context/operationsLanguage';
import Templates from './Templates';
import Notifications from './Notifications';
import {api} from '../api';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn(),refresh:vi.fn(),mode:{isDemo:true}}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),del:vi.fn(),patch:vi.fn()},apiCache:{get:vi.fn(),set:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/NotificationsContext',()=>({useNotifications:()=>({refresh:mocks.refresh})}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>mocks.mode}));
vi.mock('react-quill',()=>({default:()=>null}));
const t=(l,s,p)=>operationsText(l,s,p);
const version={id:1,version:1,subject:'Podgląd',body:'Generuj podgląd',is_html:false};
const template={id:1,name:'Szablony',latest_version:version,versions:[version]};
const config={enabled:true,notification_email:'notify@example.test',events:['lead.replied'],rate_limit_per_hour:10};
const notification={id:1,title:'Wiadomość wysłana',message:'Treść klienta',event_type:'lead.replied',created_at:new Date(Date.now()-120000).toISOString(),read_at:null};
const get=async p=>p==='/templates'?[template]:p==='/templates/1'?template:p==='/inboxes'?[{id:1,email:'sender@example.test',provider:'smtp',paused:false}]:p==='/contact-fields'?[{key:'company',label:'Nazwa szablonu'}]:p==='/settings/webhooks/events'?{events:['lead.replied','email.sent']}:p==='/notifications/config'?config:p.startsWith('/notifications?')?{items:[notification],total:1,unread:1}:[];
function Switch(){const{setLanguage}=useLanguage();return <nav>{['pl','en','de','ru'].map(l=><button key={l} onClick={()=>setLanguage(l)}>{l}</button>)}</nav>;}
function mount(element){render(<LanguageProvider><MemoryRouter><Switch/><Link to="/leads">go contacts</Link>{element}</MemoryRouter></LanguageProvider>);}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();api.get.mockImplementation(get);mocks.confirm.mockResolvedValue(false);mocks.mode.isDemo=true;});
afterEach(()=>{cleanup();localStorage.clear();});
it.each(['en','de','ru'])('preserves template draft and version after switching to %s',async lang=>{
 mount(<Templates/>);fireEvent.click(await screen.findByRole('button',{name:/Szablony wersja/}));await screen.findByDisplayValue('Generuj podgląd');
 fireEvent.change(screen.getByRole('textbox',{name:'Temat wiadomości'}),{target:{value:'Draft {{company}}'}});
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('textbox',{name:t(lang,'Temat wiadomości')}).value).toBe('Draft {{company}}');
 expect(screen.getByRole('textbox',{name:t(lang,'Nazwa szablonu')}).value).toBe('Szablony');
 expect(screen.getByRole('textbox',{name:t(lang,'Treść wiadomości')}).value).toBe('Generuj podgląd');
 expect(screen.getByRole('button',{name:new RegExp('^'+t(lang,'Wersja')+' 1 '+t(lang,'Aktualna'))})).toBeTruthy();
 expect(api.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('link',{name:'go contacts'}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith(t(lang,'Masz niezapisane zmiany szablonu. Odrzucić je i kontynuować?')));
 expect(screen.getByDisplayValue('Draft {{company}}')).toBeTruthy();
});
it('preserves rendered template values and blocks test submit after changing language',async()=>{
 mount(<Templates/>);await screen.findByRole('button',{name:/Szablony wersja/});
 fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));
 api.post.mockResolvedValue({subject:'Szablony',body:'Generuj podgląd',variables:['company'],missing_variables:[],context:{company:'Brak wartości'},is_html:false});
 fireEvent.click(screen.getByRole('button',{name:'Generuj podgląd'}));await screen.findByText('Temat: Szablony');api.post.mockClear();
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(screen.getByText('Brak wartości',{exact:true})).toBeTruthy();expect(screen.getByText('Generuj podgląd',{exact:true})).toBeTruthy();
 const input=screen.getByRole('textbox',{name:t('de','Adres odbiorcy testowego')});expect(input.closest('fieldset').disabled).toBe(true);
 fireEvent.submit(input.closest('form'));expect(api.post).not.toHaveBeenCalled();
});
it.each(['de','ru'])('keeps notification preferences and event IDs in %s',async lang=>{
 mount(<Notifications/>);await screen.findByRole('button',{name:/Wiadomość wysłana/});
 fireEvent.click(screen.getByRole('tab',{name:'Preferencje',exact:true}));
 fireEvent.change(await screen.findByRole('textbox',{name:'Adres powiadomień (opcjonalny)'}),{target:{value:'draft@example.test'}});
 fireEvent.click(screen.getByRole('checkbox',{name:'Wiadomość wysłana',exact:true}));api.get.mockClear();
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('textbox',{name:t(lang,'Adres powiadomień (opcjonalny)')}).value).toBe('draft@example.test');
 expect(screen.getByRole('checkbox',{name:t(lang,'Wiadomość wysłana'),exact:true}).checked).toBe(true);expect(api.get).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:t(lang,'Odrzuć zmiany')}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith(t(lang,'Odrzucić niezapisane preferencje powiadomień?')));
 expect(screen.getByDisplayValue('draft@example.test')).toBeTruthy();expect(api.put).not.toHaveBeenCalled();
 api.put.mockImplementation(async(p,data)=>data);
 fireEvent.click(screen.getByRole('button',{name:t(lang,'Zapisz preferencje')}));
 await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/notifications/config',{...config,notification_email:'draft@example.test',events:['lead.replied','email.sent']}));
});
it('keeps notification filter and selected content, while updating relative time and event label',async()=>{
 mount(<Notifications/>);fireEvent.click(await screen.findByRole('button',{name:/Wiadomość wysłana/}));
 fireEvent.change(screen.getByRole('searchbox',{name:'Szukaj we wczytanych powiadomieniach'}),{target:{value:'Treść klienta'}});
 api.get.mockClear();fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(screen.getByRole('searchbox',{name:t('de','Szukaj we wczytanych powiadomieniach')}).value).toBe('Treść klienta');
 expect(screen.getByRole('heading',{name:'Wiadomość wysłana'})).toBeTruthy();
 expect(screen.getByText('vor 2 Minuten',{exact:false})).toBeTruthy();expect(screen.getByText(t('de','Kontakt odpowiedział'),{exact:true})).toBeTruthy();
 expect(api.get).not.toHaveBeenCalled();
});

it.each(['de','ru'])('preserves calendar timezone, selected block and preview data in %s',async lang=>{
 const {default:ScheduleCalendar}=await import('../redesign/ScheduleCalendar');
 const now=new Date();const day=now.toISOString().slice(0,10);
 const row={type:'scheduled',slot_id:8,campaign_id:2,campaign_name:'Kampania klienta',campaign_timezone:'Europe/Warsaw',scheduled_at:`${day}T10:00:00Z`,lead_email:'client@example.test',subject:'Temat klienta'};
 const range=vi.fn(),preview=vi.fn();
 mount(<ScheduleCalendar items={[row]} filters={null} onRangeChange={range} onPreview={preview} onOpenQueue={()=>{}} busy={false}/>);
 fireEvent.change(screen.getByRole('combobox',{name:'Strefa czasowa'}),{target:{value:'Europe/Warsaw'}});
 fireEvent.click(screen.getByRole('button',{name:/Kampania klienta,.*1 wiadomość/}));
 range.mockClear();fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('combobox',{name:t(lang,'Strefa czasowa')}).value).toBe('Europe/Warsaw');
 expect(screen.getByRole('button',{name:new RegExp('Kampania klienta,.*'+(lang==='de'?'1 Nachricht':'1 сообщение'))}).getAttribute('aria-pressed')).toBe('true');
 expect(range).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/12:00 · Kampania klienta client@example.test Temat klienta/}));
 expect(preview).toHaveBeenCalledWith(row);
});
it('groups midnight messages by the selected timezone across a DST change',async()=>{
 const {groupCalendarItems,calendarMessageCount}=await import('../redesign/ScheduleCalendar');
 const rows=[{type:'scheduled',slot_id:1,campaign_id:1,scheduled_at:'2026-10-24T22:30:00Z'},{type:'scheduled',slot_id:2,campaign_id:1,scheduled_at:'2026-10-25T01:30:00Z'}];
 expect(groupCalendarItems(rows,'Europe/Warsaw').map(g=>[g.day,g.hour])).toEqual([['2026-10-25',0],['2026-10-25',2]]);
 expect(groupCalendarItems(rows,'UTC').map(g=>[g.day,g.hour])).toEqual([['2026-10-24',22],['2026-10-25',0]]);
 expect([1,2,5,21].map(n=>calendarMessageCount(n,'ru'))).toEqual(['1 сообщение','2 сообщения','5 сообщений','21 сообщение']);
});

it('preserves schedule filters and message preview when the language changes',async()=>{
 const {default:Schedule}=await import('./Schedule');
 const row={type:'scheduled',slot_id:8,campaign_id:2,campaign_name:'Kampania klienta',campaign_timezone:'Europe/Warsaw',inbox_id:4,inbox_email:'sender@example.test',scheduled_at:new Date().toISOString().slice(0,10)+'T10:00:00Z',lead_email:'client@example.test',subject:'Temat klienta',sequence_body:'Treść klienta',sequence_index:0};
 api.get.mockImplementation(async p=>p.startsWith('/schedule/scheduled?')?[row]:p.startsWith('/schedule/sent?')?[]:p==='/schedule/stats'?{total_scheduled:1}:{});
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 mount(<Schedule/>);
 const search=await screen.findByRole('searchbox',{name:'Szukaj w kolejce'});
 fireEvent.change(search,{target:{value:'client@example.test'}});
 fireEvent.change(screen.getByRole('combobox',{name:'Kampania',exact:true}),{target:{value:'2'}});
 fireEvent.change(screen.getByRole('combobox',{name:'Status wiadomości'}),{target:{value:'scheduled'}});
 // Calendar mount can extend its fetched range; wait for the preview control to become interactive.
 await waitFor(()=>expect(screen.getByRole('button',{name:/Kampania klienta client@example.test Temat klienta/}).disabled).toBe(false));
 api.get.mockClear();fireEvent.click(screen.getByRole('button',{name:'ru',exact:true}));
 expect(screen.getByRole('searchbox',{name:t('ru','Szukaj w kolejce')}).value).toBe('client@example.test');
 expect(screen.getByRole('combobox',{name:t('ru','Kampania'),exact:true}).value).toBe('2');
 expect(screen.getByRole('combobox',{name:t('ru','Status wiadomości')}).value).toBe('scheduled');
 fireEvent.click(screen.getByRole('button',{name:/Kampania klienta client@example.test Temat klienta/}));
 await screen.findByRole('heading',{name:t('ru','Podgląd wiadomości w kolejce')});
 fireEvent.change(screen.getByRole('searchbox',{name:t('ru','Szukaj wiadomości do podglądu')}),{target:{value:'client'}});
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(screen.getByRole('searchbox',{name:t('de','Szukaj wiadomości do podglądu')}).value).toBe('client');
 expect(screen.getByText('Treść klienta',{exact:true})).toBeTruthy();
 expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 window.scrollTo.mockRestore();
});
