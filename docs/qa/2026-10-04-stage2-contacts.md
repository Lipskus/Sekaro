# Etap 2 — zbiorczy pakiet kontaktów i historii, 04.10.2026

Baza: `8f5c7b47c52c812abe103216daba2070eea7d58c`.
Branch: `work/stage-2-contacts-history-2026-10-04`.
Zakres: wyłącznie etap 2 zatwierdzonego planu 11 etapów.

## Zachowanie

- Archiwizacja i przywracanie pojedynczych/zaznaczonych kontaktów, widok archiwum
  i filtrowany eksport. PL/EN/DE/RU.
- Ten sam Lead i ID, bez usuwania maili, odpowiedzi, list czy enrollmentów.
- Archiwizacja usuwa przyszłe sloty bez rozpoczętej próby wysyłki i trwale
  pauzuje enrollmenty. Zachowuje niepewne SendAttempt do istniejącej obsługi.
- Wszystkie trzy ścieżki harmonogramu pomijają archiwum i pauzę po archiwizacji.
  Nadawca sprawdza stan ponownie bezpośrednio przed transportem. Wysyłka ręczna
  i testowa także nie przyjmuje adresu kontaktu z archiwum.
- Przywrócenie nie resetuje suppression, statusów ani weryfikacji i nie
  uruchamia przeliczenia kolejki. Wznowienie skrzynki nie kasuje pauzy po
  archiwizacji. Jawne wznowienie enrollmentu jest możliwe po przywróceniu.
- Profil rozdziela archiwum, globalną blokadę, weryfikację i statusy kampanii.
- Trwałe zdarzenia archive/restore/update mają autora z uwierzytelnienia,
  migawkę nazwy i czas UTC; edycje również poprzednie/nowe wartości.
  Nie kopiujemy historii korespondencji. Pozostały audyt systemowy to etap 8.

## Weryfikacja

- Frontend: 235 testów zaliczonych; build Vite zaliczony.
- Backend: 508 testów zaliczonych, 9 pominiętych (w tym 8 zależnych od
  zewnętrznego PostgreSQL). Nowe testy obejmują zachowanie historii/ID,
  suppression, autora, filtry/eksport, atomowość, autoryzację, przywracanie
  bez wysyłki i trzy ścieżki harmonogramu.
- Migracja: schemat ORM z bazowego commitu z przykładowym kontaktem,
  przypisaniem, logiem, odpowiedzią i suppression; nowa tabela i rzeczywiste
  instrukcje `_run_migrations` uruchomione dwukrotnie. Zachowane ID/dane,
  poprawne wartości domyślne i zapis autora operacji. Silnik PostgreSQL 18.3
  w PGlite 0.5.8 (WASM). Wynik w `2026-10-04-stage2-migration.json`.
- To weryfikacja DDL i danych w osadzonym PostgreSQL, nie test równoległych
  procesów na produkcyjnym serwerze PostgreSQL. Testy Python używały SQLite.
- Testy transportu używają mocków; nie wysłano wiadomości.
- Nowy UI zweryfikowany testami komponentów; nie był wdrażany na demo.

## Stan demo i granice

Odczyt dashboardu, kontaktów i szablonów za Cloudflare Access potwierdzony
na istniejącym demo. Banner blokuje wysyłkę/synchronizację. Użytkownik wcześniej
podał zgodne ID uruchomionego i zbudowanego obrazu oraz HEAD `8f5c7b4`.
Nie ma nowego demo, merge do main ani wdrożenia etapu 2.
Etap 3 nie jest rozpoczęty. Brak nowych etapów lub rozszerzeń CRM.
