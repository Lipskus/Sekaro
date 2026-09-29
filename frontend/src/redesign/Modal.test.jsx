import React,{useState} from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import Modal from './Modal';
afterEach(()=>{cleanup();document.body.style.overflow='';});
function Example(){
 const [parent,setParent]=useState(false),[child,setChild]=useState(false);
 return <><button onClick={()=>setParent(true)}>Open parent</button>{parent&&<Modal title="Parent" onClose={()=>setParent(false)}><button onClick={()=>setChild(true)}>Open child</button><button>Last parent action</button>{child&&<Modal title="Child" onClose={()=>setChild(false)}><button>Child action</button></Modal>}</Modal>}</>;
}
it('locks the background until the last nested dialog closes and restores focus in order',()=>{
 document.body.style.overflow='auto';render(<Example/>);
 const trigger=screen.getByText('Open parent');trigger.focus();fireEvent.click(trigger);
 expect(document.body.style.overflow).toBe('hidden');
 const childTrigger=screen.getByText('Open child');childTrigger.focus();fireEvent.click(childTrigger);
 fireEvent.keyDown(document.activeElement,{key:'Escape'});
 expect(screen.queryByRole('dialog',{name:'Child'})).toBeNull();
 expect(screen.getByRole('dialog',{name:'Parent'})).toBeTruthy();
 expect(document.activeElement).toBe(childTrigger);
 expect(document.body.style.overflow).toBe('hidden');
 fireEvent.keyDown(document.activeElement,{key:'Escape'});
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(document.body.style.overflow).toBe('auto');expect(document.activeElement).toBe(trigger);
});
it('cycles keyboard focus through enabled visible controls only',()=>{
 render(<Modal title="Keyboard" onClose={()=>{}}><input disabled aria-label="Disabled"/><button hidden>Hidden</button><button>Last action</button></Modal>);
 const first=screen.getByRole('button',{name:'Zamknij okno'}),last=screen.getByText('Last action');
 expect(document.activeElement).toBe(first);
 fireEvent.keyDown(first,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(last);
 fireEvent.keyDown(last,{key:'Tab'});expect(document.activeElement).toBe(first);
});
it('keeps a busy dialog open and focuses its container if every control is disabled',()=>{
 let closed=false;render(<Modal title="Busy" busy onClose={()=>{closed=true;}}><input disabled/></Modal>);
 const dialog=screen.getByRole('dialog',{name:'Busy'});
 expect(document.activeElement).toBe(dialog);
 fireEvent.keyDown(dialog,{key:'Escape'});fireEvent.keyDown(dialog,{key:'Tab'});
 expect(closed).toBe(false);expect(document.activeElement).toBe(dialog);
});

it('recovers focus when a pending operation disables the previously focused control',()=>{
 const {rerender}=render(<Modal title="Async" onClose={()=>{}}><button>Import</button></Modal>);
 document.activeElement.blur();
 rerender(<Modal title="Async" busy onClose={()=>{}}><button disabled>Import</button></Modal>);
 expect(document.activeElement).toBe(screen.getByRole('dialog',{name:'Async'}));
 rerender(<Modal title="Async" onClose={()=>{}}><button>Import</button></Modal>);
 expect(screen.getByRole('dialog',{name:'Async'}).contains(document.activeElement)).toBe(true);
});
