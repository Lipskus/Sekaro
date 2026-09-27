import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import MailboxArchive from './MailboxArchive';
import {api} from '../api';
vi.mock('../api',()=>({api:{get:vi.fn(),put:vi.fn(),download:vi.fn()}}));
const data={mode:'keep',days:30,imap_configured:true,count:1,bytes:2048,last_sync_at:'2026-09-27T10:00:00Z',messages:[{id:4,subject:'Załącznik',from_address:'a@example.test',size_bytes:2048,removal_status:'retained'}],next_before:null};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue(data);});
afterEach(cleanup);
it('requires explicit confirmation and sends the chosen retention interval',async()=>{
 const dirty=vi.fn();api.put.mockResolvedValue({mode:'days',days:7});render(<MailboxArchive inboxId={1} onDirtyChange={dirty}/>);
 fireEvent.change(await screen.findByRole('combobox'),{target:{value:'days'}});fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'7'}});
 expect(screen.getByRole('button',{name:'Zapisz przechowywanie'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Zapisz przechowywanie'}));
 await screen.findByText('Zasady przechowywania zapisane.');expect(api.put).toHaveBeenCalledWith('/smtp/inboxes/1/retention',{mode:'days',days:7,confirm_delete:true});expect(dirty).toHaveBeenLastCalledWith(false);
 expect(screen.queryByText(/Invalid Date/)).toBeNull();
});
it('keeps the policy draft on failure and blocks duplicate saves',async()=>{
 let reject;api.put.mockImplementation(()=>new Promise((_,r)=>reject=r));const busy=vi.fn();render(<MailboxArchive inboxId={1} onBusyChange={busy}/>);
 fireEvent.change(await screen.findByRole('combobox'),{target:{value:'immediate'}});fireEvent.click(screen.getByRole('checkbox'));
 const save=screen.getByRole('button',{name:'Zapisz przechowywanie'});fireEvent.click(save);fireEvent.click(save);expect(api.put).toHaveBeenCalledTimes(1);expect(busy).toHaveBeenLastCalledWith(true);
 reject(Error('Nie zapisano'));await screen.findByRole('alert');expect(screen.getByRole('combobox').value).toBe('immediate');expect(busy).toHaveBeenLastCalledWith(false);expect(screen.getByRole('button',{name:'Odśwież status'}).disabled).toBe(true);
});
it('retries a failed archive read and shows removal diagnostics',async()=>{
 api.get.mockRejectedValueOnce(Error('offline')).mockResolvedValue({...data,sync_error:'Synchronizacja przerwana',messages:[{...data.messages[0],removal_status:'error',last_error:'Oryginał pozostawiono'}]});render(<MailboxArchive inboxId={1}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Spróbuj ponownie'}));await screen.findByText('Wymaga uwagi');expect(screen.getByText('Oryginał pozostawiono')).toBeTruthy();expect(screen.getByText('Synchronizacja przerwana')).toBeTruthy();
});
it('downloads the full message through the authenticated API',async()=>{
 const blob=new Blob(['mime']);api.download.mockResolvedValue({blob:async()=>blob});const create=vi.fn(()=> 'blob:test'),revoke=vi.fn();URL.createObjectURL=create;URL.revokeObjectURL=revoke;
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});render(<MailboxArchive inboxId={1}/>);fireEvent.click(await screen.findByRole('button',{name:'Pobierz .eml'}));await waitFor(()=>expect(click).toHaveBeenCalled());expect(api.download).toHaveBeenCalledWith('/smtp/inboxes/1/archive/4/eml');expect(create).toHaveBeenCalledWith(blob);expect(revoke).toHaveBeenCalledWith('blob:test');click.mockRestore();
});
it('disables deleting for a send-only mailbox and does not overwrite drafts by refresh',async()=>{
 api.get.mockResolvedValue({...data,imap_configured:false});render(<MailboxArchive inboxId={1}/>);await screen.findByRole('combobox');expect(screen.getByRole('option',{name:'Usuń po zarchiwizowaniu'}).disabled).toBe(true);
});
