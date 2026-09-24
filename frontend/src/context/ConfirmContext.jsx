import {createContext,useContext,useState,useCallback,useRef,useEffect} from 'react';
import Modal from '../redesign/Modal';
import {Button} from '../redesign/ui';
const ConfirmContext=createContext(null);
export function ConfirmProvider({children}){
 const [message,setMessage]=useState(null);const pending=useRef(null);
 const confirm=useCallback(text=>new Promise(resolve=>{pending.current?.(false);pending.current=resolve;setMessage(String(text));}),[]);
 const finish=useCallback(result=>{const resolve=pending.current;pending.current=null;setMessage(null);resolve?.(result);},[]);
 useEffect(()=>()=>{pending.current?.(false);pending.current=null;},[]);
 return <ConfirmContext.Provider value={confirm}>{children}{message!==null&&<Modal title="Potwierdź operację" size="small" onClose={()=>finish(false)}><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:14}}>{message}</p><div className="sk-form-actions"><Button onClick={()=>finish(false)} autoFocus>Anuluj</Button><Button variant="primary" onClick={()=>finish(true)}>Potwierdź</Button></div></Modal>}</ConfirmContext.Provider>;
}
export function useConfirm(){const confirm=useContext(ConfirmContext);if(!confirm)throw new Error('useConfirm must be used within ConfirmProvider');return confirm;}
