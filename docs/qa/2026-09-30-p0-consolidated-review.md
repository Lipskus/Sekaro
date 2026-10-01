# Sekaro — zbiorczy pakiet P0 do przeglądu

Data: 30.09.2026. Branch: `work/p0-final-bundle-2026-09-30`. Ostatni lokalny commit kodu: `3a21394` (backend `ee360da`, narzędzia kontaktów `f9636c0`, układ tabletu `1267d6b`, kontrast dialogów `ff449bb`, szerokość tabel mobilnych `3a21394`). Dokumentacja i dowody są kolejnym commitem tego samego pakietu. Zdalna publikacja przez API ma inne SHA commitów; zgodność sprawdzamy po pełnym drzewie Git.

**Etap 1 nadal trwa.** Jest to jeden zbiorczy pakiet do przeglądu i odbioru. Nie wykonano merge’a, wdrożenia, migracji funkcjonalnych, podniesienia numeru wersji ani prac etapu 2. `docs/RELEASE_EXECUTION_PLAN.md` zachowuje wszystkie 11 etapów i ich kolejność. Odstępstwa referencyjne nie zostały automatycznie zaakceptowane.

## Odzyskanie i zmiany

Odzyskano oryginalny katalog `/workspace/scratch/978d9bbb679c/p0-publish` i lokalną gałąź. Nie było potrzeby odtwarzania całej końcówki od zera. Punktem zdalnej kontynuacji jest `0a078ab74326b082391bd01be0506063febd19af`; pierwszy opublikowany checkpoint `b5ce7a7e2a59dac5fde8018c0d6b167c8ac744e1` ma to samo drzewo co lokalny `fcc7a50`. Commity robocze nie stanowią osobnych wydań do instalacji.

Pakiet obejmuje odzyskane tłumaczenia i regresje kontaktów, kampanii, Inbox, szablonów, skrzynek, harmonogramu, powiadomień, ustawień, diagnostyki i porad. Raporty poszczególnych modułów w tym katalogu zachowują historię wykonania.

W końcowym przeglądzie dodano:

- PL/EN/DE/RU dla aktywnej trasy `/contacts-tools`: recovery, filtry, CSV, import, wykluczenia, statusy i potwierdzenia. Zmiana języka nie odświeża danych ani nie usuwa szkicu poprawionego adresu i zaznaczeń.
- Wspólny dialog importu i suppression z obsługą fokusu, Escape i blokady przewijania; jawne destrukcyjne potwierdzenia. Błąd odczytu ma komunikat i retry, zamiast fałszywego sukcesu z pustą listą.
- Poprawki zawijania przycisków, czytelności tytułu narzędzi kontaktów na tablecie i kontrastu tabel w ciemnych dialogach i przewijania mapowania importu na telefonie.
- Naprawę agregacji odpowiedzi kampanii: `NULL` klasyfikacji jest odpowiedzią, natomiast `out_of_office` i `auto_reply` nie zawyżają wyniku. Regresja obejmuje pięć klasyfikacji i oba endpointy odczytu.
- Aktualizację testów do istniejących granic autoryzacji MCP/setup, harmonogramu i add-opens; osobne testy 401 i poprawnych wywołań. Nie poluzowano produkcyjnej autoryzacji. Stare testy niezamontowanego adaptera Gmail zastąpiono sprawdzeniem 404; adapter nie został uruchomiony w P0.

## Wyniki weryfikacji

| Kontrola | Wynik i zakres |
|---|---|
| Pełny backend | **501 zaliczonych, 8 pominiętych**. SQLite; pominięcia to testy workerów wymagające PostgreSQL. Log zachowuje ostrzeżenia zależności. |
| Ochrona wysyłki, DEMO, pause/bulk | Wcześniejsze 70 testów zaliczonych; te same moduły objęte również pełnym backendem. Transport mockowany. |
| Pełny frontend | **233 zaliczone testy w 25 plikach**; w tym pięć nowych regresji narzędzi kontaktów. |
| Build produkcyjny | Poprawny; pozostaje ostrzeżenie Vite o wielkości chunków. |
| Podstawowe trasy | **432/432**: 18 tras × PL/EN/DE/RU × 3 szerokości × Dark/Light. Pomiar tras poprzedza ostatnie poprawki `/contacts-tools`; dla tej trasy nowsze dowody są w kolejnych wierszach. |
| Error/loading | **192/192**: 8 tras × DE/RU × 2 stany × 3 szerokości × Dark/Light. Manifest scalony: 168 niezmienionych przypadków i 24 powtórzone po naprawie nagłówka. |
| Narzędzia kontaktów | **72/72**: recovery, suppression i import × PL/EN/DE/RU × 3 szerokości × Dark/Light. Najnowsze 48 dialogów uzupełnia 24 kontrole recovery; końcowe CSS dialogów nie zmienia recovery. |
| Odzyskane ustawienia/system/porady | **180/180** przypadków DE/RU we wcześniejszym punkcie kontrolnym; manifest `recovered-system`. |
| Referencje | Zweryfikowano SHA-256 i obejrzano wszystkie **98 oryginalnych plansz**; macierz zawiera rzeczywiste rendery porównawcze Dark/Light. |

Szerokości: 1600×900, 768×1024, 390×844. UI działało na lokalnym buildzie ze wszystkimi API przechwyconymi przez fixture; nie używało prawdziwej skrzynki ani danych instalacji. Automaty sprawdzają błędy JS, przepełnienia, ładowanie fontu, geometrię i fokus dialogu oraz blokadę tła. Oględziny zrzutów uzupełniają pomiar: brak przepełnienia nie gwarantuje czytelnego tytułu ani kontrastu.

Pierwsze pomiary wykryły 2 błędy recovery i 4 błędy error/loading (RU, tablet, oba motywy). Pierwsza korekta szerokości usunęła overflow, ale ręczny przegląd ujawnił pionowo ściśnięty tytuł. Ostateczny układ umieszcza tytuł nad akcjami, a skrypt kontroluje również nadmierną liczbę linii tytułu. Zachowano manifesty sprzed naprawy, żeby nie ukrywać przebiegu regresji. Dialog importu sprawdzono dodatkowo po naprawie kontrastu.

## Referencje i otwarty odbiór

Macierz: [98 plansz](2026-09-30-p0-reference-matrix.md), [dane JSON](2026-09-30-p0-reference-matrix.json). **82 plansze mają jawne odstępstwa, 16 wskazuje zakres zależny od późniejszych etapów.** To klasyfikacja całych plansz, nie 82 błędy funkcjonalne ani procent zgodności. Różnice obejmują geometrię, inne rozmieszczenie istniejących funkcji oraz panele bez obecnego źródła danych. Każdy wiersz opisuje konkretną różnicę. Nie zadeklarowano pełnego 1:1 ani akceptacji brakujących elementów.

P0-08/10 mają końcowe wyniki techniczne; P0-09 ma kompletny rejestr porównawczy. **Do zamknięcia P0 pozostaje odbiór pakietu i rozstrzygnięcie opisanych odstępstw.** Nie przenosimy automatycznie pozostałych różnic UI do etapu 2. Dalszy zakres według planu, w tym diagnostyka, adaptery, pełny CRM i operacje PostgreSQL, nie został rozpoczęty.

Nie sprawdzono aktualizacji istniejącej instalacji, migracji/odtworzenia PostgreSQL ani rzeczywistego SMTP/IMAP w tym przeglądzie. Nie jest to bramka stabilnego 1.0. Komendy instalacji nie przedstawiamy jako gotowego zatwierdzonego wydania przed odbiorem.

## Dowody

- `evidence-2026-09-30/final-routes/ui-matrix.json` — pomiary 432 podstawowych renderów.
- `evidence-2026-09-30/final-states/ui-matrix.json` — aktualny scalony wynik 192 stanów; manifest przed naprawą obok.
- `evidence-2026-09-30/contact-tools-final/ui-matrix.json` — aktualne 72 przepływy; wybrane zrzuty desktop/tablet/mobile i wcześniejsze nieudane pomiary.
- `evidence-2026-09-30/reference-review/` — zrzuty wskazane w macierzy referencji.
- `evidence-2026-09-30/final-checks/` — logi pełnych testów i końcowego builda.

Manifesty pomiarowe zachowują nazwy wszystkich wygenerowanych zrzutów; w Git zapisano wybrany zestaw obrazów i wszystkie obrazy powiązane z 98 wierszami macierzy, nie komplet każdej kombinacji. Są to dowody fixture i przeglądu, nie nowe zatwierdzone projekty ani dowód wdrożenia.

## Wznowienie 01.10.2026

Potwierdzono zachowanie commita `3a21394` i ponownie wykonano 48 kontroli dialogów importu/suppression (PL/EN/DE/RU, trzy szerokości, oba motywy): 48 zaliczonych, bez błędów. Obejrzano końcowy rosyjski dialog importu na telefonie w ciemnym motywie; pola zachowują szerokość, tabela przewija się wewnątrz dialogu. Manifest ponownej kontroli: `evidence-2026-09-30/final-checks/dialogs-recheck-2026-10-01.json`. Zweryfikowano istnienie i SHA-256 wszystkich 98 dowodów wskazanych w macierzy. Wyniki pełnych testów powyżej pochodzą z zachowanych logów 30.09; nie uruchamiano ich ponownie dla samego raportu. Nadal bez merge’a, wdrożenia i etapu 2.
