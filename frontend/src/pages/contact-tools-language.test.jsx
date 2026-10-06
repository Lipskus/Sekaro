import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LanguageProvider,useLanguage} from '../context/LanguageContext';
import {operationsText} from '../context/operationsLanguage';
import Leads from './Leads';
import {api} from '../api';
const mocks=vi.hoisted(()=>({notify:vi.fn(),confirm:vi.fn(),loading:{start:vi.fn(),stop:vi.fn()}}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),del:vi.fn()}}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/LoadingContext',()=>({useLoading:()=>mocks.loading}));
function Switch(){const {setLanguage}=useLanguage();return <>{['en','de','ru'].map(l=><button key={l} onClick={()=>setLanguage(l)}>{l}</button>)}</>}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();mocks.confirm.mockResolvedValue(false);api.get.mockImplementation(async p=>p.startsWith('/leads?')?[{id:1,email:'old@example.test',name:'Customer name',email_verification_status:'invalid',campaigns:[]}]:[]);});
afterEach(()=>{cleanup();localStorage.clear();});
it.each(['en','de','ru'])('retains recovery draft and selection when switching to %s; cancelled delete cannot mutate',async lang=>{
 render(<LanguageProvider><MemoryRouter initialEntries={['/contacts-tools?tab=bounced']}><Switch/><Leads/></MemoryRouter></LanguageProvider>);
 const input=await screen.findByRole('textbox',{name:'Nowy e-mail: old@example.test'});
 fireEvent.change(input,{target:{value:'corrected@example.test'}});
 fireEvent.click(screen.getByRole('checkbox',{name:'Select old@example.test'}));
 api.get.mockClear();fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('heading',{name:operationsText(lang,'Narzędzia kontaktów')})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:operationsText(lang,'Nowy e-mail')+': old@example.test'}).value).toBe('corrected@example.test');
 expect(screen.getByRole('checkbox',{name:operationsText(lang,'Select {p0}',{p0:'old@example.test'})}).checked).toBe(true);
 expect(api.get).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:operationsText(lang,'Usuń'),exact:true}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalled());
 expect(mocks.confirm.mock.calls[0][0]).toEqual(expect.objectContaining({danger:true}));
 expect(api.post).not.toHaveBeenCalled();expect(api.del).not.toHaveBeenCalled();
});
it('uses the shared dialog for suppression; Escape restores focus and scrolling',async()=>{
 render(<LanguageProvider><MemoryRouter initialEntries={['/contacts-tools?tab=bounced']}><Leads/></MemoryRouter></LanguageProvider>);
 await screen.findByRole('textbox',{name:'Nowy e-mail: old@example.test'});
 const trigger=screen.getByRole('button',{name:'Lista wykluczeń'});trigger.focus();fireEvent.click(trigger);
 const dialog=await screen.findByRole('dialog');
 expect(dialog.contains(document.activeElement)).toBe(true);expect(document.body.style.overflow).toBe('hidden');
 fireEvent.keyDown(document,{key:'Escape'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).not.toBe('hidden');
});
it('does not present a failed contact read as an empty successful result; retry recovers',async()=>{
 api.get.mockImplementation(async p=>{if(p.startsWith('/leads?'))throw Error('offline');return [];});
 render(<LanguageProvider><MemoryRouter initialEntries={['/contacts-tools?tab=bounced']}><Leads/></MemoryRouter></LanguageProvider>);
 await screen.findByRole('alert');expect(screen.queryByText('Brak kontaktów pasujących do tego widoku.')).toBeNull();
 api.get.mockResolvedValue([]);fireEvent.click(screen.getByRole('button',{name:'Spróbuj ponownie'}));
 await screen.findByText('Brak kontaktów pasujących do tego widoku.');expect(screen.queryByRole('alert')).toBeNull();
});
