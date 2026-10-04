import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {api} from '../api';
import RecipientReport,{recipientCsv} from './RecipientReport';
import Domains from './pages/Domains';
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn()}}));
const row={key:'1',label:'Test campaign',sent:3,recipients:2,replied:1,reply_rate:50,bounced:1,bounce_rate:null,unsubscribed:0,unsubscribe_rate:null,status_known:1};
const props={startDate:'2026-10-01',endDate:'2026-10-02',selectedIds:['1'],rangeError:null};
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(async path=>path==='/contact-fields'?[{key:'email',system:true},{key:'country',label:'Country'}]:{rows:[row]});});
afterEach(cleanup);
it('uses the same campaign and date filters for each group and omits system fields',async()=>{
 render(<MemoryRouter><RecipientReport {...props}/></MemoryRouter>);
 await screen.findByRole('region',{name:'Raport odbiorców'});
 expect(screen.getByText('50%')).toBeTruthy();expect(screen.getAllByText('—')).toHaveLength(2);
 fireEvent.change(screen.getByLabelText('Przekrój'),{target:{value:'field'}});
 expect(screen.queryByRole('option',{name:'email'})).toBeNull();
 fireEvent.change(screen.getByLabelText('Pole kontaktu'),{target:{value:'country'}});
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/analytics/report?start_date=2026-10-01&end_date=2026-10-02&group_by=field&field_key=country&campaign_id=1'));
});
it('clears stale results and disables export when a new report fails',async()=>{
 let finish;api.get.mockImplementation(path=>path==='/contact-fields'?Promise.resolve([]):path.includes('group_by=inbox')?Promise.reject(new Error('offline')):new Promise(resolve=>{finish=resolve;}));
 render(<MemoryRouter><RecipientReport {...props}/></MemoryRouter>);
 fireEvent.change(screen.getByLabelText('Przekrój'),{target:{value:'inbox'}});
 await screen.findByRole('alert');await act(async()=>finish({rows:[row]}));
 expect(screen.queryByText('Test campaign')).toBeNull();expect(screen.getByRole('button',{name:'Eksport odbiorców CSV'}).disabled).toBe(true);
});
it('exports the exact report including unknown values and neutralizes spreadsheet formulas',()=>{
 const csv=recipientCsv([{...row,label:'=HYPERLINK("bad")'}]);
 expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
 expect(csv).toContain('"3","2","1","50","1","—","0","—","1"');
});
it('shows demo mailbox evidence as fictional and never starts DNS requests',async()=>{
 api.get.mockResolvedValue({demo:true,rows:[{id:1,email:'me@example.com',connection_test:'not_measured',sync_state:'not_measured',retention_mode:'keep'}]});
 render(<MemoryRouter><Domains/></MemoryRouter>);
 await screen.findByText(/Demo: diagnostyka/);
 expect(screen.getByRole('button',{name:'Sprawdź DNS'}).disabled).toBe(true);
 expect(screen.getAllByText('Nie sprawdzono')).toHaveLength(7);expect(api.post).not.toHaveBeenCalled();
});
it('shows errors as errors and clears measurement after an input changes',async()=>{
 api.get.mockResolvedValue({demo:false,rows:[{id:1,email:'me@example.com',connection_test:'not_measured',sync_state:'not_measured',retention_mode:'keep'}]});
 api.post.mockResolvedValue({checked_at:'2026-10-04T10:00:00Z',checks:{SPF:{state:'error',records:[]},DKIM:{state:'present',records:['v=DKIM1; p=abc']}}});
 render(<MemoryRouter><Domains/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Sprawdź DNS'}));
 await screen.findByText('Błąd pomiaru');expect(screen.getByText('Rekord obecny')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Selektor DKIM'),{target:{value:'new'}});
 expect(screen.queryByText('Rekord obecny')).toBeNull();
});
