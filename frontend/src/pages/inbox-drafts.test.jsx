import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {Link,MemoryRouter,Route,Routes} from 'react-router-dom';
import {api} from '../api';
import Inbox from '../redesign/pages/Inbox';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),notify:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
const rows=[1,2].map(id=>({inbox_id:1,thread_id:'thread-'+id,lead_id:id,lead_email:`lead${id}@example.test`,lead_name:'Kontakt '+id,subject:'Rozmowa '+id}));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function mount(){return render(<MemoryRouter initialEntries={['/unibox']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Link to="/campaigns">Kampanie</Link><Routes><Route path="/unibox" element={<Inbox/>}/><Route path="/campaigns" element={<h1>Lista kampanii</h1>}/></Routes></MemoryRouter>);}
async function choose(id){fireEvent.click(await screen.findByRole('button',{name:new RegExp('Kontakt '+id)}));await waitFor(()=>expect(screen.getByRole('button',{name:'Dodaj do wykluczeń'}).disabled).toBe(false));}
beforeEach(()=>{
 vi.clearAllMocks();mocks.confirm.mockResolvedValue(true);api.post.mockResolvedValue({});
 api.get.mockImplementation(async path=>{
  if(path.startsWith('/ui/unibox?'))return{items:rows,total:2,counts:{all:2,unread:2}};
  if(path==='/inboxes')return[{id:1,email:'sender@example.test'}];
  if(path==='/templates')return[{id:1,name:'Szablon QA',latest_version:{subject:'Test',body:'Test',is_html:false}}];
  if(path.startsWith('/unibox/threads/'))return{messages:[],subject:'Test',inbox_account:'sender@example.test'};
  if(/^\/leads\/\d+$/.test(path)){const id=Number(path.split('/').at(-1));return{id,email:`lead${id}@example.test`,name:'Kontakt '+id,interactions:[]};}
  return[];
 });
});
afterEach(cleanup);
it('ignores a template response after selecting another conversation',async()=>{
 const gate=deferred();api.post.mockImplementation(p=>p==='/templates/preview/render'?gate.promise:Promise.resolve({}));
 mount();await choose(1);fireEvent.change(screen.getByRole('combobox',{name:'Użyj szablonu'}),{target:{value:'1'}});
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/templates/preview/render',expect.any(Object)));
 await choose(2);fireEvent.change(screen.getByRole('textbox',{name:'Treść odpowiedzi'}),{target:{value:'Szkic drugiej rozmowy'}});
 await act(async()=>gate.resolve({body:'Treść pierwszego kontaktu'}));
 expect(screen.getByRole('textbox',{name:'Treść odpowiedzi'}).value).toBe('Szkic drugiej rozmowy');
});
it('does not overwrite text typed while a template preview is loading',async()=>{
 const gate=deferred();api.post.mockImplementation(p=>p==='/templates/preview/render'?gate.promise:Promise.resolve({}));
 mount();await choose(1);fireEvent.change(screen.getByRole('combobox',{name:'Użyj szablonu'}),{target:{value:'1'}});
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/templates/preview/render',expect.any(Object)));
 fireEvent.change(screen.getByRole('textbox',{name:'Treść odpowiedzi'}),{target:{value:'Nowszy szkic'}});
 await act(async()=>gate.resolve({body:'Spóźniony szablon'}));
 expect(screen.getByRole('textbox',{name:'Treść odpowiedzi'}).value).toBe('Nowszy szkic');
});
it('guards drafts from other threads when leaving through navigation',async()=>{
 mocks.confirm.mockResolvedValue(false);mount();await choose(1);
 fireEvent.change(screen.getByRole('textbox',{name:'Treść odpowiedzi'}),{target:{value:'Zachowaj szkic'}});
 await choose(2);fireEvent.click(screen.getByRole('link',{name:'Kampanie'}));
 await waitFor(()=>expect(mocks.confirm).toHaveBeenCalledTimes(1));
 expect(screen.queryByRole('heading',{name:'Lista kampanii'})).toBeNull();
 await choose(1);expect(screen.getByRole('textbox',{name:'Treść odpowiedzi'}).value).toBe('Zachowaj szkic');
 mocks.confirm.mockResolvedValue(true);fireEvent.click(screen.getByRole('link',{name:'Kampanie'}));
 expect(await screen.findByRole('heading',{name:'Lista kampanii'})).toBeTruthy();
});
it('locks sending before confirmation and prevents duplicate replies and thread changes',async()=>{
 const confirmation=deferred(),reply=deferred();mocks.confirm.mockReturnValue(confirmation.promise);
 api.post.mockImplementation(p=>p==='/ui/reply'?reply.promise:Promise.resolve({}));
 mount();await choose(1);fireEvent.change(screen.getByRole('textbox',{name:'Treść odpowiedzi'}),{target:{value:'Odpowiedź QA'}});
 const send=screen.getByRole('button',{name:'Wyślij'});fireEvent.click(send);fireEvent.click(send);
 expect(mocks.confirm).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:/Kontakt 2/}).disabled).toBe(true);
 await act(async()=>confirmation.resolve(true));
 expect(api.post.mock.calls.filter(([p])=>p==='/ui/reply')).toHaveLength(1);
 await act(async()=>reply.resolve({}));
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'Treść odpowiedzi'}).value).toBe(''));
 expect(api.post).toHaveBeenCalledWith('/ui/reply',expect.objectContaining({to_email:'lead1@example.test',thread_id:'thread-1',body:'Odpowiedź QA'}));
});
it('refreshes unread totals after marking a thread read',async()=>{
 let marked=false;const original=api.get.getMockImplementation();
 api.get.mockImplementation(p=>p.startsWith('/ui/unibox?')?Promise.resolve({items:rows,total:2,counts:{all:2,unread:marked?1:2}}):original(p));
 api.post.mockImplementation(async p=>{if(p.includes('/mark-read'))marked=true;return{};});
 mount();await screen.findByRole('button',{name:'Nieprzeczytane 2'});await choose(1);
 expect(await screen.findByRole('button',{name:'Nieprzeczytane 1'})).toBeTruthy();
});
it('retains the draft if sending fails and permits an explicit retry',async()=>{
 api.post.mockImplementation(p=>p==='/ui/reply'?Promise.reject(new Error('Brak połączenia')):Promise.resolve({}));
 mount();await choose(1);fireEvent.change(screen.getByRole('textbox',{name:'Treść odpowiedzi'}),{target:{value:'Nie zgub wiadomości'}});
 fireEvent.click(screen.getByRole('button',{name:'Wyślij'}));await screen.findByRole('alert');
 expect(screen.getByRole('textbox',{name:'Treść odpowiedzi'}).value).toBe('Nie zgub wiadomości');
 expect(screen.getByRole('button',{name:'Wyślij'}).disabled).toBe(false);
});
