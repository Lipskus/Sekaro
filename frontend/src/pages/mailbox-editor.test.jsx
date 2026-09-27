import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Inboxes from './Inboxes';
import {api} from '../api';
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),patch:vi.fn()},apiCache:{get:()=>undefined}}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({mode:'production',isProduction:true})}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>vi.fn()}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>vi.fn()}));
const inbox={id:1,email:'sender@example.test',display_name:'Nadawca',provider:'smtp',max_emails_per_day:100,max_emails_per_hour:10,wait_minutes_between:5};
const archive={mode:'keep',days:30,imap_configured:true,count:0,bytes:0,messages:[]};
const smtp={smtp_host:'smtp.example.test',smtp_port:587,smtp_username:'sender',has_smtp_password:true,imap_host:'imap.example.test',imap_port:993};
async function mount(){render(<MemoryRouter><Inboxes/></MemoryRouter>);fireEvent.click(await screen.findByRole('button',{name:'sender@example.test Nadawca'}));fireEvent.click(screen.getByRole('button',{name:'Edytuj',exact:true}));}
async function connection(){fireEvent.click(screen.getByRole('button',{name:'SMTP / IMAP',exact:true}));return await screen.findByRole('textbox',{name:'Host SMTP',exact:true});}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({json:async()=>({})}));api.get.mockImplementation(p=>Promise.resolve(p==='/inboxes'?[inbox]:p.includes('/archive')?archive:smtp));api.put.mockResolvedValue(smtp);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('preserves SMTP drafts across sections and cancellation, and saves only once',async()=>{
 await mount();const host=await connection();fireEvent.change(host,{target:{value:'new.example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Limity',exact:true}));fireEvent.click(screen.getByRole('button',{name:'SMTP / IMAP',exact:true}));expect(host.value).toBe('new.example.test');
 fireEvent.click(screen.getByRole('button',{name:'Anuluj edycję'}));expect(screen.getByRole('dialog',{name:'Odrzucić zmiany skrzynki?'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Kontynuuj edycję'}));
 expect(screen.getByRole('button',{name:'Testuj połączenie'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Zapisz SMTP / IMAP'}));await screen.findByText('Ustawienia SMTP / IMAP zapisane');expect(api.put).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Anuluj edycję'}));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('Edytuj skrzynkę')).toBeNull();
});
it('never presents blank credentials as successfully loaded after a failed read',async()=>{
 let fail=true;api.get.mockImplementation(p=>p==='/inboxes'?Promise.resolve([inbox]):p.includes('/archive')?Promise.resolve(archive):fail?Promise.reject(Error('offline')):Promise.resolve(smtp));
 await mount();fireEvent.click(screen.getByRole('button',{name:'SMTP / IMAP',exact:true}));await screen.findByRole('alert');expect(screen.queryByRole('textbox',{name:'Host SMTP',exact:true})).toBeNull();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Spróbuj ponownie'}));expect((await screen.findByRole('textbox',{name:'Host SMTP',exact:true})).value).toBe('smtp.example.test');expect(api.patch).not.toHaveBeenCalled();
});
it('keeps general changes dirty after a failed save',async()=>{
 api.patch.mockRejectedValue(Error('Zapis nie powiódł się'));await mount();fireEvent.change(screen.getByRole('textbox',{name:'Nazwa nadawcy'}),{target:{value:'Roboczy'}});
 fireEvent.click(screen.getByRole('button',{name:'Zapisz ustawienia'}));await screen.findByText('Zapis nie powiódł się');fireEvent.click(screen.getByRole('button',{name:'Anuluj edycję'}));expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Kontynuuj edycję'}));expect(screen.getByRole('textbox',{name:'Nazwa nadawcy'}).value).toBe('Roboczy');
});
it('tests saved credentials without overwriting a general draft',async()=>{
 api.post.mockResolvedValue({ok:true,smtp:{},imap:{}});await mount();fireEvent.change(screen.getByRole('textbox',{name:'Nazwa nadawcy'}),{target:{value:'Roboczy'}});await connection();fireEvent.click(screen.getByRole('button',{name:'Testuj połączenie'}));await screen.findByText(/Test połączenia zakończony powodzeniem/);fireEvent.click(screen.getByRole('button',{name:'Nadawca',exact:true}));expect(screen.getByRole('textbox',{name:'Nazwa nadawcy'}).value).toBe('Roboczy');expect(screen.getByRole('button',{name:'Zapisz ustawienia'}).disabled).toBe(false);
});
it('retains SMTP changes and blocks closing while a credential save is pending or fails',async()=>{
 let rejectSave;api.put.mockImplementation(()=>new Promise((resolve,reject)=>{rejectSave=reject}));await mount();const host=await connection();fireEvent.change(host,{target:{value:'pending.example.test'}});
 const save=screen.getByRole('button',{name:'Zapisz SMTP / IMAP'});fireEvent.click(save);fireEvent.click(save);expect(api.put).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Anuluj edycję'}).disabled).toBe(true);
 rejectSave(Error('Błąd zapisu SMTP'));await screen.findByRole('alert');expect(host.value).toBe('pending.example.test');fireEvent.click(screen.getByRole('button',{name:'Anuluj edycję'}));expect(screen.getByRole('dialog')).toBeTruthy();
});
