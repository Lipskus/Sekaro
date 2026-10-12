import React from 'react';
import Shell from '../redesign/Shell';
import TestModeBanner from './TestModeBanner';
import Welcome from '../redesign/Welcome';
import { NotificationProvider } from '../context/NotificationContext';
import { LoadingProvider } from '../context/LoadingContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { UniboxNotificationsProvider } from '../context/UniboxNotificationsContext';
import { AppModeProvider, useAppMode } from '../context/AppModeContext';
import { OnboardingProvider } from '../context/OnboardingContext';

function LayoutInner({ children }) {
  const { isProduction } = useAppMode();
  return <Shell><Welcome/>{!isProduction && <TestModeBanner />}{children}</Shell>;
}

export default function Layout({ children }) {
  return (
    <NotificationProvider>
      <LoadingProvider>
        <ConfirmProvider>
          <UniboxNotificationsProvider>
            <AppModeProvider>
              <OnboardingProvider>
                <LayoutInner>
                  {children}
                </LayoutInner>
              </OnboardingProvider>
            </AppModeProvider>
          </UniboxNotificationsProvider>
        </ConfirmProvider>
      </LoadingProvider>
    </NotificationProvider>
  );
}
