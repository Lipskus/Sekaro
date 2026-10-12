import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import workspace from '../i18n/workspace.json';
import contacts from '../i18n/contacts.json';
import outreach from '../i18n/outreach.json';

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
      accessPrivatePanel: 'Dostęp do prywatnego panelu',
      adminEmail: 'E-mail administratora',
      emailOrLogin: 'E-mail lub login',
      createPassword: 'Utwórz bezpieczne hasło',
      enterPassword: 'Wpisz swoje hasło',
      showPassword: 'Pokaż hasło',
      hidePassword: 'Ukryj hasło',
      rememberMe: 'Zapamiętaj mnie',
      forgotPassword: 'Nie pamiętasz hasła?',
      or: 'lub',
      privateLogin: 'Panel prywatny • Brak logowania przez Google i Microsoft',
    },
    nav: {
      companies: 'Firmy',
      sales: 'Sprzedaż',
      dashboard: 'Dashboard',
      analytics: 'Analityka',
      campaigns: 'Kampanie',
      leads: 'Kontakty',
      templates: 'Szablony',
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
      domains: 'Domeny',
    },
    shell: {
      skipToContent: 'Przejdź do treści',
      mainNavigation: 'Nawigacja główna', search: 'Szukaj w Sekaro', searchPlaceholder: 'Szukaj kontaktów, kampanii, wiadomości…',
      notifications: 'Powiadomienia', openMenu: 'Otwórz menu', closeMenu: 'Zamknij menu', settings: 'Ustawienia', queue: 'Kolejka wysyłki',
      language: 'Język', logout: 'Wyloguj się', administrator: 'Administrator', user: 'Użytkownik', system: 'System', version: 'Wersja',
      environment: 'Środowisko', demo: 'DEMO', production: 'Produkcja', test: 'Testowe', disk: 'Dysk', noData: 'Brak danych', free: 'wolne',
      allGood: 'Wszystko działa', needsAttention: 'Wymaga uwagi', problem: 'Wykryto problem', unknown: 'Stan nieznany', checking: 'Sprawdzanie…',
      selfHostedMotto: 'Twoje dane. Twoje zasady.', searching: 'Wyszukiwanie…', noResults: 'Brak wyników.', searchFailed: 'Nie udało się wyszukać danych.',
      searchMessages: 'Szukaj w wiadomościach', campaign: 'Kampania', template: 'Szablon', diskUsage: 'Wykorzystanie dysku',
    },
    appearance: { loginSettings: 'Ustawienia logowania', language: 'Język', theme: 'Motyw', light: 'Jasny motyw', dark: 'Ciemny motyw', system: 'Motyw systemowy', title: 'Wygląd i język', description: 'Dostosuj wygląd interfejsu do swoich preferencji.', savedLocally: 'Zmiana języka jest zapisywana lokalnie dla tej przeglądarki.', systemFollows: 'Motyw systemowy automatycznie podąża za ustawieniem systemu operacyjnego lub przeglądarki.', cancel: 'Anuluj', save: 'Zapisz zmiany', saving: 'Zapisywanie…', saved: 'Ustawienia zapisane.', unsaved: 'Masz niezapisane ustawienia ogólne.', unchanged: 'Brak niezapisanych zmian.' },
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
      accessPrivatePanel: 'Access to the private dashboard',
      adminEmail: 'Administrator email',
      emailOrLogin: 'Email or username',
      createPassword: 'Create a secure password',
      enterPassword: 'Enter your password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      rememberMe: 'Remember me',
      forgotPassword: 'Forgot your password?',
      or: 'or',
      privateLogin: 'Private dashboard • No Google or Microsoft sign-in',
    },
    nav: {
      companies: 'Companies',
      sales: 'Sales',
      dashboard: 'Dashboard',
      analytics: 'Analytics',
      campaigns: 'Campaigns',
      leads: 'Leads',
      templates: 'Templates',
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
      domains: 'Domains',
    },
    shell: {
      skipToContent: 'Skip to content',
      mainNavigation: 'Main navigation', search: 'Search Sekaro', searchPlaceholder: 'Search contacts, campaigns, messages…',
      notifications: 'Notifications', openMenu: 'Open menu', closeMenu: 'Close menu', settings: 'Settings', queue: 'Sending queue',
      language: 'Language', logout: 'Sign out', administrator: 'Administrator', user: 'User', system: 'System', version: 'Version',
      environment: 'Environment', demo: 'DEMO', production: 'Production', test: 'Test', disk: 'Disk', noData: 'No data', free: 'free',
      allGood: 'All systems operational', needsAttention: 'Needs attention', problem: 'Problem detected', unknown: 'Status unknown', checking: 'Checking…',
      selfHostedMotto: 'Your data. Your rules.', searching: 'Searching…', noResults: 'No results.', searchFailed: 'Search failed.',
      searchMessages: 'Search messages', campaign: 'Campaign', template: 'Template', diskUsage: 'Disk usage',
    },
    appearance: { loginSettings: 'Login settings', language: 'Language', theme: 'Theme', light: 'Light theme', dark: 'Dark theme', system: 'System theme', title: 'Appearance and language', description: 'Customize the interface to your preferences.', savedLocally: 'The language is stored locally for this browser.', systemFollows: 'The system theme automatically follows your operating system or browser setting.', cancel: 'Cancel', save: 'Save changes', saving: 'Saving…', saved: 'Settings saved.', unsaved: 'You have unsaved general settings.', unchanged: 'No unsaved changes.' },
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
      accessPrivatePanel: 'Zugang zum privaten Bereich',
      adminEmail: 'Administrator-E-Mail',
      emailOrLogin: 'E-Mail oder Benutzername',
      createPassword: 'Sicheres Passwort erstellen',
      enterPassword: 'Passwort eingeben',
      showPassword: 'Passwort anzeigen',
      hidePassword: 'Passwort ausblenden',
      rememberMe: 'Angemeldet bleiben',
      forgotPassword: 'Passwort vergessen?',
      or: 'oder',
      privateLogin: 'Privater Bereich • Keine Anmeldung über Google oder Microsoft',
    },
    nav: {
      companies: 'Firmen',
      sales: 'Vertrieb',
      dashboard: 'Übersicht',
      analytics: 'Analysen',
      campaigns: 'Kampagnen',
      leads: 'Kontakte',
      templates: 'Vorlagen',
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
      domains: 'Domains',
    },
    shell: {
      skipToContent: 'Zum Inhalt springen',
      mainNavigation: 'Hauptnavigation', search: 'Sekaro durchsuchen', searchPlaceholder: 'Kontakte, Kampagnen und Nachrichten suchen…',
      notifications: 'Benachrichtigungen', openMenu: 'Menü öffnen', closeMenu: 'Menü schließen', settings: 'Einstellungen', queue: 'Sende-Warteschlange',
      language: 'Sprache', logout: 'Abmelden', administrator: 'Administrator', user: 'Benutzer', system: 'System', version: 'Version',
      environment: 'Umgebung', demo: 'DEMO', production: 'Produktion', test: 'Test', disk: 'Speicher', noData: 'Keine Daten', free: 'frei',
      allGood: 'Alles funktioniert', needsAttention: 'Aufmerksamkeit nötig', problem: 'Problem erkannt', unknown: 'Status unbekannt', checking: 'Prüfung…',
      selfHostedMotto: 'Deine Daten. Deine Regeln.', searching: 'Suche…', noResults: 'Keine Ergebnisse.', searchFailed: 'Suche fehlgeschlagen.',
      searchMessages: 'Nachrichten durchsuchen', campaign: 'Kampagne', template: 'Vorlage', diskUsage: 'Speichernutzung',
    },
    appearance: { loginSettings: 'Anmeldeeinstellungen', language: 'Sprache', theme: 'Design', light: 'Helles Design', dark: 'Dunkles Design', system: 'Systemdesign', title: 'Darstellung und Sprache', description: 'Passe die Oberfläche an deine Präferenzen an.', savedLocally: 'Die Sprache wird lokal für diesen Browser gespeichert.', systemFollows: 'Das Systemdesign folgt automatisch der Einstellung des Betriebssystems oder Browsers.', cancel: 'Abbrechen', save: 'Änderungen speichern', saving: 'Speichern…', saved: 'Einstellungen gespeichert.', unsaved: 'Es gibt ungespeicherte allgemeine Einstellungen.', unchanged: 'Keine ungespeicherten Änderungen.' },
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
      accessPrivatePanel: 'Доступ к приватной панели',
      adminEmail: 'E-mail администратора',
      emailOrLogin: 'E-mail или логин',
      createPassword: 'Создайте надёжный пароль',
      enterPassword: 'Введите пароль',
      showPassword: 'Показать пароль',
      hidePassword: 'Скрыть пароль',
      rememberMe: 'Запомнить меня',
      forgotPassword: 'Забыли пароль?',
      or: 'или',
      privateLogin: 'Приватная панель • Без входа через Google и Microsoft',
    },
    nav: {
      companies: 'Компании',
      sales: 'Продажи',
      dashboard: 'Панель',
      analytics: 'Аналитика',
      campaigns: 'Кампании',
      leads: 'Контакты',
      templates: 'Шаблоны',
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
      domains: 'Домены',
    },
    shell: {
      skipToContent: 'Перейти к содержимому',
      mainNavigation: 'Основная навигация', search: 'Поиск в Sekaro', searchPlaceholder: 'Поиск контактов, кампаний и сообщений…',
      notifications: 'Уведомления', openMenu: 'Открыть меню', closeMenu: 'Закрыть меню', settings: 'Настройки', queue: 'Очередь отправки',
      language: 'Язык', logout: 'Выйти', administrator: 'Администратор', user: 'Пользователь', system: 'Система', version: 'Версия',
      environment: 'Среда', demo: 'DEMO', production: 'Продакшен', test: 'Тестовая', disk: 'Диск', noData: 'Нет данных', free: 'свободно',
      allGood: 'Всё работает', needsAttention: 'Требует внимания', problem: 'Обнаружена проблема', unknown: 'Статус неизвестен', checking: 'Проверка…',
      selfHostedMotto: 'Ваши данные. Ваши правила.', searching: 'Поиск…', noResults: 'Нет результатов.', searchFailed: 'Ошибка поиска.',
      searchMessages: 'Искать в сообщениях', campaign: 'Кампания', template: 'Шаблон', diskUsage: 'Использование диска',
    },
    appearance: { loginSettings: 'Настройки входа', language: 'Язык', theme: 'Тема', light: 'Светлая тема', dark: 'Тёмная тема', system: 'Системная тема', title: 'Внешний вид и язык', description: 'Настройте интерфейс по своим предпочтениям.', savedLocally: 'Язык сохраняется локально для этого браузера.', systemFollows: 'Системная тема автоматически следует настройкам операционной системы или браузера.', cancel: 'Отмена', save: 'Сохранить изменения', saving: 'Сохранение…', saved: 'Настройки сохранены.', unsaved: 'Есть несохранённые общие настройки.', unchanged: 'Нет несохранённых изменений.' },
  },
};

// Values are interpolated as plain React text, never as HTML or template code.
export function translate(language, key, params = {}) {
  const namespace = key.split('.')[0];
  const modules = {workspace, contacts, outreach};
  const dictionaries = modules[namespace] ?? translations;
  const lookup = modules[namespace] ? key.slice(namespace.length + 1) : key;
  const message = getNested(dictionaries[language], lookup) ?? getNested(dictionaries.en, lookup) ?? key;
  return typeof message === 'string' ? message.replace(/\{(\w+)\}/g, (token, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token) : message;
}

// Shared UI primitives can also render standalone (e.g. component previews).
// In the application they always consume the existing LanguageProvider.
const defaultUiLanguage = {language: 'pl', t: (key, params) => translate('pl', key, params)};
export function useUiLanguage() {
  return useContext(LanguageContext) ?? defaultUiLanguage;
}

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

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    languages: SUPPORTED_LANGUAGES,
    t: (key, params) => translate(language, key, params),
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
