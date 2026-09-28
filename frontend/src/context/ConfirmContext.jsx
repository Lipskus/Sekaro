import {createContext,useContext,useState,useCallback,useRef,useEffect} from 'react';
import Modal from '../redesign/Modal';
import {Button} from '../redesign/ui';
const ConfirmContext=createContext(null);
const destructivePattern=/(usuń|usunąć|usunięcie|delete|remove|revoke|cannot be undone|nie można cofnąć)/i;
function confirmation(input,options={}){
 const config=typeof input==='object'&&input!==null?input:{message:String(input),...options};
 const message=String(config.message??'');
 const danger=config.danger??destructivePattern.test(message);
 return {message,danger,title:config.title||(danger?'Potwierdź usunięcie':'Potwierdź operację'),confirmLabel:config.confirmLabel||(danger?'Usuń':'Potwierdź')};
}
export function ConfirmProvider({children}){
 const [request,setRequest]=useState(null);const pending=useRef(null);
 const confirm=useCallback((input,options)=>new Promise(resolve=>{pending.current?.(false);pending.current=resolve;setRequest(confirmation(input,options));}),[]);
 const finish=useCallback(result=>{const resolve=pending.current;pending.current=null;setRequest(null);resolve?.(result);},[]);
 useEffect(()=>()=>{pending.current?.(false);pending.current=null;},[]);
 return <ConfirmContext.Provider value={confirm}>{children}{request!==null&&<Modal title={request.title} size="small" onClose={()=>finish(false)}><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:14}}>{request.message}</p><div className="sk-form-actions"><Button onClick={()=>finish(false)} autoFocus>Anuluj</Button><Button variant={request.danger?'danger':'primary'} onClick={()=>finish(true)}>{request.confirmLabel}</Button></div></Modal>}</ConfirmContext.Provider>;
}
export function useConfirm(){const confirm=useContext(ConfirmContext);if(!confirm)throw new Error('useConfirm must be used within ConfirmProvider');return confirm;}
