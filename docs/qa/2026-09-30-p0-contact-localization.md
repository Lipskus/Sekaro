# P0 — lista i profil kontaktu w czterech językach

Baza: `12fde79d4544e8dae829438e0bfe8f60395bd9c9`, dotychczasowy branch P0. Remote i PR sprawdzone przed pracą: main `ca9a544`, otwarty tylko PR #37. Użytkownik potwierdził działanie poprzedniego pakietu; w tym pakiecie nie wykonywano samodzielnego odbioru nowego wdrożenia VPS.

## Zmiany

- Lista kontaktów: nagłówki, licznik, filtry, kolumny, paginacja, tworzenie, przypisanie do kampanii, eksport i globalna lista wykluczeń w PL/EN/DE/RU.
- Profil: podsumowanie, edycja, historia i filtry zdarzeń, kampanie, wiadomości, metryki i komunikaty pustego/ładowanego widoku.
- Wspólny ContactStatus i etykiety statusu w profilu tłumaczą znane kody, zachowując dotychczasowy wybór statusu, znaczenie i kolory. Nieznany kod pozostaje widoczny, a nie zastępowany statusem pozytywnym. Wyniki unknown/risky/catch_all nie są utożsamiane z valid.
- Daty i licznik listy stosują wybrany język; daty pozostają w dotychczasowej strefie przeglądarki. Inne moduły zachowują dotychczasowy domyślny format dat.
- Usuwanie kontaktów i zdjęcie blokady przekazują jawne oznaczenie operacji destrukcyjnej niezależnie od języka komunikatu. Zachowano ostrzeżenia o usuwaniu historii, wypisaniu w kampaniach i aktywnej kolejce.
- Zmiana języka aktualizuje etykiety bez ponownego wczytywania profilu/listy. Nie resetuje filtrów, zaznaczeń, identyfikatorów kolumn i szkicu danych.
- Nazwy osób, pól, list, kampanii i tematy wiadomości pozostają danymi użytkownika. API otrzymuje te same klucze i statusy; tłumaczenia nie są utrwalane jako wartości domenowe.
- Oględziny wykryły, że rosyjski komunikat systemowy poszerza kartę w sidebarze. Siatka ma teraz ograniczoną szerokość, a nagłówek i status mogą się zawijać. Dodano osobny pomiar przepełnienia kart sidebara do skryptu QA.

Nie dodano archiwizacji, nowego statusu CRM, schematu bazy ani żadnej nowej integracji. Numer produktu pozostaje bez zmian; jest to kolejny commit tego samego pakietu P0.

## Testy

- 153 testy frontendu w 18 plikach: zaliczone. Dziewięć nowych przypadków sprawdza zachowanie filtrów/zaznaczeń/preferencji kolumn, szkicu profilu i typowanych danych we wszystkich czterech językach, rozróżnienie znacznika odpowiedzi od wiadomości, anulowanie usunięcia DE/RU oraz rosyjskie ostrzeżenia aktywnej kampanii i zniesienia blokady. Dodatkowo sprawdzono nieznany kod statusu i formatowanie daty.
- Produkcyjny build zaliczony; wcześniejsze ostrzeżenie o wielkości chunka pozostaje.
- 84 izolowane przypadki UI: lista, tworzenie, podsumowanie, aktywność, kampanie, wiadomości, wykluczenia × DE/RU × Dark/Light × 1600×900, 768×1024, 390×844. Bez wykrytych błędów JS, przepełnienia strony i naruszeń badanych granic dialogów. Ta pierwsza macierz nie mierzyła jeszcze przepełnienia samej karty sidebara, znalezionego podczas oględzin.
- Końcowa kontrola podsumowania po poprawce sidebara: 24 warianty, wszystkie cztery języki, oba motywy i trzy rozmiary; uwzględnia nowy pomiar kart sidebara. Manifest `evidence-2026-09-30/contact-localization/profile-final.json`.
- Obejrzano pełnowymiarowe zrzuty: profil DE desktop Dark i mobile Dark, aktywność RU desktop Dark, wykluczenia RU mobile Light oraz końcowy profil RU desktop Dark po poprawce. To wybrane oględziny, nie pełna akceptacja pikselowa wszystkich stanów.

API było mockowane. Testy UI blokowały zewnętrzne originy. Nie wysłano wiadomości, nie zapisano ani nie usunięto danych na serwerze. Backend nie zmienił się, dlatego nie powtarzano jego testów. Nie wykonano testu upgrade PostgreSQL ani backup/restore.

## Odtworzenie macierzy

Po zbudowaniu frontendu, z lokalnym Chromium i Playwright:

```bash
P0_PLAYWRIGHT_MODULE=/path/to/playwright \
P0_CHROMIUM=/path/to/chromium \
P0_UI_WORKFLOWS=1 \
P0_UI_FLOWS=contact-list,contact-create,contact-summary,contact-activity,contact-campaigns,contact-messages,contact-suppression \
P0_UI_LANGUAGES=de,ru \
P0_UI_OUTPUT=/path/to/evidence \
node scripts/check-p0-ui.cjs
```

Dla końcowej kontroli: `P0_UI_FLOWS=contact-summary P0_UI_LANGUAGES=pl,en,de,ru`. Tabele i zakładki na małym ekranie korzystają z przewijania wewnętrznego; pomiar dokumentu nie oznacza, że wszystkie kolumny są jednocześnie widoczne.

## Dalszy P0

Pozostają lokalizacja innych modułów, w tym narzędzi kontaktów pod `/contacts-tools`, kampanii i Inbox, oraz dalszy odbiór referencyjny. Komunikaty zwracane przez API pozostają w języku źródłowym. Niniejszy pakiet nie zamyka P0 ani nie oznacza pełnego 1:1.

Aktualizacja istniejącego demo, w katalogu repozytorium na branchu P0:

```bash
git pull --ff-only origin fix/p0-safety-sekaro-identity-2026-09-29 &&
docker compose -f docker-compose.sekaro.yml build --pull app &&
bash scripts/sekaro-demo.sh up
```
