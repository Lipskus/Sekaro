# Sekaro — plan wykonania wydań

Podział na 11 większych wydań zatwierdzony w rozmowie 29.09.2026. Rezerwa: do dwóch podziałów dużych etapów, wyłącznie po wykazaniu konkretnej potrzeby. Numery poniżej określają kolejność prac, nie wersje semantyczne. Dokument zapisuje uzgodniony sposób wykonania; nie scala PR37 ani nie zmienia ROADMAP.md.

## Zasady pracy

- Jeden pakiet funkcjonalny może obejmować kilka commitów i PR. Nie wydajemy osobnych wersji dla pojedynczych przycisków.
- Każdy pakiet zaczyna się od porównania aktualnego kodu z zakresem: istniejące funkcje są zachowywane i rozszerzane.
- Refaktoryzacje wchodzą do pakietu, któremu służą. Nie budujemy równoległego CRM ani drugiego interfejsu.
- Publikacja wersji do odbioru: branch, dokładny commit, wynik testów, ograniczenia i komenda aktualizacji istniejącej instalacji. Bez drugiego demo.
- Bieżąca ścieżka pozostaje branchowa. Scalenie do main i wdrożenie wykonane przez agenta wymagają odrębnej zgody. Zatwierdzenie planu nie zatwierdza makiet ani wszystkich szczegółów przyszłych funkcji.
- Testy wysyłki używają mocków lub izolowanego lokalnego transportu. Bez prawdziwych wiadomości i zaproszeń.

## Pakiety wydań

| Etap | Zakres i ponowne wykorzystanie | Zależności i migracje | Testy / bramka odbioru |
|---|---|---|---|
| 1 — P0 | Domknięcie obecnego UI, ochrony wysyłki, Dark/Light, formularzy, klawiatury, responsywności i uzgodnionej lokalizacji; regresje sekwencji oraz Inbox | Bieżący main i poprawki P0; bez migracji funkcjonalnej w dotychczasowych poprawkach | Macierz widoków i stanów z dowodami; transport mockowany; jawne odstępstwa od referencji i otwarte braki |
| 2 — kontakty i historia | Archiwizacja/przywracanie obecnego Lead, widok archiwum, prezentacja statusu oraz niezależnych blokad, autor i czas działań | Migracja pól archiwizacji i trwałego zapisu operacji; szczegółowy schemat przed implementacją | Istniejące ID, logi i odpowiedzi zachowane; archiwizacja wyklucza przyszłą wysyłkę; przywrócenie nie usuwa suppression i nie uruchamia wiadomości |
| 3 — analityka outreach | Weryfikacja istniejących raportów, uzgodnione brakujące raporty oraz diagnostyka domen/skrzynek | Zakres wymagany przed 1.0 musi zostać rozstrzygnięty; migracje tylko dla zatwierdzonych pomiarów | Definicje wskaźników i źródła; brak pomiaru odróżniony od wyniku pozytywnego |
| 4 — stabilna baza | Upgrade PostgreSQL, backup/restore, bezpieczeństwo, izolacja publicznej rezygnacji, dokumentacja operacyjna | Poprzednie etapy; migracje i sieci sprawdzone na istniejącej instalacji | Upgrade ze starej bazy, odtworzenie backupu, granica prywatne/publiczne; decyzja o oznaczeniu 1.0 |
| 5 — rdzeń CRM (P1–P3) | Ten sam Lead jako osoba, wiele adresów, firmy i relacje, historia, notatki, bezpieczne scalanie; istniejące Shell, Modal, import i FieldManager | Rozszerzenie modelu z etapu 2; migracja obecnego email i danych firmowych, bez utożsamiania firmowego adresu ogólnego z osobą | Osoba bez firmy, firma z wieloma osobami; porównanie konfliktów i potwierdzenie scalenia; zachowane ID/autorzy/blokady |
| 6 — sprzedaż (P4–P5) | Szanse, pipeline, zadania, spotkania, kalendarz CRM | Rdzeń CRM; nowe encje procesu sprzedażowego | Pełny cykl szansy; wynik szansy niezależny od statusu CRM i wysyłki; kalendarz nie zastępuje harmonogramu kampanii |
| 7 — automatyzacje i raporty (P6a–b) | Wspólne automatyzacje CRM/outreach i raporty CRM | Etapy 5–6; trwałe definicje i historia wykonań, zgodnie ze szczegółowym projektem | Jawne wyzwalacze, powtórzenia i błędy; respektowanie suppression i audyt wykonania |
| 8 — użytkownicy (P7a–b) | Użytkownicy, zespoły, role, uprawnienia i audyt w Ustawieniach | Rozbudowa istniejącego auth i autorstwa; migracja uprawnień obecnych kont | Uprawnienia API i UI, zakres dostępu, zachowanie autorstwa; brak samego ukrywania przycisków |
| 9 — adaptery i Gmail (P8a–b) | Kontrakt adapterów, SMTP/IMAP i diagnostyka, Gmail API | Istniejąca poczta pozostaje bazą; migracje konfiguracji/poświadczeń według kontraktu | Wysyłka, odbiór, błędy i autoryzacja; zachowane keep/immediate/days oraz EML |
| 10 — Microsoft 365 (P8c) | Microsoft Graph | Kontrakt z etapu 9; konfiguracja i stan synchronizacji | Autoryzacja, odnowienie, synchronizacja i błędy; autoryzacja skrzynki nie jest logowaniem do Sekaro |
| 11 — instalator (P9) | Instalacja/aktualizacja, diagnostyka instalacji, opcjonalny antywirus | Stabilne pakiety aplikacji i baza; bez zbędnych usług | Powtarzalna instalacja, bezpieczna aktualizacja, dokumentacja i opcjonalność antywirusa |

## Jeden model kontaktu — bez nakładania etapów 2 i 5

Etap 2 nie tworzy firm, osobnych adresów ani nowej tabeli osób. Dodaje archiwizację do obecnego Lead i trwały zapis operacji z autorem/czasem. Zdarzenia mają dać się wykorzystać w przyszłej historii CRM. W tym etapie nie powstaje drugi system logów korespondencji.

Etap 5 rozszerza ten sam rekord i wykorzystuje już istniejącą archiwizację oraz historię. Migracja wielu adresów musi zachować dotychczasowe powiązania kampanii, logów, odpowiedzi i suppression. Powiązanie z firmą i scalenie osób pozostają oddzielnymi operacjami. Usuwanie kontaktu, które dziś usuwa logi/odpowiedzi, nie jest zamiennikiem archiwizacji.

## Decyzje przed stabilnym 1.0

1. Dokładny wymagany zakres raportów outreach i pomiarów domen w etapie 3.
2. Uzgodniona macierz prywatnych/publicznych tras. Nowy publiczny endpoint wymaga decyzji; rdzeń docelowy: aplikacja, PostgreSQL, odizolowana rezygnacja.
3. Akceptacja zakresu języków oraz odstępstw od starszych, wzajemnie różniących się makiet. Nie deklarować pełnego 1:1 ani pełnej lokalizacji bez dowodów.
4. Macierz wspieranych aktualizacji i dowód backup/restore PostgreSQL.
5. Numeracja wersji po uzgodnieniu powyższego. Aktualny numer 0.5.6 w UI nie jest identyfikatorem wdrożonego commita.

Kolejność faz CRM z PR37 pozostaje zachowana. Nie zatwierdzono generowania dodatkowych 38/72 PNG ani propozycji 490 PNG. Modele i widoki z dalszych etapów nie są pozorowane fikcyjnymi danymi w zwykłej instalacji.

## Stan rozpoczęcia wykonania

Etap 1 trwa. Branch: `fix/p0-safety-sekaro-identity-2026-09-29`. Ochrona wysyłki, poprawka tabletowego nagłówka Inbox, oznaczenie środowiska demo oraz wspólny podgląd sekwencji są opublikowane. Odbiór całego P0 pozostaje otwarty; szczegóły w raportach `docs/qa/`.

### Postęp 30.09.2026

Kontynuacja etapu 1 zgodnie z zatwierdzoną kolejnością. Propozycja warunkowego odbioru z `2026-09-29-p0-acceptance-proposal.md` nie została potraktowana jako zgoda na przesunięcie pozostałych prac. Dodano lokalizację wspólnych kontrolek, potwierdzeń, importu i własnych pól kontaktu w PL/EN/DE/RU. Treści pozostałych modułów i pełny odbiór referencyjny nadal pozostają otwarte w P0. Etap 2 nie jest rozpoczęty. Szczegóły: `docs/qa/2026-09-30-p0-shared-localization.md`.
