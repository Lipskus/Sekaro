import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/react';
import {LanguageProvider,useLanguage,translate} from './LanguageContext';
import {ConfirmProvider} from './ConfirmContext';
import ContactImport from '../redesign/ContactImport';
import FieldManager from '../redesign/FieldManager';
import {api} from '../api';
import copy from '../i18n/workspace.json';
vi.mock('../api',()=>({api:{upload:vi.fn(),uploadMultipart:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()}}));
function SwitchLanguage(){const {setLanguage}=useLanguage();return <nav>{['pl','en','de','ru'].map(code=><button key={code} onClick={()=>setLanguage(code)}>{code}</button>)}</nav>;}
function mount(child){return render(<LanguageProvider><ConfirmProvider><SwitchLanguage/>{child}</ConfirmProvider></LanguageProvider>);}
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();});
afterEach(()=>{cleanup();localStorage.clear();});

it('keeps interpolation parameters literal, including braces, markup and dollar signs',()=>{
 const name='<img src=x onerror=alert(1)> $& {column}';
 expect(translate('de','workspace.mapping',{column:name})).toBe(`Zuordnung für ${name}`);
 expect(translate('unknown','workspace.close')).toBe('Close');
});

it.each(['pl','en','de','ru'])('imports in %s without changing column keys or user data',async language=>{
 localStorage.setItem('sekaro.language',language);
 const t=copy[language],done=vi.fn();
 const file=new File(['email,name'], 'Kontakty klienta.csv',{type:'text/csv'});
 api.upload.mockResolvedValue({headers:['email','Nazwa klienta'],suggested_mapping:{email:'email','Nazwa klienta':'name'},total_rows:1,sample_rows:[{email:'qa@example.test','Nazwa klienta':'Żółć & <b>firma</b>'}]});
 api.uploadMultipart.mockResolvedValue({added:1,updated:0,duplicates_in_file:0,skipped_suppressed:0,invalid_count:0});
 mount(<ContactImport file={file} onClose={vi.fn()} onDone={done}/>);
 expect(screen.getByRole('dialog',{name:t.importTitle})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:t.readFile}));
 await screen.findByText('Żółć & <b>firma</b>');
 expect(document.querySelector('.sk-import-mapping b')).toBeNull();
 fireEvent.change(screen.getByRole('textbox',{name:t.contactList}),{target:{value:'Moja lista'}});
 fireEvent.click(screen.getByRole('button',{name:t.importAction,exact:true}));
 await screen.findByRole('heading',{name:t.importDone});
 expect(api.uploadMultipart).toHaveBeenCalledWith('/leads/import',file,{mapping_json:{email:'email','Nazwa klienta':'name'},duplicate_mode:'merge',list_name:'Moja lista'});
 expect(done).toHaveBeenCalledTimes(1);
});

it('preserves import mapping, list and duplicate mode while switching language',async()=>{
 api.upload.mockResolvedValue({headers:['adres'],suggested_mapping:{adres:'email'},total_rows:1,sample_rows:[]});
 mount(<ContactImport file={new File(['adres'],'qa.csv')} onClose={vi.fn()} onDone={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:copy.pl.readFile}));
 await screen.findByRole('textbox',{name:copy.pl.contactList});
 fireEvent.change(screen.getByRole('textbox',{name:copy.pl.contactList}),{target:{value:'Niezapisana lista'}});
 fireEvent.change(screen.getByRole('combobox',{name:copy.pl.existingContacts}),{target:{value:'skip'}});
 fireEvent.click(screen.getByRole('button',{name:'de',exact:true}));
 expect(screen.getByRole('textbox',{name:copy.de.contactList}).value).toBe('Niezapisana lista');
 expect(screen.getByRole('combobox',{name:copy.de.existingContacts}).value).toBe('skip');
 expect(screen.getByRole('combobox',{name:'Zuordnung für adres'}).value).toBe('email');
 expect(api.upload).toHaveBeenCalledTimes(1);
 expect(api.uploadMultipart).not.toHaveBeenCalled();
});

it('preserves a custom-field draft and sends stable API type values after changing language',async()=>{
 api.post.mockResolvedValue({id:1});
 mount(<FieldManager fields={[]} onRefresh={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.change(screen.getByRole('textbox',{name:copy.pl.fieldName}),{target:{value:'Region klienta'}});
 fireEvent.change(screen.getByRole('combobox',{name:copy.pl.fieldType}),{target:{value:'select'}});
 fireEvent.change(screen.getByRole('textbox',{name:copy.pl.options}),{target:{value:'Polska\nDeutschland'}});
 fireEvent.click(screen.getByRole('button',{name:'ru',exact:true}));
 expect(screen.getByRole('textbox',{name:copy.ru.fieldName}).value).toBe('Region klienta');
 expect(screen.getByRole('combobox',{name:copy.ru.fieldType}).value).toBe('select');
 expect(screen.getByRole('textbox',{name:copy.ru.options}).value).toBe('Polska\nDeutschland');
 fireEvent.click(screen.getByRole('button',{name:copy.ru.createField}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/contact-fields',{key:'region_klienta',label:'Region klienta',field_type:'select',options:['Polska','Deutschland']}));
});

it.each(['de','ru'])('keeps destructive confirmation explicit in %s and cancellation prevents deletion',async language=>{
 localStorage.setItem('sekaro.language',language);
 const t=copy[language];
 mount(<FieldManager fields={[{id:12,key:'region',label:'Region klienta',field_type:'text'}]} onRefresh={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:translate(language,'workspace.deleteFieldNamed',{name:'Region klienta'})}));
 const dialog=await screen.findByRole('dialog',{name:t.confirmDelete});
 expect(within(dialog).getByRole('button',{name:t.delete,exact:true}).className).toContain('sk-btn-danger');
 expect(within(dialog).getByText(translate(language,'workspace.removeField',{name:'Region klienta'}))).toBeTruthy();
 fireEvent.click(within(dialog).getByRole('button',{name:t.cancel}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(api.del).not.toHaveBeenCalled();
});
