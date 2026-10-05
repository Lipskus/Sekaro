# Etap 7 — projekt automatyzacji i raportów CRM

Baza: etap 6 `3a98261`, podstawowy odbiór demo w `qa/2026-10-05-stage6-sales.md`. Zakres odpowiada etapowi 7 planu wydań i Phase 3 roadmapy PR37. Ten dokument opisuje projekt, nie wdrożoną funkcję.

## Zachowania wspólne dla obu trybów wykonania

- Definicje reguł, rewizje, włączenie/wstrzymanie i niezmienna historia wykonań w prywatnym CRM.
- Wyzwalacze: odpowiedź przypisana do kontaktu/kampanii, zakończenie udziału kontaktu w kampanii, zmiana etapu/wyniku szansy, zaległe zadanie i utworzenie spotkania. Zakończenie udziału jednej osoby nie jest zakończeniem całej kampanii; etykiety rozróżniają te zdarzenia.
- Akcje: utworzenie zadania/follow-up, zmiana etapu powiązanej szansy i tag kontaktu. Przypisywanie właściciela wchodzi dopiero z modelem użytkowników etapu 8.
- Każda nowa reguła zaczyna jako wyłączona. Podgląd pokazuje źródło zdarzenia, rekord docelowy, planowane zmiany i przyczyny pominięcia. Włączenie nie odtwarza automatycznie całej historii sprzed aktywacji.
- Idempotencja `(reguła, zdarzenie)` z ograniczeniem UNIQUE w bazie; efekt i sukces w jednej transakcji. Ponowienie błędu zachowuje tożsamość wykonania; sukcesu nie można wykonać drugi raz.
- Jawna rewizja definicji przypięta do wykonania. Zmiana definicji nie podmienia planu istniejącego wykonania. Wstrzymanie blokuje kolejne wykonania, również oczekujące na zatwierdzenie.
- Zdarzenia wygenerowane przez automatyzacje nie uruchamiają kolejnych reguł. Limit liczby operacji na przebieg i dobę, stan błędu oraz ręczne ponowienie.
- Kontakty scalone/zarchiwizowane i szanse zarchiwizowane: ponowna kontrola przed wykonaniem, jawne pominięcie zamiast przepięcia ID bez audytu.
- Żadna z tych akcji nie wysyła wiadomości, nie dopisuje do kampanii, nie wznawia wysyłki i nie usuwa suppression. Rzeczywisty transport pozostaje wyłącznie w obecnym silniku outreach.
- W demo ręczne przetworzenie zdarzeń pozwala przetestować reguły bez uruchamiania schedulera wysyłkowego. W zwykłej instalacji korzystamy z istniejącego schedulera, bez czwartego kontenera.

## Decyzja produktowa: wykonanie dopasowanej reguły

A. Zatwierdzanie każdego wykonania: reguła tworzy propozycję, operator ogląda zmiany i zatwierdza. Stan `pending` przechodzi w `succeeded`, `skipped`, `failed` albo `rejected`. Największa kontrola, dodatkowe kliknięcie dla każdego zdarzenia.

B. Automatyczne wykonanie po świadomym włączeniu reguły: podgląd przed aktywacją, później akcje wykonują się bez zatwierdzania pojedynczych zdarzeń. Operator ma wstrzymanie, limity i pełny audyt. Mniej pracy bieżącej, ale reguła może sama zmienić etap szansy albo utworzyć wiele zadań.

Rekomendacja: obsłużyć oba tryby w jednym modelu, domyślnie A. Operator może jawnie wybrać B dla konkretnej reguły. To decyzja o sposobie pracy użytkownika, nie o technologii ani dodatkowym etapie wydania.

## Model przed implementacją UI

- `crm_automation_rule`: nazwa, aktywność, tryb, wyzwalacz, warunki JSON o zamkniętym schemacie, akcja JSON o zamkniętym schemacie, rewizja, data aktywacji i punkt startowy źródeł zdarzeń.
- `crm_automation_run`: FK reguły RESTRICT, klucz zdarzenia, kopia definicji i danych wejściowych, stan, liczba prób, planowane zmiany, wynik, bezpieczny komunikat błędu, autor zatwierdzenia/czas, unikalność reguła–zdarzenie.
- `crm_automation_audit`: trwała historia zmiany reguły, zatwierdzenia/odrzucenia, próby i wyniku; autor z sesji lub jawny aktor systemowy.
- Trwały checkpoint obserwowanych źródeł, aby restart nie gubił zdarzeń ani nie uruchamiał przeszłości. Etap/wynik korzysta z SalesEvent; odpowiedź z LeadReply. Zdarzenia zaległości i zakończenia udziału mają deduplikowany klucz tożsamości i warunek bieżącego stanu.
- Tagi jako osobne rekordy/relacje kontaktu, bez nadpisywania własnych pól i bez mylenia z suppression.
- Migracja addytywna, brak zmian ID kampanii, korespondencji i kontaktów. Backup całej bazy obejmuje nowe tabele.

## Raporty i definicje miar

- Lejek: liczba i wartość szans w etapach; konwersja `wygrane/(wygrane+przegrane)` z widocznym mianownikiem, bez sugerowania, że szanse otwarte są przegranymi.
- Wartość wygranych i otwartego pipeline osobno dla każdej waluty; brak sumowania PLN i EUR ani przeliczania po nieokreślonym kursie. To wartość szans, nie przychód księgowy.
- Aktywności według rodzaju/statusu/terminu. Dashboard zaległości, nieaktywnych szans i osób wymagających kolejnego działania; reguła bezczynności i okres jawne.
- Filtry dat i pipeline, przekrój kampanii, skrzynki oraz wybranego pola własnego kontaktu.
- Atrybucja źródła: ostatnia wysyłka sprzed utworzenia szansy, powiązana z kontaktem/grupą scalenia; przy równym czasie najwyższe ID. Jedno przypisanie na szansę zapobiega wielokrotnemu sumowaniu. Wyraźnie opisana heurystyka, rekordy bez dowodu jako „Nieprzypisane”.
- Zakres dat musi wskazywać, czy dotyczy utworzenia szansy, zamknięcia czy terminu działania. Pełne agregaty po stronie serwera niezależnie od paginacji UI.

## Odbiór jednego pakietu

Testy: podgląd bez mutacji, wykonanie zgodne z wybranym trybem, wstrzymanie, konflikt rewizji, ponowienie po błędzie, duplikat zdarzenia, restart checkpointu, blokada pętli, granice dat, waluty, źródło bez podwójnego liczenia, suppression przed/po. Następnie migracja i QA na tym samym demo. Publikacja jednej gałęzi i jedna aktualizacja po zakończeniu pakietu; bez automatycznego merge'a ani wdrożenia przez agenta.
