import {createContext,useContext,useState,useCallback,useRef,useEffect} from 'react';
import {Icon} from '../redesign/ui';
const NotificationContext=createContext(null);
export function NotificationProvider({children}){
 const [notes,setNotes]=useState([]),counter=useRef(0),timers=useRef(new Map());
 const remove=useCallback(id=>{clearTimeout(timers.current.get(id));timers.current.delete(id);setNotes(n=>n.filter(x=>x.id!==id));},[]);
 const add=useCallback(note=>{const id=++counter.current;setNotes(n=>[...n,{...note,id}]);timers.current.set(id,setTimeout(()=>remove(id),note.duration||4500));},[remove]);
 useEffect(()=>()=>{for(const t of timers.current.values())clearTimeout(t);timers.current.clear();},[]);
 return <NotificationContext.Provider value={add}>{children}<div className="sk-toasts" aria-live="polite">{notes.map(n=><div key={n.id} className={`sk-toast ${n.type==='error'?'tone-red':'tone-green'}`} role={n.type==='error'?'alert':'status'}><Icon name={n.type==='error'?'warning':'check'} size={20}/><span>{n.message}</span><button aria-label="Zamknij powiadomienie" onClick={()=>remove(n.id)}><Icon name="close" size={16}/></button></div>)}</div></NotificationContext.Provider>;
}
export function useNotify(){const add=useContext(NotificationContext);if(!add)throw new Error('useNotify must be used within NotificationProvider');return add;}
