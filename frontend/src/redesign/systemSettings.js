export const systemSettingsGroups = [
  { label: 'System', items: [
    { id: 'general', label: 'Ogólne', icon: 'settings', description: 'Najważniejsze ustawienia Twojej instalacji.', keywords: 'harmonogram planowanie priorytet wysyłka' },
    { id: 'appearance', label: 'Wygląd i język', icon: 'sun', description: 'Dostosuj motyw i język interfejsu.', keywords: 'jasny ciemny dark light system polski' },
    { id: 'account', label: 'Konto i bezpieczeństwo', icon: 'shield', description: 'Informacje o zalogowanym użytkowniku i sesji.', keywords: 'użytkownik administrator sesja wyloguj' },
    { id: 'known-ips', label: 'Znane adresy IP', icon: 'globe', description: 'Wyklucz własne otwarcia i kliknięcia ze statystyk.', keywords: 'tracking statystyki adresy' },
  ]},
  { label: 'Dane', items: [
    { id: 'backup-restore', label: 'Kopia i przywracanie', icon: 'history', description: 'Zabezpiecz dane oraz konfigurację swojej instalacji.', keywords: 'backup baza szyfrowanie hasło harmonogram pobierz przywróć', admin: true },
  ]},
  { label: 'Funkcje', items: [
    { id: 'ai', label: 'Funkcje AI', icon: 'flash', description: 'Dostawcy, modele i konfiguracja poszczególnych funkcji AI.', keywords: 'model dostawca klucz test sztuczna inteligencja' },
    { id: 'verification', label: 'Weryfikacja e-mail', icon: 'mail', description: 'Sprawdzaj adresy kontaktów przed wysyłką.', keywords: 'email mailtester api walidacja' },
    { id: 'other', label: 'Pozostałe', icon: 'more', description: 'Pozostałe funkcje i preferencje powiadomień.', keywords: 'powiadomienia historia' },
  ]},
  { label: 'Integracje', items: [
    { id: 'api-keys', label: 'Klucze API', icon: 'lock', description: 'Zarządzaj dostępem aplikacji do prywatnego API Sekaro.', keywords: 'token integracja dostęp' },
    { id: 'webhooks', label: 'Webhooki', icon: 'link', description: 'Przekazuj wybrane zdarzenia do swoich integracji.', keywords: 'endpoint url zdarzenia post test sekret' },
    { id: 'mcp', label: 'MCP', icon: 'stack', description: 'Połącz narzędzia AI z instancją Sekaro.', keywords: 'cursor agent json endpoint' },
  ]},
  { label: 'Zaawansowane', items: [
    { id: 'test-mode', label: 'Tryb testowy', icon: 'warning', description: 'Symuluj wysyłkę w środowisku testowym.', keywords: 'symulacja development', development: true },
  ]},
];
export const normalizeSettingsSearch = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLocaleLowerCase('pl').trim();
export function settingsGroupsFor({ isProduction = true, isAdmin = false, search = '' } = {}) {
  const query = normalizeSettingsSearch(search);
  return systemSettingsGroups.map(group => ({ ...group, items: group.items.filter(item =>
    (!item.admin || isAdmin) && (!item.development || !isProduction) &&
    (!query || normalizeSettingsSearch(item.label + ' ' + item.keywords).includes(query))
  ) })).filter(group => group.items.length);
}
export function resolveSettingsSection(hash, items) {
  const aliases = { setup: 'backup-restore', features: 'ai', integrating: 'api-keys', dev: 'test-mode', scheduling: 'general' };
  const value = hash.replace(/^#/, '').replace(/^settings-/, '') || 'general';
  const id = aliases[value] || value;
  return items.some(item => item.id === id) ? id : 'general';
}
