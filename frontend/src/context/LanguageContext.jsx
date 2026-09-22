import { createContext, useContext, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

export const SUPPORTED_LANGUAGES = [
  { code: 'pl', label: 'Polski' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
];

const translations = {
  pl: {
    common: {
      appName: 'Sekaro',
      email: 'E-mail',
      password: 'Hasło',
      confirmPassword: 'Powtórz hasło',
      signIn: 'Zaloguj się',
      createAdmin: 'Utwórz konto administratora',
      creatingAccount: 'Tworzenie konta…',
      signingIn: 'Logowanie…',
    },
    auth: {
      createAdminTitle: 'Utwórz konto administratora',
      signInTitle: 'Zaloguj się do konta',
      firstAccountAdmin: 'Pierwsze utworzone konto zostanie administratorem.',
      passwordHint: 'Minimum 8 znaków, w tym duża litera, mała litera i cyfra.',
      emailRequired: 'Podaj adres e-mail.',
      passwordRequired: 'Podaj hasło.',
      passwordsMismatch: 'Hasła nie są takie same.',
      authFailed: 'Logowanie nie powiodło się.',
    },
    nav: {
      analytics: 'Analityka',
      campaigns: 'Kampanie',
      leads: 'Kontakty',
      inboxes: 'Skrzynki',
      unibox: 'Odebrane',
      schedule: 'Harmonogram',
      notifications: 'Powiadomienia',
      settings: 'Ustawienia',
      health: 'Stan systemu',
      help: 'Pomoc',
      tour: 'Samouczek',
      deliverability: 'Dostarczalność',
      reportBug: 'Zgłoś błąd',
      suggestFeature: 'Zaproponuj funkcję',
    },
  },
  en: {
    common: {
      appName: 'Sekaro',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm password',
      signIn: 'Sign in',
      createAdmin: 'Create admin account',
      creatingAccount: 'Creating account…',
      signingIn: 'Signing in…',
    },
    auth: {
      createAdminTitle: 'Create your admin account',
      signInTitle: 'Sign in to your account',
      firstAccountAdmin: 'The first account created becomes the admin.',
      passwordHint: 'Use at least 8 characters with an uppercase letter, lowercase letter, and a number.',
      emailRequired: 'Enter your email address.',
      passwordRequired: 'Enter your password.',
      passwordsMismatch: 'Passwords do not match.',
      authFailed: 'Authentication failed.',
    },
    nav: {
      analytics: 'Analytics',
      campaigns: 'Campaigns',
      leads: 'Leads',
      inboxes: 'Inboxes',
      unibox: 'Unibox',
      schedule: 'Schedule',
      notifications: 'Notifications',
      settings: 'Settings',
      health: 'System Health',
      help: 'Help',
      tour: 'App Tour',
      deliverability: 'Deliverability Tips',
      reportBug: 'Report a Bug',
      suggestFeature: 'Suggest a Feature',
    },
  },
  de: {
    common: {
      appName: 'Sekaro',
      email: 'E-Mail',
      password: 'Passwort',
      confirmPassword: 'Passwort bestätigen',
      signIn: 'Anmelden',
      createAdmin: 'Administratorkonto erstellen',
      creatingAccount: 'Konto wird erstellt…',
      signingIn: 'Anmeldung…',
    },
    auth: {
      createAdminTitle: 'Administratorkonto erstellen',
      signInTitle: 'Bei Sekaro anmelden',
      firstAccountAdmin: 'Das erste erstellte Konto wird Administrator.',
      passwordHint: 'Mindestens 8 Zeichen mit Großbuchstaben, Kleinbuchstaben und einer Zahl.',
      emailRequired: 'E-Mail-Adresse eingeben.',
      passwordRequired: 'Passwort eingeben.',
      passwordsMismatch: 'Die Passwörter stimmen nicht überein.',
      authFailed: 'Anmeldung fehlgeschlagen.',
    },
    nav: {
      analytics: 'Analysen',
      campaigns: 'Kampagnen',
      leads: 'Kontakte',
      inboxes: 'Postfächer',
      unibox: 'Posteingang',
      schedule: 'Zeitplan',
      notifications: 'Benachrichtigungen',
      settings: 'Einstellungen',
      health: 'Systemstatus',
      help: 'Hilfe',
      tour: 'Einführung',
      deliverability: 'Zustellbarkeit',
      reportBug: 'Fehler melden',
      suggestFeature: 'Funktion vorschlagen',
    },
  },
  ru: {
    common: {
      appName: 'Sekaro',
      email: 'Эл. почта',
      password: 'Пароль',
      confirmPassword: 'Повторите пароль',
      signIn: 'Войти',
      createAdmin: 'Создать администратора',
      creatingAccount: 'Создание аккаунта…',
      signingIn: 'Вход…',
    },
    auth: {
      createAdminTitle: 'Создать аккаунт администратора',
      signInTitle: 'Войти в Sekaro',
      firstAccountAdmin: 'Первый созданный аккаунт станет администратором.',
      passwordHint: 'Минимум 8 символов: заглавная буква, строчная буква и цифра.',
      emailRequired: 'Введите адрес электронной почты.',
      passwordRequired: 'Введите пароль.',
      passwordsMismatch: 'Пароли не совпадают.',
      authFailed: 'Не удалось войти.',
    },
    nav: {
      analytics: 'Аналитика',
      campaigns: 'Кампании',
      leads: 'Контакты',
      inboxes: 'Почтовые ящики',
      unibox: 'Входящие',
      schedule: 'Расписание',
      notifications: 'Уведомления',
      settings: 'Настройки',
      health: 'Состояние системы',
      help: 'Помощь',
      tour: 'Обзор приложения',
      deliverability: 'Доставляемость',
      reportBug: 'Сообщить об ошибке',
      suggestFeature: 'Предложить функцию',
    },
  },
};

function getNested(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem('sekaro.language');
    if (translations[saved]) return saved;
  } catch {
    // ignore storage errors
  }
  return 'pl';
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  const setLanguage = (code) => {
    if (!translations[code]) return;
    setLanguageState(code);
    try {
      localStorage.setItem('sekaro.language', code);
    } catch {
      // ignore storage errors
    }
  };

  const value = useMemo(() => ({
    language,
    setLanguage,
    languages: SUPPORTED_LANGUAGES,
    t: (key) => getNested(translations[language], key) ?? getNested(translations.en, key) ?? key,
  }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
