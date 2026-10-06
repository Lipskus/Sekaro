import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {LanguageProvider,useLanguage,translate} from '../context/LanguageContext';
import Inbox from '../redesign/pages/Inbox';
import Campaigns from './Campaigns';
import AddCampaign from './AddCampaign';
import SafeEmail from '../redesign/SafeEmail';
import {api} from '../api';
import copy from '../i18n/outreach.json';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()},apiCache:{get:()=>null}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
function Switch(){const {setLanguage}=useLanguage();return <nav>{['pl','en','de','ru'].map(code=><button key={code} onClick={()=>setLanguage(code)}>{code}</button>)}</nav>;}
function mount(element){return render(<LanguageProvider><MemoryRouter><Switch/><Routes><Route path="/" element={element}/><Route path="/campaigns/:id" element={<h1>Saved draft</h1>}/></Routes></MemoryRouter></LanguageProvider>);}
const row={inbox_id:1,thread_id:'thread-1',lead_id:1,lead_email:'qa@example.test',lead_name:'Klient QA',subject:'Temat klienta'};
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();mocks.confirm.mockResolvedValue(false);api.post.mockResolvedValue({id:4});api.get.mockImplementation(async path=>{
 if(path.startsWith('/ui/unibox?'))return{items:[row],total:1,counts:{all:1,unread:1}};
 if(path==='/inboxes')return[{id:1,email:'sender@example.test',paused:false}];
 if(path.startsWith('/unibox/threads/'))return{messages:[],subject:'Temat klienta',inbox_account:'sender@example.test'};
 if(path==='/leads/1')return{id:1,email:row.lead_email,name:row.lead_name,interactions:[]};
 if(path==='/campaigns')return[{id:1,name:'Kampania klienta',paused:true}];
 if(path==='/settings/scheduling-strategy')return{scheduling_strategy:'priority'};
 return[];
});});
afterEach(()=>{cleanup();localStorage.clear();});
async function selectThread(){fireEvent.click(await screen.findByRole('button',{name:/Klient QA/}));await waitFor(()=>expect(screen.getByRole('button',{name:copy.pl.addSuppression}).disabled).toBe(false));await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(1));}
it.each(['de','ru'])('preserves Inbox drafts and selection without requests on language switch to %s',async language=>{
 mount(<Inbox/>);await selectThread();
 fireEvent.change(screen.getByRole('textbox',{name:copy.pl.replyBody}),{target:{value:'Niezapisana odpowiedź'}});
 const requests=api.get.mock.calls.length,mutations=api.post.mock.calls.length;
 fireEvent.click(screen.getByRole('button',{name:language,exact:true}));
 expect(screen.getByRole('textbox',{name:copy[language].replyBody}).value).toBe('Niezapisana odpowiedź');
 expect(api.get).toHaveBeenCalledTimes(requests);expect(api.post).toHaveBeenCalledTimes(mutations);
 fireEvent.click(screen.getByRole('button',{name:copy[language].send,exact:true}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith(translate(language,'outreach.sendWarning',{recipient:row.lead_email,mailbox:'sender@example.test'})));
 expect(screen.getByRole('textbox',{name:copy[language].replyBody}).value).toBe('Niezapisana odpowiedź');
 expect(api.post.mock.calls.some(([p])=>p==='/ui/reply')).toBe(false);
});
it.each(['suppression','paused'])('keeps %s send blocking after language change',async reason=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation(p=>p==='/leads/suppression'&&reason==='suppression'?Promise.resolve([{email:row.lead_email}]):p==='/inboxes'&&reason==='paused'?Promise.resolve([{id:1,email:'sender@example.test',paused:true}]):original(p));
 mount(<Inbox/>);fireEvent.click(await screen.findByRole('button',{name:/Klient QA/}));
 await screen.findByText(copy.pl[reason==='suppression'?'suppressedHint':'pausedHint']);
 fireEvent.change(screen.getByRole('textbox',{name:copy.pl.replyBody}),{target:{value:'Nie wysyłaj'}});
 fireEvent.click(screen.getByRole('button',{name:'ru',exact:true}));
 expect(screen.getByRole('button',{name:copy.ru.send,exact:true}).disabled).toBe(true);
 expect(screen.getByText(copy.ru[reason==='suppression'?'suppressedHint':'pausedHint'])).toBeTruthy();
 expect(mocks.confirm).not.toHaveBeenCalled();expect(api.post.mock.calls.some(([p])=>p==='/ui/reply')).toBe(false);
});
it.each(['de','ru'])('preserves campaign filters and selection and explicit deletion in %s',async language=>{
 mount(<Campaigns/>);await screen.findByRole('checkbox',{name:translate('pl','outreach.selectCampaign',{name:'Kampania klienta'})});
 fireEvent.change(screen.getByRole('searchbox',{name:copy.pl.searchCampaigns}),{target:{value:'klienta'}});
 fireEvent.click(screen.getByRole('checkbox',{name:translate('pl','outreach.selectCampaign',{name:'Kampania klienta'})}));
 const requests=api.get.mock.calls.length;fireEvent.click(screen.getByRole('button',{name:language,exact:true}));
 expect(screen.getByRole('searchbox',{name:copy[language].searchCampaigns}).value).toBe('klienta');
 expect(screen.getByRole('checkbox',{name:translate(language,'outreach.selectCampaign',{name:'Kampania klienta'})}).checked).toBe(true);
 expect(api.get).toHaveBeenCalledTimes(requests);
 fireEvent.click(screen.getByRole('button',{name:copy[language].deleteSelected}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith({message:translate(language,'outreach.bulkDelete',{count:1}),danger:true}));
 expect(api.del).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
it.each(['de','ru'])('retains the campaign name and creates only a paused draft in %s',async language=>{
 mount(<AddCampaign/>);fireEvent.change(screen.getByRole('textbox',{name:copy.pl.nameRequired+' '+copy.pl.nameHelp}),{target:{value:'  Moja kampania  '}});
 fireEvent.click(screen.getByRole('button',{name:language,exact:true}));
 expect(screen.getByRole('textbox',{name:copy[language].nameRequired+' '+copy[language].nameHelp}).value).toBe('  Moja kampania  ');
 fireEvent.click(screen.getByRole('button',{name:copy[language].next}));await screen.findByText('Saved draft');
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/campaigns',expect.objectContaining({name:'Moja kampania',inbox_ids:[],paused:true,stop_on_reply:true,track_opens:false,track_clicks:false,add_unsubscribe_header:true}));
});
it('keeps remote images and unsafe markup blocked when translating email placeholders',()=>{
 const {container}=mount(<SafeEmail html={'<img src="https://tracker.invalid/pixel"><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.test/o/token">tracking</a>'}/>);
 const root=container.querySelector('.sk-safe-email').shadowRoot;
 for(const language of ['pl','de','ru']){fireEvent.click(screen.getByRole('button',{name:language,exact:true}));expect(root.textContent).toContain(copy[language].blockedImage);expect(root.querySelector('img,script,iframe,a[href]')).toBeNull();}
});
it('provides matching nonempty dictionaries and interpolation parameters',()=>{
 const keys=Object.keys(copy.pl).sort();for(const language of ['en','de','ru']){expect(Object.keys(copy[language]).sort()).toEqual(keys);for(const key of keys){expect(copy[language][key].trim()).not.toBe('');expect((copy[language][key].match(/\{\w+\}/g)||[]).sort()).toEqual((copy.pl[key].match(/\{\w+\}/g)||[]).sort());}}
});
