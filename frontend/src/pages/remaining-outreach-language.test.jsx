import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LanguageProvider,useLanguage} from '../context/LanguageContext';
import {campaignText} from '../context/campaignLanguage';
import {LeadsTab,CampaignAnalyticsTab} from './CampaignDetail';
import Analytics from './Analytics';
import {analyticsCsv,campaignDailyRows} from '../redesign/campaignAnalytics';
import {recipientsCsv} from '../redesign/campaignRecipients';
import {api} from '../api';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn(),upload:vi.fn()},apiCache:{get:()=>null}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('react-quill',()=>({default:()=>null}));
vi.mock('recharts',()=>({ResponsiveContainer:({children})=><div>{children}</div>,AreaChart:({children})=><div>{children}</div>,Area:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,CartesianGrid:()=>null}));
const leads=[{lead_id:1,email:'person@example.test',name:'Kampanie',status:'unsubscribed',custom_data:{company:'Otwarcia'},opened:true},{lead_id:2,email:'other@example.test',name:'Inny',status:'active',custom_data:{company:'Inne'}}];
const t=(lang,s,params)=>campaignText(lang,s,params);
function Switch(){const{setLanguage}=useLanguage();return <nav>{['pl','en','de','ru'].map(l=><button key={l} onClick={()=>setLanguage(l)}>{l}</button>)}</nav>;}
function mount(element){render(<LanguageProvider><MemoryRouter><Switch/>{element}</MemoryRouter></LanguageProvider>);}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();mocks.confirm.mockResolvedValue(false);api.get.mockImplementation(async p=>p==='/campaigns'?[{id:1,name:'Kampanie',stats:{}}]:p.includes('/daily?')?[{campaign_id:1,date:new Date().toLocaleDateString('sv-SE'),sent:1}]:p==='/settings/time-offset'?{time_offset_days:0}:p==='/settings/email-verification'?{enabled:false}:[]);});
afterEach(()=>{cleanup();localStorage.clear();});
it.each(['en','de','ru'])('keeps recipient filters and add draft on language change to %s',async lang=>{
 mount(<LeadsTab leads={leads} campaignId={1} refresh={()=>{}}/>);
 fireEvent.change(screen.getByRole('searchbox',{name:'Szukaj odbiorców'}),{target:{value:'person@'}});
 fireEvent.click(screen.getByRole('button',{name:'Filtry',exact:true}));
 fireEvent.change(screen.getByLabelText('Status'),{target:{value:'unsubscribed'}});
 fireEvent.click(screen.getByRole('button',{name:'Dodaj kontakty',exact:true}));
 fireEvent.change(screen.getByLabelText('E-mail kontaktu'),{target:{value:'draft@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByLabelText(t(lang,'E-mail kontaktu')).value).toBe('draft@example.test');
 expect(screen.getByRole('searchbox',{name:t(lang,'Szukaj odbiorców')}).value).toBe('person@');
 expect(screen.getByLabelText(t(lang,'Status')).value).toBe('unsubscribed');
 expect(screen.getByText('person@example.test')).toBeTruthy();expect(screen.queryByText('other@example.test')).toBeNull();
 expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
it('cancels recipient removal with an explicit destructive confirmation in German',async()=>{
 mount(<LeadsTab leads={leads.slice(0,1)} campaignId={1} refresh={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:t('de','Usuń z kampanii')}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith({danger:true,message:t('de','Usunąć {email} z tej kampanii?',{email:leads[0].email})}));
 expect(api.del).not.toHaveBeenCalled();expect(screen.getByText('person@example.test')).toBeTruthy();
});
it('keeps the custom analytics dates and validation across languages without refetching',async()=>{
 mount(<CampaignAnalyticsTab campaignId={1}/>);await screen.findByText('Wyniki według dnia');
 fireEvent.click(screen.getByRole('button',{name:'Własny zakres'}));
 fireEvent.change(screen.getByLabelText('Od'),{target:{value:'2099-01-01'}});
 expect(screen.getByRole('alert')).toBeTruthy();api.get.mockClear();
 fireEvent.click(screen.getByRole('button',{name:'ru',exact:true}));
 expect(screen.getByLabelText(t('ru','Od')).value).toBe('2099-01-01');
 expect(screen.getByRole('alert').textContent).toContain(t('ru','Wybierz poprawny zakres dat: data końcowa nie może poprzedzać początkowej.'));
 expect(api.get).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:t('ru','Eksport CSV')}).disabled).toBe(true);
});
it('keeps selected global campaigns and chart visibility without translating campaign names',async()=>{
 mount(<Analytics/>);await screen.findByRole('option',{name:'Kampanie'});
 fireEvent.change(screen.getByLabelText('Kampanie'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Dodaj',exact:true}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Eksport CSV'}).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Otwarcia',exact:true}));api.get.mockClear();
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(screen.getByRole('button',{name:t('de','Usuń filtr kampanii {name}',{name:'Kampanie'})})).toBeTruthy();
 expect(screen.getByRole('button',{name:t('de','Otwarcia'),exact:true}).getAttribute('aria-pressed')).toBe('true');
 expect(api.get).not.toHaveBeenCalled();
});
it('localizes only analytics export headers and retains recipient API fields and data',()=>{
 const rows=campaignDailyRows([{date:'2026-09-01',sent:3,total_replies:2}],'2026-09-01','2026-09-01');
 const pl=analyticsCsv(rows),de=analyticsCsv(rows,s=>t('de',s));
 expect(de.split('\r\n')[0]).toContain('Antworten');expect(de.split('\r\n').slice(1)).toEqual(pl.split('\r\n').slice(1));
 const csv=recipientsCsv(leads);expect(csv).toContain('"email","name","status"');expect(csv).toContain('"Kampanie","unsubscribed"');expect(csv).toContain('"Otwarcia"');
});
