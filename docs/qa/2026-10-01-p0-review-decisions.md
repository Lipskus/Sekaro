# P0 — konkretny zakres odbioru po przeglądzie odstępstw

Branch: `work/p0-final-bundle-2026-09-30`. Ten dokument nie zatwierdza odstępstw, nie zamyka etapu 1 i nie zmienia kolejności wydań.

## Co naprawiono w tym przeglądzie

Oględziny zachowanych zrzutów wykazały ściskanie niemieckiego tytułu edytora szablonów na tablecie: pojedyncze słowo było łamane na trzy wiersze przez przyciski obok. Wspólny nagłówek `PageFrame` zachowuje teraz czytelną szerokość tekstu i przenosi akcje do następnego wiersza, gdy brakuje miejsca. Akcje mogą się zawijać w granicach strony. Nie zmieniono ich działania ani stanu edytora.

Kontrola czytelności tytułu w `scripts/check-p0-ui.cjs` obejmuje teraz wszystkie nagłówki `PageFrame`, a nie wyłącznie narzędzia kontaktów. Sprawdza zarówno nadmierną liczbę wierszy, jak i wielowierszowy tytuł ściśnięty do wąskiej kolumny. Nie jest to pełny test zgodności pikselowej.

## Propozycja odbioru — trzy rozstrzygnięcia

| Decyzja | Rekomendacja | Konkretne skutki |
|---|---|---|
| Układ istniejących funkcji | Zachować obecne rozmieszczenie po poprawkach czytelności i responsywności. | Boczne kategorie Ustawień; edytor skrzynki przy liście; sześciokrokowa konfiguracja kampanii; opóźnienie wewnątrz kroku sekwencji; istniejące filtry odbiorców. Starsze i nowsze plansze listy kampanii nie będą jednocześnie wzorcem geometrii. |
| Plansze pokazujące wiele stanów | Odbierać oddzielne stany rzeczywistej operacji. | Empty/loading/error/success i potwierdzenia nie występują równocześnie na jednym ekranie. Blokada usuwania używanej skrzynki pozostaje zamiast obietnicy nieistniejącego przeniesienia. |
| Dodatkowe funkcje na makietach | Nie rozszerzać zamkniętego zakresu P0; zachować jawne braki i istniejący plan. | Bez pozornych ocen reputacji, historii synchronizacji, lejka spotkań, opiekunów, pełnego CRM i nowych adapterów. Bez nowych operacji kolejki. Gęstość UI, skala tekstu, kategorie szablonów, quiet hours/digest i globalny formularz godzin są nadal niezaimplementowane; ich termin wymaga osobnego ustalenia, nie są automatycznie dopisane do etapu 2. |

To propozycja akceptacji obecnego zakresu, a nie deklaracja zgodności 1:1. Jeśli wymagane jest odtworzenie konkretnego innego układu z makiety, pozostaje ono do wykonania w P0 po wskazaniu nadrzędnej referencji. Brak danych backendu nie usprawiedliwia ucinania tekstu, złego kontrastu czy utraty szkiców — takie błędy nadal są poprawkami P0.

Pełna lista różnic i numery plansz: [macierz 98 referencji](2026-09-30-p0-reference-matrix.md). Szczegóły brakujących kontraktów: [braki backendu](2026-09-28-backend-reference-gaps.md). Wyniki wcześniejszych regresji: [raport zbiorczy](2026-09-30-p0-consolidated-review.md).

## Granica odbioru

Zgoda na kontynuowanie prac nie została potraktowana jako akceptacja wszystkich różnic. Nadal potrzebny jest odbiór powyższej propozycji, zanim etap 1 zostanie oznaczony jako zamknięty. Merge i wdrożenie są osobnymi działaniami; nie wykonano żadnego z nich. Nie rozpoczęto etapu 2 ani migracji.

## Wyniki tej poprawki

- Build produkcyjny: poprawny (ostrzeżenie o dużym chunku pozostaje).
- Wszystkie 18 tras × DE/RU × 1600/768/390 px × Dark/Light: **216/216**, bez wykrytych błędów JS, przepełnień i ściśniętych tytułów.
- Edytor i podgląd szablonu, szczegóły powiadomienia i narzędzia kontaktów × PL/EN/DE/RU × te same rozmiary i motywy: **96/96**. Sprawdzane są także dostępność fontu i geometria/fokus otwartych dialogów.
- Oględziny edytora szablonów DE na tablecie: tytuł przed poprawką zajmował trzy wiersze, po poprawce jeden; przyciski mają osobny wiersz. Zweryfikowano jasny i ciemny motyw.
- Nie zmieniono backendu ani logiki komponentów. Poprzednie wyniki 233 testów frontendu oraz 501 zaliczonych/8 pominiętych backendu są wynikami wcześniejszego commita, nie nowym uruchomieniem.

Dowody: `evidence-2026-10-01/header-readability/` zawiera manifesty wszystkich 312 pomiarów, log builda i cztery wybrane zrzuty przed/po. Pozostałe nazwy zrzutów w manifestach opisują wykonane pomiary; nie wszystkie obrazy zapisano w repozytorium. Dane i API były mockowane; nie wysłano wiadomości.
