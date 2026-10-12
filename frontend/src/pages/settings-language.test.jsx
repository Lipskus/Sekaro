import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LanguageProvider,useLanguage} from '../context/LanguageContext';
import {operationsText} from '../context/operationsLanguage';
import Settings from './Settings';
import Verification from '../components/EmailVerificationSettings';
import {api} from '../api';
const mocks=vi.hoisted(()=>({user:{id:1,role:'admin'},notify:vi.fn(),confirm:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),del:vi.fn(),uploadMultipart:vi.fn()},apiCache:{get:()=>undefined}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({isProduction:true})}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/DarkModeContext',()=>({useDarkMode:()=>({themePreference:'light',setThemePreference:vi.fn()})}));
const t=(l,s)=>operationsText(l,s);
function Switch(){const {setLanguage}=useLanguage();return <>{['pl','de','ru'].map(l=><button key={l} onClick={()=>setLanguage(l)}>{l}</button>)}</>;}
function mount(Component){return render(<LanguageProvider><MemoryRouter><Switch/><Component/></MemoryRouter></LanguageProvider>);}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();window.history.replaceState(null,'','/#webhooks');mocks.confirm.mockResolvedValue(false);api.get.mockImplementation(async p=>{
 if(p==='/settings/webhooks/events')return {events:['email.sent']};
 if(p==='/settings/webhooks'||p==='/auth/api-keys')return [];
 if(p==='/settings/ai')return {features:[]};
 if(p==='/settings/ai/providers')return {providers:[]};
 if(p==='/settings/known-ips')return {known_ips:[]};
 if(p==='/settings/email-verification')return {provider:'custom',providers:['custom'],custom_url:'https://example.test/?email={email}',custom_method:'POST',custom_field_path:'data.status',custom_valid_values:['deliverable'],custom_invalid_values:['blocked']};
 return {};
});});
afterEach(()=>{cleanup();localStorage.clear();window.history.replaceState(null,'','/');});
it.each(['de','ru'])('keeps webhook draft, event codes and selected category on switching to %s',async lang=>{
 mount(Settings);const url=await screen.findByPlaceholderText('https://twoj-endpoint.example.com/hook');
 fireEvent.change(url,{target:{value:'https://example.test/customer-hook'}});
 fireEvent.change(screen.getByPlaceholderText('Sekret Bearer (opcjonalny)'),{target:{value:'customer-secret'}});
 api.get.mockClear();fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(url.value).toBe('https://example.test/customer-hook');expect(screen.getByPlaceholderText(t(lang,'Sekret Bearer (opcjonalny)')).value).toBe('customer-secret');
 const nav=within(screen.getByRole('navigation',{name:t(lang,'Sekcje ustawień')}));
 expect(nav.getByRole('button',{name:t(lang,'Webhooki'),exact:true}).getAttribute('aria-current')).toBe('page');
 expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:t(lang,'Kopia i przywracanie')}});
 expect(nav.getByRole('button',{name:t(lang,'Kopia i przywracanie'),exact:true})).toBeTruthy();
 expect(nav.queryByRole('button',{name:t(lang,'Ogólne'),exact:true})).toBeNull();
});
it.each(['de','ru'])('keeps custom verification values and blocks untested enabling in %s',async lang=>{
 mount(()=> <Verification initialExpanded/>);const url=await screen.findByPlaceholderText('https://api.example.com/verify?email={email}');
 fireEvent.change(url,{target:{value:'https://custom.test/v?email={email}'}});api.get.mockClear();
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(url.value).toBe('https://custom.test/v?email={email}');expect(screen.getByDisplayValue('POST')).toBeTruthy();expect(screen.getByDisplayValue('deliverable')).toBeTruthy();expect(screen.getByDisplayValue('blocked')).toBeTruthy();
 expect(api.get).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox',{name:t(lang,'Włącz')}));
 await waitFor(()=>expect(mocks.notify).toHaveBeenCalled());expect(api.post).not.toHaveBeenCalled();expect(screen.getByRole('checkbox').checked).toBe(false);
});

it('preserves backup draft on a language switch and localizes its validation',async()=>{
 window.history.replaceState(null,'','/#backup-restore');mount(Settings);
 fireEvent.click(await screen.findByRole('checkbox',{name:'Szyfruj kopie hasłem (zalecane)'}));
 const password=screen.getByLabelText(/Hasło kopii zapasowej/);
 fireEvent.change(password,{target:{value:'short'}});api.get.mockClear();
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(password.value).toBe('short');expect(api.get).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:t('de','Zapisz ustawienia')}));
 await waitFor(()=>expect(mocks.notify).toHaveBeenCalledWith({type:'error',message:operationsText('de','Wpisz hasło kopii zapasowej (co najmniej {count} znaków) albo wyłącz szyfrowanie.',{count:8})}));
 expect(api.post).not.toHaveBeenCalled();
});

it('cancels a destructive restore after a mocked file preview without executing it',async()=>{
 window.history.replaceState(null,'','/#backup-restore');
 api.uploadMultipart.mockResolvedValueOnce({encrypted:false,backup_preview:{lead_count:2},current_database:{lead_count:3}}).mockResolvedValueOnce({restore_token:'mock-only',backup:{lead_count:2},current_database:{lead_count:3}});
 const view=mount(Settings);await screen.findByRole('checkbox',{name:'Szyfruj kopie hasłem (zalecane)'});
 fireEvent.change(view.container.querySelector('input[type="file"]'),{target:{files:[new File(['mock fixture'],'qa.qbk')]}});
 fireEvent.click(await screen.findByRole('button',{name:'Sprawdź kopię'}));
 await screen.findByRole('button',{name:'Potwierdź i przywróć'});
 fireEvent.click(screen.getByRole('button',{name:'ru',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:t('ru','Potwierdź i przywróć')}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledWith({message:t('ru','Zastąpić bieżącą bazę danych tą kopią? Obecne dane w bazie zostaną trwale usunięte.'),danger:true}));
 expect(api.uploadMultipart).toHaveBeenCalledTimes(2);expect(api.post).not.toHaveBeenCalled();
});
