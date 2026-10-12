import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Inboxes from './Inboxes';
import {api} from '../api';
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),patch:vi.fn(),del:vi.fn()},apiCache:{get:()=>undefined}}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({mode:'production',isProduction:true})}));
const confirmations=vi.hoisted(()=>({ask:vi.fn()}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>confirmations.ask}));
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

it.each(['en','de','ru'])('keeps SMTP and sender drafts across a switch to %s',async language=>{
 const {LanguageProvider,useLanguage}=await import('../context/LanguageContext');
 const {operationsText:t}=await import('../context/operationsLanguage');
 function Switch(){const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage(language)}>language</button>;}
 localStorage.clear();render(<LanguageProvider><MemoryRouter><Switch/><Inboxes/></MemoryRouter></LanguageProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'sender@example.test Nadawca'}));fireEvent.click(screen.getByRole('button',{name:'Edytuj',exact:true}));
 fireEvent.change(screen.getByRole('textbox',{name:'Nazwa nadawcy'}),{target:{value:'Nadawca klienta'}});
 const host=await connection();fireEvent.change(host,{target:{value:'draft.example.test'}});api.get.mockClear();
 fireEvent.click(screen.getByRole('button',{name:'language'}));
 expect(screen.getByRole('textbox',{name:t(language,'Host SMTP'),exact:true}).value).toBe('draft.example.test');
 expect(screen.getByRole('button',{name:t(language,'Testuj połączenie')}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:t(language,'Nadawca'),exact:true}));
 expect(screen.getByRole('textbox',{name:t(language,'Nazwa nadawcy')}).value).toBe('Nadawca klienta');
 expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();localStorage.clear();
});

it.each(['de','ru'])('keeps the verified DNS domain when switching to %s',async language=>{
 const {LanguageProvider,useLanguage}=await import('../context/LanguageContext');
 const {operationsText:t}=await import('../context/operationsLanguage');
 function Switch(){const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage(language)}>language</button>;}
 localStorage.clear();api.get.mockImplementation(p=>Promise.resolve(p.includes('verify-tracking-domain')?{ok:true}:p==='/inboxes'?[inbox]:p.includes('/archive')?archive:smtp));api.post.mockResolvedValue({});
 render(<LanguageProvider><MemoryRouter><Switch/><Inboxes/></MemoryRouter></LanguageProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'sender@example.test Nadawca'}));fireEvent.click(screen.getByRole('button',{name:'Edytuj',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'Śledzenie',exact:true}));
 fireEvent.click(screen.getByRole('radio',{name:'Konfiguracja DNS',exact:true}));
 fireEvent.change(screen.getByPlaceholderText('mail.twojadomena.pl'),{target:{value:'track.example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Sprawdź',exact:true}));await screen.findByText('✓ Domena jest osiągalna i wskazuje na ten serwer');
 api.get.mockClear();api.post.mockClear();fireEvent.click(screen.getByRole('button',{name:'language'}));
 expect(screen.getByPlaceholderText('mail.twojadomena.pl').value).toBe('track.example.test');
 expect(screen.getByRole('radio',{name:t(language,'Konfiguracja DNS'),exact:true}).checked).toBe(true);
 expect(screen.getByText(t(language,'✓ Domena jest osiągalna i wskazuje na ten serwer'))).toBeTruthy();
 expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();localStorage.clear();
});

it.each(['de','ru'])('does not delete a mailbox when the %s confirmation is cancelled',async language=>{
 const {LanguageProvider}=await import('../context/LanguageContext');const {operationsText:t}=await import('../context/operationsLanguage');
 localStorage.setItem('sekaro.language',language);confirmations.ask.mockResolvedValue(false);
 render(<LanguageProvider><MemoryRouter><Inboxes/></MemoryRouter></LanguageProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'sender@example.test Nadawca'}));
 fireEvent.click(screen.getByRole('button',{name:t(language,'Usuń skrzynkę'),exact:true}));
 await waitFor(()=>expect(confirmations.ask).toHaveBeenCalledWith({message:t(language,'Usuń skrzynkę "{email}"?',{email:inbox.email}),danger:true}));
 expect(api.del).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();localStorage.clear();
});

it('updates an in-flight DNS verification message without restarting the request',async()=>{
 const {LanguageProvider,useLanguage}=await import('../context/LanguageContext');const {operationsText:t}=await import('../context/operationsLanguage');
 function Switch(){const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage('de')}>language</button>;}
 let resolve;localStorage.clear();api.get.mockImplementation(p=>p.includes('verify-tracking-domain')?new Promise(r=>{resolve=r}):Promise.resolve(p==='/inboxes'?[inbox]:p.includes('/archive')?archive:smtp));api.post.mockResolvedValue({});
 render(<LanguageProvider><MemoryRouter><Switch/><Inboxes/></MemoryRouter></LanguageProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'sender@example.test Nadawca'}));fireEvent.click(screen.getByRole('button',{name:'Edytuj',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Śledzenie',exact:true}));fireEvent.click(screen.getByRole('radio',{name:'Konfiguracja DNS',exact:true}));fireEvent.change(screen.getByPlaceholderText('mail.twojadomena.pl'),{target:{value:'track.example.test'}});fireEvent.click(screen.getByRole('button',{name:'Sprawdź',exact:true}));
 await screen.findByText('Wystawianie certyfikatu SSL…');api.get.mockClear();api.post.mockClear();fireEvent.click(screen.getByRole('button',{name:'language'}));expect(screen.getByText(t('de','Wystawianie certyfikatu SSL…'))).toBeTruthy();expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 resolve({ok:true});await screen.findByText(t('de','✓ Domena jest osiągalna i wskazuje na ten serwer'));localStorage.clear();
});

it('does not retry blocked deletion using the unsupported reassign parameter',async()=>{
 confirmations.ask.mockResolvedValue(true);api.del.mockRejectedValueOnce(Error('Inbox is assigned to one or more campaigns'));
 render(<MemoryRouter><Inboxes/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'sender@example.test Nadawca'}));
 fireEvent.click(screen.getByRole('button',{name:'Usuń skrzynkę',exact:true}));
 await waitFor(()=>expect(api.del).toHaveBeenCalledTimes(1));
 expect(api.del).toHaveBeenCalledWith('/inboxes/1');expect(confirmations.ask).toHaveBeenCalledTimes(1);
});
