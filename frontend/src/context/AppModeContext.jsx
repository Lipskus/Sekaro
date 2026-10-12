import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AppModeContext = createContext({ mode: 'development' });

export function AppModeProvider({ children }) {
  const [mode, setMode] = useState('development');
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    api.get('/status')
      .then(data => {
        setMode(data.app_mode || 'development');
        setIsDemo(data.demo === true);
      })
      .catch(() => {});
  }, []);

  return (
    <AppModeContext.Provider value={{ mode, isProduction: mode === 'production', isDemo }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
