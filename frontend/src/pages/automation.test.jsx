import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Automations from './Automations';
import CrmReports from './CrmReports';
import {api} from '../api';
const {confirm}=vi.hoisted(()=>({confirm:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>confirm}));
const rule={id:1,name:'Followup',enabled:false,revision:2,trigger:'reply',mode:'approval',action:{type:'task',title:'Call',delay_days:1},conditions:{},daily_limit:10};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();confirm.mockResolvedValue(true);api.get.mockImplementation(async p=>p==='/crm/automations/rules'?[rule]:[]);});afterEach(cleanup);
it('creates disabled rules in approval mode and prevents duplicate submissions',async()=>{
 let resolve;api.post.mockImplementation(()=>new Promise(r=>resolve=r));render(<Automations/>);await screen.findByRole('cell',{name:'Followup',exact:true});fireEvent.click(screen.getByRole('button',{name:'Nowa reguła'}));fireEvent.change(screen.getByLabelText('Nazwa reguły'),{target:{value:'Customer followup'}});fireEvent.change(screen.getByLabelText('Tytuł zadania'),{target:{value:'Call customer'}});const form=screen.getByLabelText('Nazwa reguły').closest('form');fireEvent.submit(form);fireEvent.submit(form);expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/crm/automations/rules',expect.objectContaining({mode:'approval',name:'Customer followup',action:{type:'task',title:'Call customer',delay_days:1}}));await act(async()=>resolve({id:2}));
});
it('requires confirmation to enable and sends the displayed revision',async()=>{
 api.post.mockResolvedValue({});confirm.mockResolvedValueOnce(false);render(<Automations/>);fireEvent.click(await screen.findByRole('button',{name:'Włącz'}));await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1));expect(api.post).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Włącz'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/crm/automations/rules/1/enabled',{revision:2,enabled:true}));
});
it('preserves an edited draft when revision validation fails',async()=>{
 api.put.mockRejectedValue(Error('Rule changed. Reload before saving.'));render(<Automations/>);fireEvent.click(await screen.findByRole('button',{name:'Edytuj'}));fireEvent.change(screen.getByLabelText('Nazwa reguły'),{target:{value:'Keep draft'}});fireEvent.click(screen.getByRole('button',{name:'Zapisz'}));await screen.findByText('Rule changed. Reload before saving.');expect(screen.getByLabelText('Nazwa reguły').value).toBe('Keep draft');
});
it('report displays currencies separately and sends explicit date basis',async()=>{
 const report={counts:{open:2,won:1,lost:1},conversion:{numerator:1,denominator:2,percent:50},currencies:[{currency:'PLN',open:'20',won:'30',lost:'0'},{currency:'EUR',open:'10',won:'0',lost:'15'}],stages:[],sources:[],activities:[],overdue:[],inactive:[],followup:[]};api.get.mockImplementation(async p=>p.startsWith('/crm/reports?')?report:[]);render(<MemoryRouter><CrmReports/></MemoryRouter>);await screen.findByText('50%');expect(screen.getByText('PLN')).toBeTruthy();expect(screen.getByText('EUR')).toBeTruthy();fireEvent.change(screen.getByLabelText('Data szansy'),{target:{value:'closed'}});fireEvent.change(screen.getByLabelText('Od'),{target:{value:'2026-10-01'}});fireEvent.click(screen.getByRole('button',{name:'Pokaż raport'}));await waitFor(()=>expect(api.get).toHaveBeenCalledWith(expect.stringContaining('date_basis=closed')));expect(api.get.mock.calls.at(-1)[0]).toContain(encodeURIComponent(new Date('2026-10-01T00:00:00').toISOString()));
});
