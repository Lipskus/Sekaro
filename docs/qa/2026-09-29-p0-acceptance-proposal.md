# P0 — odbiór wdrożenia i propozycja granicy etapu

Status: **propozycja odbioru z jawnymi ograniczeniami; nie końcowa akceptacja użytkownika**.

## Sprawdzona baza

29.09.2026 ponownie sprawdzono remote: main `ca9a544756ca94b72cbabc7cafc0c4e9babb4939`, branch P0 `c83d9ee284d585aabb20ddefd7fe29143792f2dc`. Jedyny otwarty PR: #37. Nie zmieniono ROADMAP.md, main ani kolejności faz PR37.

Po zgłoszeniu wdrożenia przez użytkownika odświeżono istniejące demo i sprawdzono podgląd pierwszego kroku kampanii. Potwierdzono: fokus na przycisku zamknięcia, fokus wewnątrz dialogu, `body.overflow=hidden`, `overflow-wrap:anywhere` w temacie i treści, Escape zamyka dialog, przywraca przewijanie i fokus na przycisku Podgląd. Testowa wysyłka pozostaje wyłączona w DEMO. Nie wykonano wysyłki ani zapisu danych.

To dowód wdrożonego zachowania, nie niezależny odczyt SHA z VPS. UI nadal pokazuje 0.5.6; numer nie identyfikuje commita. Kontrola live dotyczyła dostępnego desktopowego viewportu, nie telefonu/tabletu.

## Dodatkowe dowody lokalne

Na drzewie kodu c83d9ee uruchomiono istniejący `scripts/check-p0-ui.cjs`: sześć tras (`/campaigns`, `/leads`, `/unibox`, `/templates`, `/inboxes`, `/analytics`), stany error/loading, Dark/Light, 1600×900, 768×1024, 390×844. **72 przypadki, zero wykrytych błędów JavaScript i poziomego przepełnienia dokumentu; Figtree załadowany.** Wszystkie API zastąpione fixture, zewnętrzne połączenia blokowane. Nie jest to test backendu ani odbiór VPS w tych rozmiarach.

Manifest: `evidence-2026-09-29/states/ui-matrix.json`. Repo zawiera cztery obejrzane zrzuty: błąd kampanii mobile Dark, ładowanie skrzynek mobile Light, błąd Inbox tablet Dark, błąd analityki desktop Light. Pozostałe zrzuty powstają przez odtworzenie macierzy. Automatyczny pomiar nie potwierdza działania retry ani pełnej zgodności semantycznej każdego stanu. W analityce i Inbox występują dwa niezależne komunikaty awarii przy niedostępności kilku API; nie interpretować ich jako dwóch udanych odczytów lub pustych danych.

Wyniki wcześniejszego pakietu (nie nowe uruchomienie w tym odbiorze): 129 testów backendu, 135 frontendu, build oraz 36 przepływów formularzy; szczegóły w `2026-09-29-p0-forms-responsive.md`.

## Makiety i języki — jawne ograniczenia

Odnaleziono i rozpakowano dokładny `sekaro-ui-mockups-98.zip`, przeczytano README i manifest. W tym odbiorze obejrzano plansze 065 i 079 w pełnym rozmiarze. Pokazują zestawienia kilku stanów naraz, a działający UI pokazuje stan właściwy dla aktualnej operacji. Nie traktować tych zestawień jako obowiązku jednoczesnego pokazywania błędu, ładowania i sukcesu. Nie wykonano ponownego pełnego porównania wszystkich 98 plansz.

Wcześniejszy raport `2026-09-28-responsive-final-audit.md` wskazuje serię 063–096 jako referencję wspólnego shella; starsze plansze mają różną geometrię i kompozycję. Proponowany odbiór obejmuje Figtree, wspólne komponenty i sprawdzone działające przepływy, z zachowaniem otwartej listy różnic. Nie oznacza pełnego 1:1.

Kod `LanguageContext` ma PL/EN/DE/RU, ale w aktywnych widokach korzystają z niego głównie Shell, Login i część Settings. Treści modułów nadal zawierają teksty polskie. Propozycja: przyjąć obecny zakres językowy dla przejścia do etapu 2, a pełną lokalizację potraktować jako oddzielny zakres do uzgodnienia przed bramką 1.0. Nie usuwać obecnych języków ani nie przedstawiać ich jako pełnych tłumaczeń aplikacji. To decyzja produktowa, nie automatycznie zatwierdzone przesunięcie zakresu.

## Dokąd należą braki backendu z referencji

Poniższe przypisanie jest propozycją planowania; nie zatwierdza nowych funkcji.

| Brak z raportu backend-reference-gaps | Miejsce rozstrzygnięcia |
|---|---|
| Reputation, blacklist, historia DNS, wskaźniki outreach i deduplikowane lejki | Etap 3 — definicje metryk i zakres przed 1.0; brak źródła oznacza brak danych |
| Lejek spotkań, dane procesu sprzedaży | Etapy 6–7 — po wdrożeniu prawdziwych zdarzeń CRM |
| Historia testów połączeń i synchronizacji SMTP/IMAP | Etap 9 — diagnostyka adapterów, zachować bieżące testy i retencję |
| Sesje, historia backup/restore, diagnostyka systemu | Etap 4 — wymagany zakres operacyjny; pełne wykresy CPU/RAM i restart nie są automatycznie zamówione |
| Quiet hours, digest, nowe kanały powiadomień | Decyzja zakresu automatyzacji, etap 7; nie dodawać nowych integracji bez zgody |
| Metadane i użycie szablonów, metadane kampanii | Rozstrzygnięcie etapu 3; opiekunowie zależą od etapu 8 |
| Przeplanowanie/skip/send-now kolejki | Decyzja zakresu przed 1.0; osobny kontrakt bezpieczeństwa i audytu, nie poprawka wizualna P0 |
| Logi webhook/MCP | Minimalna diagnostyka: etap 4; pełna historia wykonania: decyzja etapu 7 |

Upgrade PostgreSQL, backup/restore i izolacja publicznej rezygnacji pozostają otwartymi bramkami etapu 4. Lokalny SQLite/create_all ich nie zalicza. Brak dowodu tych bramek uniemożliwia deklarację stabilnego 1.0, nie wymusza odtwarzania niedostępnych dashboardów w P0.

## Konkretny następny pakiet: etap 2

Jeden pakiet do wdrożenia, z backendem, migracją, UI i regresjami razem:

- Archiwizacja i przywrócenie obecnego Lead, pojedynczo oraz obsługa widoku aktywne/archiwum. Nie tworzyć nowej tabeli osób ani firm.
- Trwały zapis operacji z ID kontaktu, autorem i czasem, do późniejszego wykorzystania w historii CRM. Przy nieznanym autorze nie przypisywać operacji obecnemu administratorowi.
- Zachować ID, powiązania list i kampanii, EmailLog, LeadReply i tokeny wypisania. Archiwizacja nie używa istniejącego usuwania.
- Oddzielić stan archiwizacji od istniejącego Lead.status i globalnego suppression. Nie definiować teraz nowego, niezatwierdzonego słownika statusów CRM.
- Zablokować przyszłe wysyłki do zarchiwizowanego kontaktu we wszystkich ścieżkach i przy końcowej kontroli przed transportem. Zaplanowaną kolejkę obsłużyć jawnie; nie pozostawiać wiadomości, które automatycznie odżyją po przywróceniu.
- Przywrócenie nie znosi suppression, nie wznawia zapisów kampanii i nie kolejkuje wiadomości. Ewentualne późniejsze wznowienie to osobna świadoma operacja.
- Wykorzystać obecne listy, profil kontaktu, Modal i ConfirmContext. W etapie 5 rozbudować ten sam model o adresy/firmy; nie przepisywać archiwizacji drugi raz.

Przed implementacją doprecyzować w kodzie schemat zdarzeń, statusy kolejki i obsługę współbieżności. Warunek wydania: migracja istniejącej bazy PostgreSQL, zachowanie powiązań i historii, odporność na powtórzenie żądania, wyścig archive/send, blokada transportu po archiwizacji i brak automatycznej wysyłki po restore. Testy wysyłki wyłącznie z mockiem. To zakres następnego pakietu, nie deklaracja wykonania tych testów.

## Decyzja do odbioru

Rekomendacja: przyjąć P0 z opisanymi ograniczeniami językowymi i wizualnymi oraz przejść do etapu 2. Pełne 1:1, pełna lokalizacja i bramka 1.0 pozostają jawnie otwarte. Alternatywa: przed etapem 2 rozszerzyć P0 o pełne tłumaczenie treści modułów PL/EN/DE/RU i dalszy odbiór referencji. Nie zaznaczać P0 jako zaakceptowanego bez decyzji użytkownika.

Ten dokument i nowe dowody QA nie zmieniają kodu uruchomieniowego. Nie wymagają przebudowy ani restartu demo.
