# Etap 7 — automatyzacje i raporty CRM

Jedno wydanie po odebranym funkcjonalnie pakiecie CRM/grupy. Gałąź `work/stage-7-crm-automation-reports-2026-10-05`; bez merge'a i bez wdrożenia przez agenta.

## Zachowanie

W CRM dodano zakładki Automatyzacje i Raporty CRM. Reguły zaczynają wyłączone, w trybie zatwierdzania każdej propozycji. Tryb automatyczny jest osobnym wyborem użytkownika; aktywacja ma potwierdzenie. Edycja wymaga wstrzymania, kontroluje rewizję i zachowuje szkic po błędzie. Podgląd historycznych zdarzeń nie tworzy wykonań ani nie zmienia CRM. Brak danych w podglądzie oznacza brak zapisanych zdarzeń nowego mechanizmu, a nie symulowane wyniki.

Zdarzenia: odpowiedź (LeadReply), zakończenie udziału kontaktu w kampanii, zmiana etapu/wyniku szansy, utworzenie spotkania, przekroczenie terminu działania. Zdarzenia trwałe zapisują się w transakcji źródłowej. Zaległości są zbierane w paczkach do 100; historyczne terminy sprzed aktywacji nie są odtwarzane. Przetwarzanie do 100 nowych zdarzeń i do 100 propozycji na regułę/przebieg; limit dzienny dotyczy skutecznych działań.

Działania: zadanie/follow-up, tag kontaktu, zmiana etapu szansy w wybranym pipeline. Termin zadania liczony od wykonania. Działania automatyzacji nie generują kolejnych wyzwalaczy; zadania utworzone przez reguły są wyłączone z generatora zaległości. Historia reguł i prób zawiera autora/czas, kopię definicji, wejście i rezultat. Jeden rekord reguła–zdarzenie (UNIQUE), ponowienie korzysta z tego samego ID. Błąd wycofuje efekt w savepoincie i pozostawia bezpieczny komunikat. Wstrzymanie blokuje wykonania; zmienione definicje unieważniają starsze propozycje. Wznowienie nie odtwarza zdarzeń z okresu pauzy, ale zachowuje wcześniejsze propozycje niezmienionej definicji.

Żadna akcja nie wysyła wiadomości, nie dopisuje do kampanii, nie usuwa suppression ani nie wznawia wysyłki. Kontakty zarchiwizowane/scalone, nieaktualny etap/termin i zmieniony stan zakończenia udziału są sprawdzane przed działaniem. Tagi są osobną relacją; widoczne na karcie CRM kontaktu, również przez grupę scalenia. Usuwanie kontaktu z tagami wymaga archiwizacji, jak pozostała historia CRM.

Raporty: liczby szans, lejek, wartości otwarte/wygrane/przegrane osobno dla walut; konwersja wygrane/(wygrane+przegrane), brak mianownika daje „—”. Aktywności wg rodzaju/statusu/terminu, zaległości, nieaktywne szanse i kontakty z otwartą szansą bez zaplanowanego działania. Filtry czasu (przedział półotwarty), pipeline, kampanii, skrzynki i pola własnego kontaktu. Atrybucja to ostatnia wysyłka przed utworzeniem szansy; remis rozstrzyga wyższe ID. Grupowanie scalonych tożsamości zapobiega wielokrotnemu przypisywaniu jednej szansy. Wartości są wartościami szans, nie przychodem księgowym. Aktywności używają terminu; filtry źródła/pipeline ograniczają je do szans wybranych tym raportem.

## Migracja i uruchamianie

Pięć nowych tabel tworzonych przez istniejące `Base.metadata.create_all`: reguły, zdarzenia, wykonania, audyt, tagi. Migracja addytywna, bez zmiany istniejących ID i kolumn. Ponowne utworzenie schematu jest idempotentne. Backup całej bazy obejmuje nowe tabele.

Zwykła aplikacja rejestruje minutowy job w istniejącym schedulerze. Demo zachowuje wyłączony scheduler wysyłkowy; przycisk „Przetwórz nowe zdarzenia” pozwala przetestować reguły. Sam job ma dodatkową blokadę dla SEKARO_DEMO_MODE. Brak nowych kontenerów.

## Weryfikacja

- Pełny backend: 570 zaliczonych, 9 pominiętych.
- Po końcowym doprecyzowaniu blokad rekordów: 12/12 testów automatyzacji i raportów, w tym zdarzenie o niższym ID zatwierdzone po późniejszym ID (bez pominięcia przez checkpoint).
- Testy obejmują brak mutacji w podglądzie, zatwierdzanie, pauzę, rewizje, limit, ponowienie po błędzie bez częściowego efektu, trwały ledger po ponownym skanie, brak pętli, rollback zdarzenia źródłowego, zaległości, autoryzację API i odrzucenie nieobsługiwanej akcji wysyłki.
- Raporty: waluty, mianownik konwersji, scalone tożsamości, remis źródeł, filtrowanie źródła i dat, brak podwójnego liczenia, powiązane zadanie wykluczające kontakt z listy follow-up.
- Migracja na istniejącym schemacie oraz ponowna migracja sprawdzone na SQLite. Nie jest to test współbieżności PostgreSQL 17.
- Pełny UI: 256/257; istniejący test operations-language podglądu wiadomości przekroczył limit czasu. Przebieg automatyzacji, grup i całego operations-language: 19/19. Po końcowej zmianie formularza poprawiono niejednoznaczny selektor testu (ta sama nazwa w tabeli i filtrze); końcowe testy formularzy automatyzacji/raportu: 4/4.
- Build produkcyjny poprawny; istniejące ostrzeżenie o dużym bundlu pozostaje.
- Nowe etykiety PL/EN/DE/RU. Odbiór wizualny nowych ekranów wymaga wdrożenia. Nie deklarujemy zgodności 1:1 z niedostępnymi PNG ani zakończonego testu Dark/mobile. Próba wcześniejszego odbioru Dark została zablokowana przez ochronę odczytu sesji przeglądarki.

## Jeden odbiór demo

Po przebudowaniu obrazu i `bash scripts/sekaro-demo.sh up`: utworzyć wyłączoną regułę zmiany szansy → zadanie, sprawdzić podgląd, włączyć zatwierdzanie, zmienić etap testowej szansy, przetworzyć zdarzenia i zatwierdzić jedną propozycję. Ponowne przetworzenie nie może tworzyć drugiego zadania. Sprawdzić wstrzymanie, historię, tryb automatyczny na osobnej regule oraz raport dla szans w PLN i EUR. Wysyłka demo i scheduler wysyłkowy mają pozostać wyłączone.

## Odbiór wdrożonego demo — 2026-10-05, 21:54–21:58 Europe/Warsaw

Użytkownik potwierdził wdrożenie wydania 71c7d3e. Test wykonano w zalogowanej przeglądarce na service.marinakeeper.com. Bez ponownego odczytu etykiety obrazu serwera.

- Utworzono wyłączoną regułę QA zmiany szansy → zadanie w pipeline #1. Podgląd historyczny pusty, bez wykonań.
- Włączono tryb zatwierdzania. Zmiana szansy #1 z Oferta na Rozmowa utworzyła zdarzenie #1 i jedną propozycję. Zatwierdzenie utworzyło zadanie #3 „QA etap 7 — kontrola pojedynczego zadania”, powiązane z kontaktem #61, firmą #61 i szansą #1. Potwierdzono je w agendzie.
- Ponowny skan: 0 / 0, nadal jedno wykonanie i jedno zadanie.
- Wstrzymano regułę i edytowano ją do rewizji 2: „QA etap 7 — tag automatyczny”, akcja QA-etap-7, tryb automatyczny. Poprzednie wykonanie zachowało nazwę i definicję rewizji 1.
- Po włączeniu przywrócono szansę #1 do Oferta (wynik Wygrana i wartość 1250.50 PLN zachowane). Zdarzenie #2 wykonało tagowanie bez zatwierdzania. Ponowny skan: 0 / 0. Tag potwierdzono na karcie CRM kontaktu #61.
- Reguła końcowo wyłączona. Historia pokazuje demo, czasy, utworzenie, włączenia, pauzy, edycję, próby i wyniki obu rewizji.
- Raport: 0 otwartych / 1 wygrana / 0 przegranych, 100% (1/1), 1250.50 PLN, etap Oferta, źródło nieprzypisane. Aktywności: jedno spotkanie zaplanowane, jedno zadanie zakończone, jedno zadanie zaplanowane.
- Filtr kampanii DEMO · Mariny Bałtyk: brak powiązanych szans, konwersja „—” (0/0); po wyczyszczeniu wróciły pełne liczby.
- Ekrany Automatyzacje i Raporty sprawdzone wizualnie w jasnym motywie desktop: czytelne karty, tabele i filtry.
- Nie uruchamiano kampanii ani wysyłki. Banner demo nadal informuje o blokadzie wysyłki i synchronizacji.

Zakres tego odbioru: główne ścieżki zadania z zatwierdzaniem, automatycznego tagowania, historii, braku duplikatów i raportu PLN. EUR, Dark/mobile, pozostałe wyzwalacze i współbieżność PG17 nie były testowane na żywym demo w tej sesji; wielowalutowość ma test backendu. Nie deklarujemy pełnego odbioru wizualnego wszystkich wariantów.
