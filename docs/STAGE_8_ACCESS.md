# Etap 8 — użytkownicy, role, zespoły i kalendarz

Jeden pakiet na gałęzi `work/stage-8-users-calendar-2026-10-05`. Bez merge do main i bez wdrożenia przez agenta.

## Zakres dostępu

Administrator zarządza kontami, rolami i zespołami w Ustawieniach → Użytkownicy i uprawnienia. Role mają uprawnienia odczytu/zmian dla CRM, kampanii/harmonogramu, poczty, raportów, szablonów i automatyzacji. Administrator ma pełny dostęp, w tym konfigurację, backup, użytkowników i MCP. Zwykłe role nie mogą nadać administracji.

Uprawnienia są globalne w obrębie modułu jednej instalacji: **nie ma izolacji rekordów między zespołami ani mechanizmu multi-tenant**. Rola bezpośrednia i role zespołów sumują uprawnienia. Interfejs opisuje ten zakres przed zmianą. Usunięcie prawa z jednego źródła nie odbiera go, jeśli nadal nadaje je inne źródło.

Kampanie wymagają także odczytu CRM i poczty (powiązane kontakty/skrzynki). Automatyzacje wymagają odczytu CRM, a ich modyfikacje i wykonania także zmian CRM. Odczyt obejmuje eksport danych danego modułu. Raporty obejmują dane raportowe całej instalacji. Uprawnienie zmian poczty obejmuje zarządzanie skrzynkami i wysyłkę; pozostają istniejące blokady demo/suppression/preflight. Definicje automatyzacji pozostają regułami instalacji, a nie prywatnymi regułami właściciela.

Nowe konta bez roli i zespołu nie mają dostępu do modułów. Dotychczasowe konta admin pozostają administratorami. Dotychczasowe zwykłe konta bez nowego wpisu UserAccess zachowują dostęp do modułów biznesowych; ekran pokazuje „Dotychczasowy dostęp do modułów”. Konfiguracja, backup, klucze i MCP są administrator-only. Pierwszy jawny zapis uprawnień takiego konta zastępuje tryb zgodności rolą wybraną przez administratora.

## Egzekwowanie i audyt

- Każde uwierzytelnione żądanie HTTP korzystające z get_current_user sprawdza bieżące role w bazie — JWT nie jest źródłem praw. Dotyczy ciasteczka, Bearer JWT i obu form klucza API. Nieznane chronione ścieżki wymagają administratora.
- Centralna kontrola obejmuje istniejące API CRM, kalendarza, kontaktów/grup, kampanii, poczty, raportów, szablonów i alternatywne trasy `/api/ui`. Publiczne endpointy nie zostały rozszerzone.
- MCP wymaga administratora, ponieważ jego transport nie przechodzi przez zależności FastAPI poszczególnych operacji.
- Lista użytkowników i historia dostępu są wyłącznie administracyjne. Audyt zmian zawiera autora, czas, przed/po, ID i uprawnienia; nie zapisuje haseł ani kluczy.
- Konta blokowane zamiast usuwane; zachowana historia autorstwa. Blokada unieważnia wszystkie klucze i ustawia granicę czasu ważności sesji. Ponowne włączenie wymaga nowego logowania. Osobna akcja unieważnia sesje/klucze aktywnego konta.
- Aktualizacje wymagają rewizji. PostgreSQL serializuje zmiany dostępu blokadą transakcyjną, w tym kontrolę ostatniego administratora. Nie można odebrać sobie administracji ani wyłączyć własnego konta.
- UI ogranicza nawigację/wyszukiwanie i chroni wejścia do modułów; strony z samym odczytem mają komunikat. Formularz sprzedaży i przycisk edycji kalendarza respektują crm.write. Pozostałe istniejące formularze mogą pozostać widoczne w trybie odczytu, ale zapisy są odrzucane przez API. Uprawnienia w UI odświeżają się wraz z `/auth/me`; API egzekwuje je przy kolejnym żądaniu niezależnie od stanu UI.

## Kalendarz

Kliknięcie zadania/spotkania w kalendarzu otwiera szczegóły: opis, rodzaj/status, termin, miejsce, priorytet, przypomnienie, odroczenie i powiązania. Dopiero „Edytuj” otwiera istniejący formularz z rewizją. Zamknięcie podglądu nie zapisuje ani nie pyta o odrzucenie zmian. PL/EN/DE/RU i wspólne tokeny stylu.

## Migracja

Pięć nowych tabel: access_role, access_team, access_member, user_access, access_audit. Tworzone addytywnie przez istniejący create_all. Bez usuwania/zmiany istniejących kontaktów, użytkowników lub historii. Brak dodatkowego kontenera. Backup pełnej bazy obejmuje nowe tabele. Tokeny sprzed aktualizacji nadal działają, dopóki administrator nie unieważni sesji danego konta. Uprawnienia aktualnego konta administratora demo nie są zmieniane przez samo wdrożenie.

## Weryfikacja i odbiór

Pełny backend: 575 zaliczonych, 9 pominiętych. Po rozszerzeniu testów: 6/6 testów dostępu z prawdziwą walidacją JWT/API key (bez podmiany get_current_user): role, zespoły, odczyt, odmowa zapisu, cofnięcie roli, blokada i ponowne włączenie konta, revocation, stare rewizje, legacy, alternatywne ścieżki i eksport. Testy używają SQLite, nie potwierdzają współbieżności PostgreSQL.

Odbiór demo po wspólnym wdrożeniu: administrator tworzy rolę odczytu CRM, konto i zespół; oddzielna sesja użytkownika sprawdza odczyt oraz odmowę zapisu; administrator zmienia/odbiera rolę i blokuje konto; historia oraz kalendarz szczegóły→edycja. Bez wysyłki i bez odbierania administracji kontu operatora. Dark/mobile i odbiór wizualny demo pozostają do wykonania po wdrożeniu.

Frontend: pełny przebieg 257/261; cztery testy diagnostyki wymagały ustawienia roli admin w starych atrapach kont. Po poprawieniu tych atrap i dodaniu testu odmowy pobierania diagnostyki dla zwykłego użytkownika: końcowy przebieg dostępu/kalendarza/diagnostyki 15/15. Wcześniejszy przebieg przerwano po znalezieniu zależności efektu wyszukiwania Shell od całego obiektu użytkownika; zależność zastąpiono stabilnymi polami ID/rola/uprawnienia. Produkcyjny build poprawny, pozostaje znane ostrzeżenie o dużym bundlu.
