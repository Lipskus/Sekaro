import {useUiLanguage} from '../context/LanguageContext';
import {useEffect,useRef,useId} from 'react';
import {Icon} from './ui';

// Shared by nested dialogs so closing a child never unlocks the background.
const openDialogs=[];
let previousOverflow='';
const focusableSelector='button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]';
function focusableElements(box){
 return [...box.querySelectorAll(focusableSelector)].filter(node=>{
  if(node.closest('[hidden],[inert]'))return false;
  for(let parent=node;parent&&parent!==box;parent=parent.parentElement){
   const style=getComputedStyle(parent);
   if(style.display==='none'||style.visibility==='hidden')return false;
  }
  return true;
 });
}

export default function Modal({title,children,footer,onClose,small=false,size,busy=false,drawer=false}){
 const {t}=useUiLanguage();
 const ref=useRef(null),id=useId(),closeRef=useRef(onClose),busyRef=useRef(busy);
 closeRef.current=onClose;busyRef.current=busy;
 useEffect(()=>{
  const prev=document.activeElement,box=ref.current;
  if(!openDialogs.length){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  openDialogs.push(box);
  (focusableElements(box)[0]||box).focus();
  const key=e=>{
   if(openDialogs.at(-1)!==box)return;
   if(e.key==='Escape'){
    e.preventDefault();e.stopPropagation();
    if(!busyRef.current)closeRef.current();
   }
   if(e.key==='Tab'){
    const all=focusableElements(box),first=all[0],last=all.at(-1);
    if(!all.length){e.preventDefault();box.focus();return;}
    if(!box.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first).focus();}
    else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',key);
  return()=>{
   document.removeEventListener('keydown',key);
   const wasTop=openDialogs.at(-1)===box;
   const index=openDialogs.indexOf(box);if(index!==-1)openDialogs.splice(index,1);
   if(!openDialogs.length)document.body.style.overflow=previousOverflow;
   if(wasTop&&prev?.isConnected)prev.focus?.();
  };
 },[]);
 // Disabling the active submit button may move browser focus to the body.
 // Restore it when an asynchronous operation changes the enabled controls.
 useEffect(()=>{
  const box=ref.current;
  if(openDialogs.at(-1)===box&&!box.contains(document.activeElement)){
   (focusableElements(box)[0]||box).focus();
  }
 },[busy]);
 return <div className={`sk-modal-backdrop ${drawer?'sk-modal-backdrop-drawer':''}`} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={ref} tabIndex={-1} className={`sk-modal ${small||size==='small'?'small':''} ${drawer?'sk-modal-drawer':''}`} role="dialog" aria-modal="true" aria-labelledby={id}><header className="sk-modal-header"><h2 id={id}>{title}</h2><button type="button" className="sk-icon-button" aria-label={t('workspace.closeDialog')} onClick={onClose} disabled={busy}><Icon name="close"/></button></header><div className="sk-modal-body">{children}</div>{footer&&<footer className="sk-modal-footer">{footer}</footer>}</section></div>;
}
