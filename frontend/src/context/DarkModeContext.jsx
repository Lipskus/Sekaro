import {createContext,useState,useLayoutEffect,useContext,useCallback} from 'react';
const KEY='sekaro.theme';
export function readThemePreference(){try{const p=localStorage.getItem(KEY)||localStorage.getItem('darkreader');return ['dark','on'].includes(p)?'dark':['light','off'].includes(p)?'light':'system';}catch{return 'system';}}
function resolve(p){return p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);}
const Context=createContext({darkMode:false,themePreference:'system',setThemePreference:()=>{}});
export function DarkModeProvider({children}){
 const [themePreference,setPref]=useState(readThemePreference);
 const [darkMode,setDark]=useState(()=>resolve(readThemePreference()));
 const setThemePreference=useCallback(p=>{if(!['light','dark','system'].includes(p))return;try{localStorage.setItem(KEY,p);localStorage.setItem('darkreader',p);}catch{}setPref(p);},[]);
 useLayoutEffect(()=>{
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  function apply(){const d=resolve(themePreference);document.documentElement.classList.add('sekaro-ui');document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';setDark(d);}
  function sync(e){if(e.key===KEY||e.key==='darkreader')setPref(readThemePreference());}
  apply();media.addEventListener('change',apply);window.addEventListener('storage',sync);
  return()=>{media.removeEventListener('change',apply);window.removeEventListener('storage',sync);};
 },[themePreference]);
 return <Context.Provider value={{darkMode,themePreference,setThemePreference}}>{children}</Context.Provider>;
}
export function useDarkMode(){return useContext(Context);}
