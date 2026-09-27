import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import {MemoryRouter,Link} from 'react-router-dom';
import Templates from './Templates';
import {api} from '../api';
const {confirm,notify}=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>notify}));
vi.mock('react-quill',()=>({default:()=>null}));
const versions=[{id:2,version:2,subject:'Nowy temat',body:'Nowa treść',is_html:false},{id:1,version:1,subject:'Stary temat',body:'Stara treść',is_html:false}];
const first={id:1,name:'Oferta',latest_version:versions[0],versions};
const second={...first,id:2,name:'Drugi'};
const contact={id:9,name:'Ala',email:'ala@example.test',custom_data:{company:'Firma'}};
const baseGet=p=>Promise.resolve(p==='/templates'?[first,second]:p==='/templates/1'?first:p==='/templates/2'?second:p==='/contact-fields'?[{key:'name',label:'Imię'}]:p==='/inboxes'?[{id:1,email:'me@example.test',provider:'smtp'}]:[]);
async function mount(){render(<MemoryRouter><Link to="/leads">Kontakty</Link><Templates/></MemoryRouter>);await screen.findByRole('button',{name:/Oferta wersja/});}
async function open(){await mount();fireEvent.click(screen.getByRole('button',{name:/Oferta wersja/}));await screen.findByDisplayValue('Nowy temat');}
const change=(name,value)=>fireEvent.change(screen.getByRole('textbox',{name,exact:true}),{target:{value}});
beforeEach(()=>{vi.clearAllMocks();confirm.mockResolvedValue(false);api.get.mockImplementation(baseGet);});
afterEach(cleanup);
it('protects the draft across template, version, new and navigation actions',async()=>{
 await open();change('Temat wiadomości','Roboczy');
 for(const name of [/Drugi wersja/,/Wersja 1/,'Nowy szablon']){fireEvent.click(screen.getByRole('button',{name,exact:typeof name==='string'}));await waitFor(()=>expect(screen.getByDisplayValue('Roboczy')).toBeTruthy());await act(async()=>{});}
 fireEvent.click(screen.getByRole('link',{name:'Kontakty',exact:true}));await act(async()=>{});expect(confirm).toHaveBeenCalledTimes(4);expect(api.get).not.toHaveBeenCalledWith('/templates/2');expect(screen.getByDisplayValue('Roboczy')).toBeTruthy();
});
it('saves the name and content once, preserves failed drafts, and locks editing in flight',async()=>{
 await open();change('Nazwa szablonu','Zmieniony');change('Temat wiadomości','Roboczy');let reject;api.post.mockImplementation(()=>new Promise((_,r)=>reject=r));
 const save=screen.getByRole('button',{name:'Zapisz nową wersję'});fireEvent.click(save);fireEvent.click(save);expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/templates/1/versions',expect.objectContaining({name:'Zmieniony',subject:'Roboczy'}));expect(api.patch).not.toHaveBeenCalled();expect(screen.getByRole('textbox',{name:'Temat wiadomości'}).closest('fieldset').disabled).toBe(true);
 reject(Error('Nie zapisano'));await screen.findByRole('alert');expect(screen.getByDisplayValue('Roboczy')).toBeTruthy();expect(screen.getByText('Niezapisane zmiany')).toBeTruthy();
});
it('duplicates current content into an unsaved copy without writing or destroying its source',async()=>{
 await open();change('Temat wiadomości','Robocza kopia');fireEvent.click(screen.getByRole('button',{name:'Duplikuj'}));expect(screen.getByDisplayValue('Oferta — kopia')).toBeTruthy();expect(screen.getByDisplayValue('Robocza kopia')).toBeTruthy();expect(screen.getByRole('button',{name:'Utwórz szablon'})).toBeTruthy();expect(api.post).not.toHaveBeenCalled();expect(api.del).not.toHaveBeenCalled();
});
it('ignores a preview that arrives after the draft changes',async()=>{
 await open();let resolve;api.post.mockImplementation(()=>new Promise(r=>resolve=r));fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Generuj podgląd'}));fireEvent.click(screen.getByRole('button',{name:'Edytor',exact:true}));change('Temat wiadomości','Inny');
 await act(async()=>resolve({subject:'Stary wynik',body:'Nieaktualne',variables:[],missing_variables:[]}));fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));expect(screen.queryByText('Nieaktualne')).toBeNull();expect(screen.getByText('Podgląd nie został wygenerowany')).toBeTruthy();
});
it('shows searched contact and the actual values used by the rendered preview',async()=>{
 api.get.mockImplementation(p=>p.startsWith('/leads?')?Promise.resolve([contact]):baseGet(p));api.post.mockResolvedValue({subject:'Hej Ala',body:'Treść',variables:['name','missing'],missing_variables:['missing'],context:{name:'Ala'}});await open();fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));change('Szukaj kontaktu do podglądu','Ala');fireEvent.click(screen.getByRole('button',{name:'Szukaj',exact:true}));await screen.findByRole('option',{name:/ala@example/});fireEvent.change(screen.getByRole('combobox',{name:'Kontakt do podglądu'}),{target:{value:'9'}});fireEvent.click(screen.getByRole('button',{name:'Generuj podgląd'}));await screen.findByText('Temat: Hej Ala');expect(screen.getByText('Brak wartości: {{missing}}')).toBeTruthy();expect(screen.getByText('Brak wartości')).toBeTruthy();expect(api.post).toHaveBeenCalledWith('/templates/preview/render',expect.objectContaining({lead_id:9}));expect(api.patch).not.toHaveBeenCalled();
});
it('rejects stale search results and distinguishes empty results from an error',async()=>{
 await open();fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));let resolve;api.get.mockImplementation(p=>p.startsWith('/leads?')?new Promise(r=>resolve=r):baseGet(p));change('Szukaj kontaktu do podglądu','old');fireEvent.click(screen.getByRole('button',{name:'Szukaj',exact:true}));change('Szukaj kontaktu do podglądu','new');await act(async()=>resolve([contact]));expect(screen.queryByRole('option',{name:/ala@example/})).toBeNull();
 api.get.mockResolvedValue([]);fireEvent.click(screen.getByRole('button',{name:'Szukaj',exact:true}));await screen.findByText('Nie znaleziono kontaktów.');api.get.mockRejectedValue(Error('Brak połączenia'));fireEvent.click(screen.getByRole('button',{name:'Szukaj',exact:true}));await screen.findByText('Brak połączenia');expect(screen.queryByText('Nie znaleziono kontaktów.')).toBeNull();
});
it('keeps the selected template and draft when another template fails to load',async()=>{
 await open();change('Temat wiadomości','Roboczy');confirm.mockResolvedValue(true);api.get.mockImplementation(p=>p==='/templates/2'?Promise.reject(Error('Brak szablonu')):baseGet(p));fireEvent.click(screen.getByRole('button',{name:/Drugi wersja/}));await screen.findByText('Brak szablonu');expect(screen.getByDisplayValue('Roboczy')).toBeTruthy();expect(screen.getByDisplayValue('Oferta')).toBeTruthy();
});
it('blocks duplicate test sends and preserves inputs after a send failure',async()=>{
 await open();fireEvent.click(screen.getByRole('button',{name:'Wysyłka testowa',exact:true}));change('Adres odbiorcy testowego','test@example.test');let reject;api.post.mockImplementation(()=>new Promise((_,r)=>reject=r));const send=screen.getByRole('button',{name:'Wyślij test'});fireEvent.click(send);fireEvent.click(send);expect(api.post).toHaveBeenCalledTimes(1);reject(Error('Wysyłka zablokowana'));await screen.findByText('Wysyłka zablokowana');expect(screen.getByDisplayValue('test@example.test')).toBeTruthy();
});
