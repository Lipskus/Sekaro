import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Sales from './Sales';
import CrmNavigation from '../redesign/CrmNavigation';
import {api} from '../api';
const {confirm}=vi.hoisted(()=>({confirm:vi.fn()}));
vi.mock('../context/Permissions',()=>({useCan:()=>true}));
vi.mock('../api',()=>({api:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>confirm}));
const pipeline={id:1,name:'Sprzedaż B2B',revision:3,stages:[{key:'new',name:'Nowa'},{key:'offer',name:'Oferta'}]};
const opportunity={id:7,title:'Kontrakt portowy',pipeline_id:1,stage:'new',value:'100.00',currency:'PLN',probability:20,outcome:'open',revision:2,lead_id:9,company_id:4};
const mount=(url='/sales')=>render(<MemoryRouter initialEntries={[url]}><CrmNavigation/><Sales/></MemoryRouter>);
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();confirm.mockResolvedValue(true);api.get.mockImplementation(p=>Promise.resolve(p.endsWith('/pipelines')?[pipeline]:p==='/crm/companies'?[{id:4,name:'Port'}]:p.startsWith('/leads?')?[]:p.includes('/history/')?[]:p.includes('/opportunities?')?{items:[opportunity],total:1}:{items:[],total:0}));});
afterEach(cleanup);
it('preserves stable stage keys when renaming and reordering a pipeline',async()=>{
 api.put.mockResolvedValue({});mount();fireEvent.click(await screen.findByRole('button',{name:'Konfiguruj pipeline'}));
 fireEvent.change(screen.getByLabelText('Etap 1'),{target:{value:'Rozmowa'}});fireEvent.click(screen.getByRole('button',{name:'Dalej Rozmowa'}));
 fireEvent.click(screen.getByRole('button',{name:'Zapisz'}));
 await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/crm/sales/pipelines/1',{name:'Sprzedaż B2B',stages:[{key:'offer',name:'Oferta'},{key:'new',name:'Rozmowa'}],archived:false,revision:3}));
});
it('keeps a stale opportunity draft and blocks duplicate saves',async()=>{
 let reject;api.put.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));mount();fireEvent.click(await screen.findByRole('button',{name:'Kontrakt portowy'}));
 const title=screen.getByLabelText('Nazwa');fireEvent.change(title,{target:{value:'Nowy tytuł'}});fireEvent.submit(title.closest('form'));fireEvent.submit(title.closest('form'));
 expect(api.put).toHaveBeenCalledTimes(1);expect(title.closest('fieldset').disabled).toBe(true);await act(async()=>reject(Error('Record changed. Reload before saving.')));
 expect(await screen.findByText('Record changed. Reload before saving.')).toBeTruthy();expect(title.value).toBe('Nowy tytuł');
});
it('creates a follow-up with contact, company and opportunity links',async()=>{
 api.post.mockResolvedValue({});mount();fireEvent.click(await screen.findByRole('button',{name:'Kontrakt portowy'}));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Dodaj działanie'}));
 fireEvent.change(screen.getByLabelText('Nazwa'),{target:{value:'Zadzwonić'}});fireEvent.change(screen.getByLabelText('Termin / koniec'),{target:{value:'2026-10-09T14:30'}});
 fireEvent.click(screen.getByRole('button',{name:'Zapisz'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/crm/sales/activities',expect.objectContaining({title:'Zadzwonić',lead_id:9,company_id:4,opportunity_id:7,due_at:new Date('2026-10-09T14:30').toISOString()})));
});
it('filters the calendar month on the server and preserves contact context',async()=>{
 mount('/sales?lead_id=9');fireEvent.click(screen.getByRole('link',{name:'Kalendarz'}));
 const month=await screen.findByLabelText('Miesiąc');fireEvent.change(month,{target:{value:'2026-11'}});
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith(expect.stringContaining('date_from='+encodeURIComponent(new Date(2026,10,1).toISOString()))));
 const requests=api.get.mock.calls.map(x=>x[0]).filter(x=>x.includes('date_from='));expect(requests.at(-1)).toContain('lead_id=9');expect(requests.at(-1)).toContain('date_to='+encodeURIComponent(new Date(2026,11,1).toISOString()));
});
it('opens calendar details without editing and enters the editor only on Edit',async()=>{
 const row={id:21,title:'Spotkanie w porcie',description:'Agenda spotkania',kind:'meeting',starts_at:'2026-11-09T10:00:00Z',due_at:'2026-11-09T11:00:00Z',location:'Sala A',priority:'high',status:'planned',revision:4,lead_id:9,company_id:4,opportunity_id:7};
 const original=api.get.getMockImplementation();api.get.mockImplementation(p=>p.includes('/activities?')?Promise.resolve({items:[row],total:1}):original(p));
 mount('/sales?view=calendar');fireEvent.change(await screen.findByLabelText('Miesiąc'),{target:{value:'2026-11'}});
 fireEvent.click(await screen.findByRole('button',{name:/Spotkanie w porcie/}));
 const details=screen.getByRole('dialog',{name:'Szczegóły działania'});
 expect(within(details).getByText('Agenda spotkania')).toBeTruthy();expect(within(details).getByText('Sala A')).toBeTruthy();
 expect(within(details).queryByRole('textbox')).toBeNull();expect(within(details).queryByRole('button',{name:'Zapisz'})).toBeNull();
 expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 fireEvent.click(within(details).getByRole('button',{name:'Zamknij',exact:true}));expect(screen.queryByRole('dialog')).toBeNull();expect(confirm).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/Spotkanie w porcie/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Edytuj'}));
 expect(screen.getByLabelText('Nazwa').value).toBe(row.title);expect(screen.getByLabelText('Opis').value).toBe(row.description);
 fireEvent.change(screen.getByLabelText('Nazwa'),{target:{value:'Spotkanie po zmianie'}});fireEvent.click(screen.getByRole('button',{name:'Zapisz'}));
 await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/crm/sales/activities/21',expect.objectContaining({title:'Spotkanie po zmianie',revision:4,lead_id:9,company_id:4,opportunity_id:7})));
});
