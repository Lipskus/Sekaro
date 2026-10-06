# P0 — tracking, dashboard i domeny

30.09.2026. Lokalna kontynuacja po `15bcc39` na `work/p0-final-bundle-2026-09-30`. Ten punkt nie jest osobnym wydaniem; jeden zbiorczy pakiet P0 pozostaje do odbioru.

## Zmiany

P0-04: uzupełniono PL/EN/DE/RU w opcjach i pomocy Beacon/DNS, ponownym użyciu trackera, stanach weryfikacji DNS, opisach rozgrzewania, komunikatach dodania, usunięcia, wstrzymania i wznowienia skrzynki. Parametry komunikatów zachowują adresy i błędy dostawcy. Potwierdzenie usunięcia jest oznaczone jako destrukcyjne. Komunikat trwającej weryfikacji DNS przechowuje klucz i parametry, dzięki czemu zmiana języka aktualizuje tekst bez ponownego żądania.

P0-07: dashboard i domeny zlokalizowano w czterech językach. Zachowane zakresy wykresu, nazwy kampanii, domeny oraz źródła wskaźników. Daty i współczynnik odpowiedzi używają lokalnego formatu. Brak pomiaru DNS pozostaje jawnym brakiem danych; nie dodano fikcyjnej diagnostyki. Usunięto dekoracyjną emoji z powitania, która w przeglądarce QA wyświetlała się jako brakujący glif.

## Weryfikacja

- Pełny zestaw frontendowy: 216 testów w 22 plikach zaliczone.
- Następnie dodano regresję zmiany języka podczas trwającej weryfikacji DNS i ponownie zaliczono wszystkie 13 testów edytora skrzynki (łącznie zestaw zawiera teraz 217 przypadków; nie przedstawiamy tego jako ponownego pełnego uruchomienia).
- Nowe testy obejmują zachowanie zweryfikowanej domeny DE/RU, brak kasowania po anulowaniu potwierdzenia DE/RU oraz zachowanie zakresu dashboardu i stanu „nie sprawdzono” DE/RU. API jest mockowane.
- Build produkcyjny zaliczony. Dotychczasowe ostrzeżenie o rozmiarze fragmentu JS pozostaje.
- UI: 48 kombinacji (tracking DNS, tracking Beacon z rozwiniętą pomocą, dashboard, domeny) × DE/RU × Dark/Light × 1600/768/390 px — brak błędów JS i naruszeń mierzonej geometrii. Pierwsze uruchomienie skryptu przerwał błędny selektor rozwijanej pomocy; naprawiono selektor i wykonano pełną macierz ponownie.
- Po usunięciu brakującego glifu powitania kontrola dashboardu została powtórzona oddzielnie: 12/12 kombinacji zaliczonych, brakujący glif usunięty. Dowody w `evidence-2026-09-30/tracking-dashboard/`.
- Obejrzano m.in. dashboard DE/Dark/390 oraz tracking RU/Light/390 z rozwiniętymi instrukcjami. Treść mieści się w szerokości.

## Aktualny stan

P0-04: implementacja i lokalne regresje zakończone. Końcowy odbiór referencyjny i całej aplikacji nadal należy do P0-08/09/10.

P0-07: dashboard i domeny wykonane; ustawienia, stan systemu i porady pozostają otwarte. Nie rozpoczęto etapu 2 ani CRM. Nie zmieniono ROADMAP ani main, nie wysłano poczty, nie wdrożono zmian na serwerze użytkownika.

Manifesty zawierają wszystkie pomiary, repozytorium przechowuje wybrane reprezentatywne zrzuty. Odtworzenie przez `scripts/check-p0-ui.cjs`: `P0_UI_WORKFLOWS=1`, `P0_UI_FLOWS=mailbox-tracking-dns,mailbox-tracking-beacon,dashboard-localized,domains-localized`, `P0_UI_LANGUAGES=de,ru` i lokalne ścieżki Playwright/Chromium. Wszystkie API przechwycone, obce origin zablokowane. Nie jest to dowód pracy serwera ani porównanie 98 plansz.
