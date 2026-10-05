# Etap 6 — sprzedaż

Jeden pakiet na bazie etapu 5 (`d9e7ff3`). Szanse, pipeline, zadania, spotkania i kalendarz CRM korzystają z istniejących kontaktów, firm, logowania oraz wspólnego interfejsu. Nie rozpoczyna automatyzacji, ról ani integracji kalendarzy z kolejnych etapów.

## Zakres

- „Sprzedaż” w nawigacji: pipeline z kartami, lista szans, zadania/spotkania i kalendarz miesiąca. Odnośniki z firmy i profilu CRM zawężają dane do tej tożsamości.
- Konfigurowalne pipeline: nazwa, kolejność i nazwy etapów, archiwizacja/przywrócenie. Klucze etapów pozostają stałe przy zmianach nazwy/kolejności. Etapu zajętego przez szansę (również zarchiwizowaną) nie można usunąć. Nowa instalacja nie tworzy fikcyjnego pipeline; operator definiuje pierwszy.
- Szansa: nazwa, opis, kontakt/firma, etap, kwota i waluta, prawdopodobieństwo, planowane zamknięcie, wynik otwarta/wygrana/przegrana, powód wyniku, archiwizacja/przywrócenie. Przegrana wymaga powodu. Ponowne otwarcie czyści bieżącą datę zamknięcia, zachowując poprzedni wynik w historii.
- Zadania i spotkania mają powiązania, terminy, priorytet, status, przypomnienie w panelu, odroczenie i miejsce/link. Można utworzyć kolejne działanie z zachowaniem powiązań oraz zakończyć zaznaczone. Zbiorcze zakończenie jest sekwencyjne: zatrzymuje się przy błędzie i podaje liczbę zapisanych rekordów; nie udaje jednej transakcji.
- Kalendarz jest osobnym widokiem CRM, niezależnym od harmonogramu kampanii. Zapytanie obejmuje wybrany miesiąc i spotkania przecinające jego granice. Tydzień zaczyna się w poniedziałek; wąski ekran przewija kalendarz poziomo. Formularze używają strefy przeglądarki, API wymaga offsetu i przechowuje UTC. Koniec spotkania jest granicą wyłączną.
- Filtry i jeden zapisany widok w lokalnej przeglądarce. Lista, tablica i kalendarz mają jawną paginację po 100 rekordów; liczniki kolumn dotyczą pobranej strony. Widok kalendarza informuje o tym ograniczeniu.
- Przypomnienia są oznaczeniami w panelu, odświeżanymi co minutę przy otwartej liście/kalendarzu i zamkniętym edytorze. Brak wiadomości, zaproszeń, powiadomień systemowych lub działania przy zamkniętej aplikacji.

## Integralność i migracja

Cztery nowe tabele: `crm_pipeline`, `crm_opportunity`, `crm_sales_activity`, `crm_sales_event`. Powstają przez istniejące `Base.metadata.create_all` przy starcie; nie przepisują kolumn ani ID dotychczasowych danych. Kolejny start jest idempotentny. Backup PostgreSQL obejmuje całą bazę i te tabele.

Każdy zapis ma historię przed/po, autora sesji i czas. Aktualizacja wymaga bieżącej rewizji; konflikt zwraca 409 zamiast utraty cudzych zmian. Interfejs zachowuje szkic przy błędzie i blokuje powtórne wysłanie podczas zapisu. Historia pokazuje ostatnie 200 wpisów danego rekordu; starsze pozostają w bazie.

Scalenie kontaktów nie przenosi ID zapisanych na szansach i działaniach. Filtr zachowanej osoby obejmuje członków grupy oraz działania jej szans. Nowych powiązań nie można tworzyć do zarchiwizowanego lub scalonego źródła. Twarde usunięcie kontaktu z danymi sprzedaży jest blokowane; pozostaje archiwizacja. Wynik szansy ani status działania nie zmieniają suppression, wstrzymania kampanii ani statusu CRM.

API `/api/crm/sales/*` wymaga sesji. Nie jest dołączone do publicznej usługi rezygnacji. Uprawnienia są dotychczasowe — podział na role należy do etapu 8.

## Weryfikacja 05.10.2026

- Pełny backend: 554 zaliczone, 9 pominiętych. Po tym przebiegu dodano test powtórnej migracji; zestaw sprzedaży obejmuje 6 zaliczonych testów (cykl wyniku i suppression, konflikt rewizji, etapy/archiwizacja, daty i odroczenie, scalenie, zakres kalendarza, idempotencja schematu).
- Pełny frontend: 249 zaliczonych. Testy sprzedaży obejmują stałe klucze etapów, zachowanie szkicu po konflikcie, blokadę podwójnego zapisu, powiązania następnego działania i serwerowy zakres miesiąca.
- Build produkcyjny poprawny; pozostaje ostrzeżenie o dużym wspólnym bundle.
- Migracja sprawdzona na SQLite; brak lokalnego PostgreSQL do wykonania integracji PG17. Pominięte testy PostgreSQL nie są uznane za zaliczone.
- Wdrożenie i wizualny odbiór nowych widoków na istniejącym demo pozostają przed nami. Nie deklarujemy sprawdzenia Dark/Light ani mobile nowego modułu w przeglądarce przed wdrożeniem. Etykiety PL/EN/DE/RU; komunikaty walidacyjne serwera pozostają angielskie.

## Aktualizacja i odbiór demo

Przed aktualizacją zachowaj kopię bazy. Zbuduj obraz z dokładnego commita gałęzi `work/stage-6-sales-2026-10-05` i uruchom `bash scripts/sekaro-demo.sh up`, aby zachować override PG17. Nie ponawiaj migracji PG15→17. Ten pakiet zawiera też poprawkę etykiety potwierdzenia scalenia z etapu 5.

Na tym samym demo: utworzyć pipeline z dwoma etapami; dodać szansę istniejącej osoby/firmy; przenieść etap i zamknąć/otworzyć wynik; dodać zadanie i spotkanie; sprawdzić miesiąc, odroczenie, zakończenie i historię; zweryfikować filtry z profilu oraz wygląd jasny/ciemny i wąski ekran. Dopiero po odbiorze przejść do etapu 7. Bez scalenia do main i wdrożenia przez agenta.
