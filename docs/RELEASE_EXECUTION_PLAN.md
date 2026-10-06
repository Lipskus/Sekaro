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

Lista i profil kontaktu: lokalizacja PL/EN/DE/RU obejmuje listę, filtry, kolumny, formularze, wykluczenia, zakładki profilu, historię, etykiety statusów i lokalny format dat. Szczegóły i regresje: `docs/qa/2026-09-30-p0-contact-localization.md`. Dalszy P0: lokalizacja kampanii i Inbox oraz pozostały odbiór referencyjny; bez przesuwania tych prac do etapu 2.

Inbox oraz lista i tworzenie szkicu kampanii: lokalizacja PL/EN/DE/RU, zachowanie szkiców i zaznaczeń przy zmianie języka, jawne destrukcyjne potwierdzenia. Szczegóły: `docs/qa/2026-09-30-p0-outreach-localization.md`. Pełny workspace kampanii, edytor sekwencji i ustawienia pozostają kolejną częścią tego samego P0; etap 2 nadal nie jest rozpoczęty.

Obsługa kampanii i sekwencje: przegląd, harmonogram, skrzynki, ustawienia, pre-flight, aktywność, edycja standardowa/spersonalizowana, warianty i podgląd w PL/EN/DE/RU. Zachowane szkice, kody API i kontrola przed startem; poprawki zawijania treści zastępczej i układu ustawień na tablecie. Raport: `docs/qa/2026-09-30-p0-campaign-workspace-localization.md`. Dalej w P0: odbiorcy i analityka kampanii, pozostałe moduły i odbiór referencyjny. Etap 2 nadal nie jest rozpoczęty.

### Zasada zbiorczego domknięcia P0 — 30.09.2026

Po uwadze użytkownika o zbyt wielu aktualizacjach pozostałe prace P0 są jednym pakietem do odbioru. Zamknięta lista: `docs/qa/2026-09-30-p0-final-scope.md`. Nie wydajemy kolejnych modułów tłumaczeń oddzielnie. Kolejność 11 etapów i zakres CRM pozostają bez zmian.

### Bieżący punkt kontrolny — 30.09.2026

Ta tabela pokazuje aktualny stan wykonania. Powyższe wpisy „Postęp” są historią prac, a nie aktualną listą braków. Zakres i kolejność 11 etapów pozostają bez zmian.

| Etap | Stan |
|---|---|
| 1 — P0 | Pakiet `8f5c7b4` zainstalowany przez użytkownika. 04.10 potwierdzono wersję z przekazanego terminala oraz odczyt demo po logowaniu: dashboard, kontakty i szablony. Polecenie kontynuowania harmonogramu jest podstawą rozpoczęcia etapu 2; nie oznacza potwierdzenia zgodności 1:1 z referencjami. Odstępstwa pozostają opisane w raporcie P0. |
| 2 — kontakty i historia | **Wdrożony i odebrany 04.10.2026.** Archiwizacja, przywracanie, historia autora/czasu i zachowanie blokad potwierdzone na demo. Raport: `docs/qa/2026-10-04-stage2-contacts.md`. |
| 3 — analityka outreach | **Wdrożony 04.10.2026.** Raporty kampanii, skrzynek i kraju oraz Domeny potwierdzone na demo. Pobranie CSV pozostaje niepotwierdzone przez narzędzie przeglądarki; użytkownik polecił kontynuację po zgłoszeniu tego ograniczenia. Raport: `docs/qa/2026-10-04-stage3-analytics.md`. |
| 4 — stabilna baza | **Odebrany w zakresie demo 04.10.2026.** Operator potwierdził PG15→17, zgodność odtworzonych danych i test izolacji kontenerów. Odczyt panelu i 60 kontaktów potwierdzony. Publiczna domena/TLS pozostają konfiguracją produkcyjną; numer 1.0 niezatwierdzony. |
| 5 — rdzeń CRM | **Odbiór funkcjonalny demo 05.10.2026.** Potwierdzono zapis firmy, dwie osoby, relacje, adresy, notatki i scalenie z zachowaniem ID/historii. Dark/Light desktop sprawdzone. Poprawiono etykietę potwierdzenia scalenia; wymaga aktualizacji. Ograniczenia QA: `docs/qa/2026-10-04-stage5-crm.md`. Następny etap: 6. |
| 6 — sprzedaż | **Wdrożony, podstawowy odbiór demo 05.10.2026.** Pipeline, szansa/wygrana, zadanie, przypomnienie, zakończenie i spotkanie w kalendarzu potwierdzone. Light/Dark desktop sprawdzone. Ograniczenia: `docs/qa/2026-10-05-stage6-sales.md`. |
| 7 — automatyzacje i raporty | **Wdrożony; główne ścieżki odebrane 05.10.2026.** Reguły z zatwierdzaniem/trybem automatycznym, historia, limity i raporty CRM. Po pakiecie porządkowym CRM/grupy. Szczegóły i ograniczenia: `docs/qa/2026-10-05-stage7-automation-reports.md`. |
| 8 — użytkownicy | **Implementacja gotowa do odbioru demo.** Konta, role modułowe, zespoły, kontrola API/UI, blokowanie kont i unieważnianie sesji/kluczy, audyt oraz podgląd kalendarza przed edycją. Zakres globalny instalacji i ograniczenia: `docs/STAGE_8_ACCESS.md`. |
| 9 — adaptery i Gmail | Nierozpoczęty. |
| 10 — Microsoft 365 | Nierozpoczęty. |
| 11 — instalator | Nierozpoczęty. |

Szczegółowa lista bieżących prac: `docs/qa/2026-09-30-p0-final-scope.md`. Ostatnia implementacja: szablony, harmonogram oraz powiadomienia w PL/EN/DE/RU, zachowanie danych przy zmianie języka, naprawa przepełnienia długiego nagłówka. Raport: `docs/qa/2026-09-30-p0-final-operations-worklog.md`. To lokalny punkt kontrolny, nie nowa wersja do instalacji.

Dalszy postęp P0-04 (30.09): archiwum i retencja w czterech językach, lokalizacja listy skrzynek oraz formularzy nadawcy i SMTP/IMAP, kontrola potwierdzenia i zakresu dni również w obsłudze zapisu. P0-04 nadal w toku: tracking i pozostałe komunikaty są otwarte. Raport: `docs/qa/2026-09-30-p0-mailbox-progress.md`. Nie jest to osobne wydanie.

Aktualizacja 30.09 po pracach nad trackingiem: P0-04 wykonane lokalnie. P0-07 rozpoczęte od dashboardu i domen; ustawienia, stan systemu i porady pozostają otwarte. Raport: `docs/qa/2026-09-30-p0-tracking-dashboard.md`. Etap 1 nadal trwa, kolejność etapów 2–11 nie zmienia się.

Odzyskanie 30.09: oryginalny katalog i branch przetrwały. P0-07 wykonane lokalnie; 228 testów frontendu, 70 testów ochrony wysyłki/skrzynki i 180 kombinacji UI zaliczone. Pełny backend: 485 zaliczonych, 8 pominiętych, 6 nieudanych (te same funkcje testowe nie przechodzą na zachowanej bazie). P0-08/09/10 i końcowy odbiór całego pakietu pozostają otwarte. Szczegóły oraz stan publikacji: `docs/qa/2026-09-30-p0-recovery.md`. Nie jest to nowe wydanie ani zgoda na etap 2.

Końcowy przegląd 30.09: odzyskany katalog i branch zachowane, opublikowano zbiorczą gałąź roboczą. Backend: **501 zaliczonych, 8 pominiętych testów PostgreSQL**; frontend: **233 zaliczone**, build poprawny. Naprawiono agregację odpowiedzi bez klasyfikacji, uaktualniono testy do istniejących granic autoryzacji oraz domknięto narzędzia kontaktów w PL/EN/DE/RU. Macierz 98 plansz opisuje 82 jawne odstępstwa i 16 pozycji zależnych od późniejszych etapów; nie oznacza to ich akceptacji. Aktualny bilans: `docs/qa/2026-09-30-p0-consolidated-review.md`. Wcześniejsze wyniki sześciu nieudanych testów są historyczne. Etap 1 nadal trwa; bez merge’a, wdrożenia, nowej wersji i rozpoczęcia etapu 2.

Przegląd 01.10: poprawiono czytelność wspólnego nagłówka wykrytą w edytorze szablonów na tablecie. Konkretny zakres odbioru odstępstw zapisano w `docs/qa/2026-10-01-p0-review-decisions.md`. Etap 1 nadal otwarty; bez zmiany kolejności, merge’a ani wdrożenia.

### Uzupełnienie etapu 8 — kalendarz CRM (05.10.2026)

Na prośbę użytkownika do następnego pakietu (etap 8) dołączamy zmianę obsługi wpisu kalendarza CRM: kliknięcie zadania lub spotkania otwiera okno informacji/szczegółów w trybie podglądu. Dopiero osobny przycisk „Edytuj” przełącza do formularza edycji. Samo otwarcie wpisu nie uruchamia edycji. Dostępność przycisku i zapis muszą respektować uprawnienia wdrażane w etapie 8. Test odbioru: kliknięcie wpisu → szczegóły → „Edytuj” → formularz; użytkownik bez prawa edycji może tylko przeglądać dane w swoim dozwolonym zakresie. Zmiana wchodzi do tego samego wydania, bez osobnego etapu ani aktualizacji.

### Uzupełnienie etapu 11 — prezentacja repozytorium i dokumentacja (05.10.2026)

Po ukończeniu instalatora, w tym samym pakiecie: przygotować dopracowane README GitHub z identyfikacją Sekaro, czytelną prezentacją funkcji, rzeczywistymi zrzutami, architekturą, wymaganiami i odsyłaczami do dokumentacji. Przygotować instrukcję świeżej instalacji, pierwszego uruchomienia, aktualizacji, backupu/odtworzenia i rozwiązywania typowych problemów, zgodną z finalnym instalatorem. Sprawdzić komendy na wspieranej ścieżce instalacji; nie opisywać funkcji planowanych jako gotowych. README i dokumentacja są częścią etapu 11, bez osobnego wydania. Publikacja na gałęzi wydania; dotychczasowa zasada braku samodzielnego merge do main pozostaje aktualna.

### Etap 9 — adaptery i Gmail (05.10.2026)

Pakiet implementacyjny: wspólna granica adapterów wysyłki/synchronizacji, odrzucanie nieznanych dostawców, prywatne połączenie Gmail przez administratora, szyfrowanie tokenów i migracja starych poświadczeń, reconnect bez konwersji SMTP, panel połączenia w 4 językach i instrukcja `docs/STAGE_9_GMAIL.md`. Nowe skrzynki mają wstrzymaną wysyłkę. Zachowano istniejące SMTP/IMAP, keep/immediate/days i EML. Poprawiono zachowanie Reply-To podczas ponowienia Gmail po odnowieniu tokenu.

Weryfikacja: pełny backend 589 zaliczonych / 9 pominiętych; dodatkowy końcowy zestaw Gmail 13/13 po dodaniu testów błędu odnowienia i Reply-To. Testy korzystają z SQLite i mockowanego Google; bez rzeczywistej wysyłki. Build frontendu poprawny (istniejące ostrzeżenie o wielkości bundla). UI: nowy panel, formularze skrzynek i języki w końcowym zestawie 70/70; poprawiono mock auth w testach po dodaniu administratorowego panelu. W pierwszym pełnym przebiegu UI wystąpił również timeout istniejącego podglądu harmonogramu; końcowe powtórzenie pełnego zestawu UI: **266/266**.

Status: przygotowanie do odbioru na obecnym demo, bez scalenia do main. Demo nie umożliwia rzeczywistego połączenia Google. Zgoda OAuth, odnowienie i synchronizacja prawdziwego konta oraz współbieżność PostgreSQL pozostają do weryfikacji na docelowej konfiguracji. Etap 10 (Microsoft 365) i etap 11 (instalator + README/dokumentacja) zachowują kolejność.

### Zatwierdzone rozszerzenia etapów 10–11 (05.10.2026)

Etap 10 obejmuje Microsoft 365 oraz dwie niezależne opcje per skrzynka, domyślnie wyłączone: stopkę HTML/plain text i podpis cyfrowy S/MIME z importowanego P12/PFX. Włączenie podpisu oznacza blokadę wysyłki przy błędzie, bez cichego przejścia na niepodpisaną wiadomość. Podpis powstaje po wszystkich zmianach MIME; nie obiecujemy omijania spamu. Klucze i hasła są szyfrowane.

Etap 11 obejmuje dodatkowo opcjonalne zdalne backupy S3/SFTP/FTPS: harmonogram, retencja, szyfrowanie przed transferem, test połączenia, historia i odtwarzanie. Błąd transferu zachowuje lokalną kopię. Zwykły FTP nie jest planowany. Bez dodatkowego etapu ani wydania.


### Etap 10 — pakiet implementacyjny (05.10.2026)

Microsoft 365: prywatny OAuth administratora z PKCE, zaszyfrowane tokeny i reconnect; istniejący adapter Graph, poprawiona ścieżka odpowiedzi MIME i atomowy zapis wiadomości/checkpointów synchronizacji. Nowe skrzynki mają wstrzymaną wysyłkę.

Stopki i S/MIME: dwa niezależne przełączniki, domyślnie wyłączone per skrzynka. Edytor stopki HTML/plain text, podgląd oraz import P12/PFX z szyfrowanym przechowywaniem. Włączony podpis z błędnym certyfikatem zatrzymuje wysyłkę; podpisywany jest końcowy MIME. Dokumentacja konfiguracji i ograniczeń: `docs/STAGE_10_MAIL.md`. Publiczne logowanie OAuth nie zostało włączone.

Końcowy pełny backend 609 zaliczonych / 9 pominiętych, frontend 272/272, build poprawny. Niezależna kontrola S/MIME przez OpenSSL, test zmiany treści, mocki transportów i OAuth, kontrola uprawnień i szyfrowania. Po poprawce Referrer-Policy dodatkowe 15/15 testów callbacków zaliczone. Nie wysłano realnych wiadomości. Odbiór docelowego OAuth/skrzynek/certyfikatu przez operatora pozostaje wymagany; SQLite nie potwierdza współbieżności PostgreSQL. Publikacja na gałęzi wydania, bez merge ani wdrożenia przez agenta.

Pozostaje etap 11: instalator, opcjonalne backupy S3/SFTP/FTPS i odtwarzanie, README oraz instrukcje instalacji/aktualizacji.

### Uzupełnienie etapu 11 — favicon i końcowy odbiór interfejsu (05.10.2026)

Na prośbę użytkownika do tego samego ostatniego pakietu dodajemy:

- Zastąpienie pozostałej favicon Quickly ikoną Sekaro. Sprawdzić odwołania w HTML, manifest i warianty ikon, jeśli istnieją, oraz odświeżenie ikony po aktualizacji przy zachowanej pamięci podręcznej przeglądarki.
- Pełny przegląd wizualny wszystkich modułów, formularzy, okien szczegółów i edycji, modali oraz nowych ekranów etapu 11. Sprawdzić odstępy, wyrównanie, typografię, zawijanie tekstu, przycięcia ikon, nakładanie elementów i niezamierzony przewijany obszar. Poprawić wykryte rozjazdy przed odbiorem.
- Kontrola Dark/Light, PL/EN/DE/RU oraz szerokości desktop/tablet/mobile. Każda kontrolka ma reagować na zmianę języka i motywu; sprawdzić także otwarte modale, etykiety, podpowiedzi i komunikaty. Treść użytkowników pozostaje niezmieniana.
- Test działania kontrolek: przyciski, przełączniki, pola, listy wyboru, zakładki, filtry, daty, paginacja i akcje w tabelach. Sprawdzić zmianę wartości/stanu, widoczną reakcję, zapis i odczyt po ponownym wejściu tam, gdzie ustawienie jest trwałe, anulowanie oraz ostrzeganie o niezapisanych zmianach. Kontrolki niedostępne muszą respektować uprawnienia i blokady demo.
- Sprawdzić stany ładowania, pustej listy, błędu, sukcesu i wyłączenia oraz obsługę klawiatury i widoczny fokus. Nie potwierdzać odbioru wyłącznie na podstawie buildu lub testów komponentów: potrzebny jest przegląd działającego UI w przeglądarce z checklistą i dowodami dla znalezionych/poprawionych błędów.

To rozszerzenie etapu 11, bez dodatkowej wersji ani drugiego demo. Testy nie mogą uruchamiać prawdziwych wysyłek lub transferów do zewnętrznych usług bez odpowiedniej konfiguracji i autoryzacji. Powyższe punkty są zaplanowane, nie oznaczają już wykonanej korekty favicon ani zakończonego QA.

### Etap 11 — kod do odbioru, 06.10.2026

Przygotowano instalator, opcjonalny cel S3/SFTP/FTPS, historię i odtworzenie przez istniejący podgląd, ClamAV dla restore, favicon Sekaro, README i dokumentację. Wyniki oraz jawnie otwarte bramki: `docs/STAGE_11_RELEASE.md`. Etap nie jest zamknięty: potrzebne są rzeczywiste próby Docker/dostawców/restore i pełne UI QA; przeglądarka w tej sesji nie pozwoliła wykonać odbioru wizualnego. Bez merge do main i wdrożenia przez agenta.

### Zgoda na scalenie i porządki — 06.10.2026

Operator polecił sprawdzenie i scalenie zbiorczego pakietu do main przed aktualizacją serwera oraz porządki w repozytorium. PR #38 obejmuje tę integrację. Usunięto śledzone wyniki kompilacji n8n (odtwarzane przez build/prepack) i nieużywane logo Quickly; uzupełniono ignorowanie plików generowanych i odsyłacze instalacji. Dowody QA, stare migracje i kompatybilne konfiguracje pozostają zachowane. Zgoda na merge nie zamyka otwartych bramek odbioru i nie oznacza wdrożenia przez agenta.
