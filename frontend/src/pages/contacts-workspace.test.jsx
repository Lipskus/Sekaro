import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act,within} from '@testing-library/react';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import LeadDetail from './LeadDetail';
import Contacts from '../redesign/pages/Contacts';
import ContactImport from '../redesign/ContactImport';
import FieldManager from '../redesign/FieldManager';
import {api} from '../api';
const {confirm,notify}=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),patch:vi.fn(),post:vi.fn(),upload:vi.fn(),uploadMultipart:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>notify}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({user:{id:1}})}));
const fields=[{key:'priority',label:'Priorytet',field_type:'number',defined:true},{key:'region',label:'Region',field_type:'select',options:['PL','DE'],defined:true},{key:'note',label:'Notatka',field_type:'textarea',defined:true},{key:'due',label:'Termin',field_type:'date',defined:true}];
const lead={id:1,name:'Ala',email:'ala@example.test',custom_data:{priority:3,region:'PL',note:'Notatka',due:'2026-09-27',hidden:{nested:true}},campaigns:[{campaign_id:2,campaign_name:'Kampania QA',enrolled_at:'2026-09-01T10:00:00'}],interactions:[{direction:'outbound',kind:'sent',at:'2026-09-02T10:00:00',subject:'Pierwsza wiadomość'},{direction:'inbound',kind:'reply_marker',at:'2026-09-03T10:00:00'}]};
const baseGet=p=>Promise.resolve(p==='/contact-fields'?fields:p==='/leads/1'?lead:[]);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function mount(){render(<MemoryRouter initialEntries={['/leads/1']}><Link to="/leads/2">Drugi kontakt</Link><Routes><Route path="/leads/:id" element={<LeadDetail/>}/></Routes></MemoryRouter>);await screen.findByRole('textbox',{name:'Nazwa / imię'});}
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(baseGet);confirm.mockResolvedValue(false);});
afterEach(cleanup);
it('uses typed fields and preserves numbers and unknown structured data when saving a name',async()=>{
 await mount();expect(screen.getByRole('spinbutton',{name:'Priorytet'}).value).toBe('3');expect(screen.getByRole('combobox',{name:'Region'}).value).toBe('PL');expect(screen.getByLabelText('Termin').type).toBe('date');
 fireEvent.change(screen.getByRole('textbox',{name:'Nazwa / imię'}),{target:{value:'Nowa nazwa'}});api.patch.mockResolvedValue({...lead,name:'Nowa nazwa'});fireEvent.click(screen.getByRole('button',{name:'Zapisz dane'}));await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/leads/1',{name:'Nowa nazwa',custom_data:lead.custom_data}));await screen.findByText('Brak niezapisanych zmian');
});
it('locks duplicate saves and retains draft and inline errors after failure',async()=>{
 await mount();fireEvent.change(screen.getByRole('textbox',{name:'Nazwa / imię'}),{target:{value:'Szkic'}});const d=deferred();api.patch.mockReturnValue(d.promise);const save=screen.getByRole('button',{name:'Zapisz dane'});fireEvent.click(save);fireEvent.click(save);expect(api.patch).toHaveBeenCalledTimes(1);expect(screen.getByRole('textbox',{name:'Nazwa / imię'}).closest('fieldset').disabled).toBe(true);await act(async()=>d.reject(Error('Błąd zapisu')));await screen.findByText('Błąd zapisu');expect(screen.getByDisplayValue('Szkic')).toBeTruthy();
});
it('keeps drafts across tabs and cancelled navigation',async()=>{
 await mount();fireEvent.change(screen.getByRole('textbox',{name:'Nazwa / imię'}),{target:{value:'Szkic'}});fireEvent.click(screen.getByRole('tab',{name:'Aktywność'}));fireEvent.click(screen.getByRole('tab',{name:'Podsumowanie'}));expect(screen.getByDisplayValue('Szkic')).toBeTruthy();fireEvent.click(screen.getByRole('link',{name:'Drugi kontakt'}));await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1));expect(api.get).not.toHaveBeenCalledWith('/leads/2');expect(screen.getByDisplayValue('Szkic')).toBeTruthy();
});
it('sorts the timeline newest first, filters enrollments, and separates reply markers from messages',async()=>{
 await mount();fireEvent.click(screen.getByRole('tab',{name:'Aktywność'}));const timeline=document.querySelector('.sk-contact-workspace-main ol');expect(within(timeline).getAllByRole('listitem')[0].textContent).toContain('Potwierdzona odpowiedź');fireEvent.change(screen.getByLabelText('Rodzaj aktywności'),{target:{value:'enrolled'}});expect(within(timeline).getAllByRole('listitem')).toHaveLength(1);expect(timeline.textContent).toContain('Dodano do kampanii');fireEvent.click(screen.getByRole('tab',{name:'Wiadomości'}));expect(screen.queryByText('Potwierdzona odpowiedź')).toBeNull();expect(screen.getByText('Pierwsza wiadomość')).toBeTruthy();
});
it('clears the previous profile on route changes and handles its failed load',async()=>{
 await mount();const d=deferred();api.get.mockImplementation(p=>p==='/leads/2'?d.promise:baseGet(p));fireEvent.click(screen.getByRole('link',{name:'Drugi kontakt'}));await screen.findByText('Wczytywanie');expect(screen.queryByDisplayValue('Ala')).toBeNull();await act(async()=>d.reject(Error('Kontakt niedostępny')));await screen.findByText('Kontakt niedostępny');expect(screen.queryByRole('button',{name:'Zapisz dane'})).toBeNull();
});
it('does not apply a custom filter when its dialog is cancelled',async()=>{
 api.get.mockImplementation(p=>Promise.resolve(p==='/contact-fields'?fields:p.startsWith('/leads?')?[lead]:[]));render(<MemoryRouter><Contacts/></MemoryRouter>);await screen.findByRole('link',{name:'ala@example.test'});fireEvent.click(screen.getByRole('button',{name:'Więcej filtrów'}));fireEvent.change(screen.getByLabelText('Pole'),{target:{value:'region'}});fireEvent.change(screen.getByLabelText('Zawiera'),{target:{value:'ZZ'}});fireEvent.click(screen.getByRole('button',{name:'Zamknij okno'}));expect(screen.getByRole('link',{name:'ala@example.test'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Wyczyść filtr'})).toBeNull();
});
it('locks import mapping during commit, commits only once, and separates success from refresh failure',async()=>{
 api.upload.mockResolvedValue({headers:['Email'],suggested_mapping:{Email:'email'},sample_rows:[{Email:'a@example.test'}],total_rows:1});const d=deferred();api.uploadMultipart.mockReturnValue(d.promise);const done=vi.fn().mockRejectedValue(Error('refresh'));
 render(<ContactImport file={new File(['Email\na@example.test'],'qa.csv')} onClose={vi.fn()} onDone={done}/>);fireEvent.click(screen.getByRole('button',{name:'Wczytaj i sprawdź plik'}));const commit=await screen.findByRole('button',{name:'Importuj kontakty'});fireEvent.click(commit);fireEvent.click(commit);expect(api.uploadMultipart).toHaveBeenCalledTimes(1);expect(screen.getByRole('combobox',{name:'Mapowanie Email'}).closest('fieldset').disabled).toBe(true);await act(async()=>d.resolve({added:1,updated:0,duplicates_in_file:0,skipped_suppressed:0,invalid_count:0}));await screen.findByText('Import zakończony');expect(screen.queryByRole('button',{name:'Importuj kontakty'})).toBeNull();expect(screen.getByRole('alert').textContent).toContain('Import zakończył się poprawnie');
});

it('protects field definitions from accidental replacement and locks pending saves',async()=>{
 const close=vi.fn();render(<FieldManager fields={fields} onClose={close} onRefresh={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Nazwa pola'),{target:{value:'Nowe pole'}});fireEvent.click(screen.getByRole('button',{name:'Zamknij własne pola'}));await waitFor(()=>expect(confirm).toHaveBeenCalled());expect(close).not.toHaveBeenCalled();expect(screen.getByDisplayValue('Nowe pole')).toBeTruthy();
 const d=deferred();api.post.mockReturnValue(d.promise);fireEvent.click(screen.getByRole('button',{name:'Utwórz pole'}));fireEvent.click(screen.getByRole('button',{name:'Zapisywanie…'}));expect(api.post).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('Nazwa pola').closest('fieldset').disabled).toBe(true);expect(screen.getByRole('button',{name:'Zamknij własne pola'}).disabled).toBe(true);await act(async()=>d.reject(Error('Nie zapisano pola')));await screen.findByText('Nie zapisano pola');expect(screen.getByDisplayValue('Nowe pole')).toBeTruthy();
});

it('restores from the archive with confirmation and never enrolls or resumes sending',async()=>{
 const archived={...lead,archived_at:'2026-10-04T10:00:00',suppressed:true};
 api.get.mockImplementation(p=>Promise.resolve(p==='/contact-fields'?fields:p.startsWith('/leads?scope=archived')?[archived]:[]));
 confirm.mockResolvedValue(true);api.post.mockResolvedValue({ok:true,updated:1});
 render(<MemoryRouter><Contacts/></MemoryRouter>);
 fireEvent.change(screen.getByRole('combobox',{name:'Zakres kontaktów'}),{target:{value:'archived'}});
 await screen.findByRole('link',{name:'ala@example.test'});
 fireEvent.click(screen.getByRole('checkbox',{name:'Zaznacz ala@example.test'}));
 expect(screen.getByRole('button',{name:'Dodaj do kampanii'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Przywróć'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/leads/archive',{lead_ids:[1],archived:false}));
 expect(api.post).toHaveBeenCalledTimes(1);
 expect(confirm.mock.calls[0][0]).toContain('Wysyłka pozostanie wstrzymana');
});

it('shows operation authors separately from messages and preserves independent blocks',async()=>{
 api.get.mockImplementation(p=>Promise.resolve(p==='/contact-fields'?fields:p==='/leads/1'?{...lead,archived_at:'2026-10-04T10:00:00',suppressed:true,operations:[{kind:'operation',action:'archive',at:'2026-10-04T10:00:00',actor_name:'Operator QA'}]}:[]));
 await mount();expect(screen.getAllByText('Globalna blokada wysyłki').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('tab',{name:'Aktywność'}));
 expect(screen.getByText('Kontakt zarchiwizowany')).toBeTruthy();expect(screen.getByText('Autor: Operator QA')).toBeTruthy();
 fireEvent.click(screen.getByRole('tab',{name:'Wiadomości'}));
 expect(screen.queryByText('Kontakt zarchiwizowany')).toBeNull();
 expect(screen.getByText('Pierwsza wiadomość')).toBeTruthy();
});
