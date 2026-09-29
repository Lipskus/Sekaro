import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {SequencesTab} from './CampaignDetail';
import {api} from '../api';
import {sequenceDay,sequenceExcerpt} from '../redesign/sequencePresentation';
const mocks=vi.hoisted(()=>({notify:vi.fn(),confirm:vi.fn(),refresh:vi.fn(),isDemo:false}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()},apiCache:{}}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/LoadingContext',()=>({useLoading:()=>({start(){},stop(){}})}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({isProduction:true,isDemo:mocks.isDemo})}));
vi.mock('react-quill',()=>({default:()=>null}));
const steps=[{id:1,position:0,subject:'Pierwszy kontakt',body:'Dzień dobry',wait_days_after_previous:0,is_html:false},{id:2,position:1,subject:'Ponowienie',body:'Wracam do rozmowy',wait_days_after_previous:2,is_html:false}];
function mount(){return render(<MemoryRouter><SequencesTab sequences={steps} campaignId={1} campaign={{}} leads={[]} refresh={mocks.refresh}/></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();mocks.isDemo=false;api.get.mockResolvedValue([])});
afterEach(cleanup);
it('keeps a dirty edit when switching steps is cancelled',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Edytuj krok 1'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Temat wiadomości'}),{target:{value:'Niezapisany temat'}});
 fireEvent.click(screen.getByRole('button',{name:'Pokaż krok 2'}));
 expect(screen.getByRole('dialog',{name:'Odrzucić zmiany?'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Kontynuuj edycję'}));
 expect(screen.getByRole('textbox',{name:'Temat wiadomości'}).value).toBe('Niezapisany temat');
 expect(api.patch).not.toHaveBeenCalled();
});
it('opens the requested step only after explicit discard',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Edytuj krok 1'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Temat wiadomości'}),{target:{value:'Roboczy'}});
 fireEvent.click(screen.getByRole('button',{name:'Edytuj krok 2'}));
 fireEvent.click(screen.getByRole('button',{name:'Odrzuć',exact:true}));
 expect(screen.getByRole('textbox',{name:'Temat wiadomości'}).value).toBe('Ponowienie');
 expect(api.patch).not.toHaveBeenCalled();
});
it('protects changes before opening the add form and retains edits after failed save',async()=>{
 api.patch.mockRejectedValue(new Error('Nie zapisano'));mount();
 fireEvent.click(screen.getByRole('button',{name:'Edytuj krok 1'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Temat wiadomości'}),{target:{value:'Roboczy'}});
 fireEvent.click(screen.getByRole('button',{name:'Dodaj krok',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'Kontynuuj edycję'}));
 fireEvent.click(screen.getByRole('button',{name:'Zapisz zmiany'}));
 await waitFor(()=>expect(mocks.notify).toHaveBeenCalledWith({type:'error',message:'Nie zapisano'}));
 expect(screen.getByRole('textbox',{name:'Temat wiadomości'}).value).toBe('Roboczy');
 expect(mocks.refresh).not.toHaveBeenCalled();
});
it('shows cumulative timing and safe plain text excerpts',()=>{
 expect(sequenceDay([...steps,{wait_days_after_previous:'4'}],2)).toBe(6);
 expect(sequenceDay([], -1)).toBe(0);
 expect(sequenceExcerpt({is_html:true,body:'<p>Cześć &amp; witaj</p><script>alert(1)</script>'})).toBe('Cześć & witaj');
 expect(sequenceExcerpt({sequence_type:'personalized',fallback_body:'Treść indywidualna'})).toBe('Treść indywidualna');
});
it('closes the editor of a successfully deleted step after confirmation',async()=>{
 mocks.confirm.mockResolvedValue(true);api.del.mockResolvedValue({});mount();
 fireEvent.click(screen.getByRole('button',{name:'Edytuj krok 1'}));
 fireEvent.click(screen.getByRole('button',{name:'Usuń',exact:true}));
 await waitFor(()=>expect(mocks.refresh).toHaveBeenCalled());
 expect(api.del).toHaveBeenCalledWith('/campaigns/1/sequences/1');
 expect(screen.queryByRole('textbox',{name:'Temat wiadomości'})).toBeNull();
});

it('uses an accessible preview dialog and restores focus after Escape',async()=>{
 api.post.mockResolvedValue({subject:'Podgląd testowy',body:'Treść',is_html:false});mount();
 const trigger=screen.getByRole('button',{name:'Podgląd',exact:true});trigger.focus();fireEvent.click(trigger);
 const dialog=screen.getByRole('dialog',{name:'Podgląd — krok #1'});
 expect(dialog.contains(document.activeElement)).toBe(true);
 await screen.findByText('Podgląd testowy');
 expect(screen.getByRole('combobox',{name:'Podgląd dla kontaktu'})).toBeTruthy();
 fireEvent.keyDown(document.activeElement,{key:'Escape'});
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(document.activeElement).toBe(trigger);
});
it('allows preview but blocks test-send controls in demo',async()=>{
 mocks.isDemo=true;api.post.mockResolvedValue({subject:'Podgląd testowy',body:'Treść',is_html:false});mount();
 fireEvent.click(screen.getByRole('button',{name:'Podgląd',exact:true}));
 await screen.findByText('Podgląd testowy');
 const recipient=screen.getByRole('textbox',{name:'Adres odbiorcy testu'});
 expect(recipient.disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Wyślij test'}).disabled).toBe(true);
 fireEvent.change(recipient,{target:{value:'qa@example.com'}});
 fireEvent.keyDown(recipient,{key:'Enter'});
 expect(api.post.mock.calls.every(([url])=>url.endsWith('/preview'))).toBe(true);
});
