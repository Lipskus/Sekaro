# Etap 5 — rdzeń CRM

Jeden pakiet na bazie wdrożonego etapu 4 (`c94de57`). Nie rozpoczyna etapów sprzedaży, automatyzacji ani uprawnień użytkowników. Nie zmienia numeru produktu na 1.0.

## Model i migracja

- Osobą pozostaje istniejący `Lead`. Nie przenosimy ID kampanii, wiadomości, odpowiedzi ani tokenów rezygnacji.
- Profil CRM określa rodzaj: nieokreślony, osoba, skrzynka ogólna. Stare rekordy pozostają nieokreślone; operator klasyfikuje je świadomie. Adres typu `info@` nie jest automatycznie utożsamiany z osobą.
- `Lead.email` pozostaje adresem wysyłki i jest prezentowany w CRM wraz z dodatkowymi adresami z `contact_address`. Dodatkowe adresy służą do ewidencji i wyszukiwania; nie przełączają istniejących kampanii na innego odbiorcę.
- Firmy mają własną tożsamość, opis, domenę, archiwizację i historię autora/czasu. Relacja firma–kontakt jest wiele-do-wielu i ma rolę/stanowisko. Firma nie musi mieć osób; kontakt nie musi mieć firmy. Archiwizacja firmy nie zmienia stanu wysyłki osób.
- Jednorazowa migracja przenosi jawne wartości pól `company`, `firma`, `Company`, `Firma` do firm i relacji. Każdy rekord źródłowy tworzy osobny rekord firmy do przeglądu: identyczna nazwa ani domena nie stanowią dowodu tej samej firmy. Stare pola pozostają dostępne szablonom. Aby uporządkować duplikaty firm, powiąż osoby z wybraną firmą, usuń zbędne relacje i zarchiwizuj pozostałe firmy.
- Migracja ma własny znacznik i blokadę transakcyjną PostgreSQL. Kolejny start nie odtwarza usuniętych relacji ani nie nadpisuje edytowanych firm. Późniejszy import korzysta z dotychczasowego importera i FieldManager; nowe relacje operator przypisuje w CRM, bez automatycznego dopasowania firm po nazwie.
- Notatki są dopisywane z autorem i czasem, bez podmiany autorstwa z żądania klienta. Są trwałymi wpisami, a nie edytowalnym polem historii.

## Scalanie i ochrona wysyłki

1. W obu rekordach ustaw rodzaj „Osoba”. W profilu zachowywanego kontaktu otwórz CRM, znajdź drugi rekord i wybierz „Porównaj”.
2. Dla konfliktujących nazw i własnych pól wybierz źródło wartości. Puste pola są uzupełniane. Podgląd zawiera ID i adresy obu stron.
3. Potwierdź scalenie. Serwer ponownie odczytuje i blokuje rekordy, porównuje fingerprint podglądu i odrzuca nieaktualne decyzje.
4. Źródło zostaje zarchiwizowane i wskazuje zachowany kontakt. Nie usuwamy źródła ani nie przenosimy jego korespondencji. CRM zachowanego kontaktu pokazuje wspólne adresy, firmy, notatki, operacje i odnośniki do historii oryginalnych rekordów. Kampanie i wiadomości pozostają pod źródłowymi ID.
5. Kampanie obu rekordów są wstrzymane. Niewykonane sloty są usuwane, a niepewne próby wysyłki i ich sloty pozostają. Przywrócenie źródła lub usunięcie któregokolwiek rekordu scalenia jest blokowane. Import nie nadpisuje dołączonego rekordu.
6. Blokady nie znikają: rezygnacja/suppression przy scaleniu obejmuje znane adresy osoby. Również późniejsza rezygnacja na starym rekordzie blokuje wysyłkę do zachowanej osoby przez wspólną kontrolę przed transportem. Metadane istniejących suppression i niepewne próby nie są nadpisywane.

Scalenie jest trwałe; panel nie udostępnia rozdzielenia rekordów. Źródłem kolejnego scalenia może być pojedyncza osoba, a celem również istniejąca grupa. Nie dopuszczamy łańcuchów aliasów. Wpis audytu zawiera wybrane wartości oraz poprzednie dane obu kontaktów.

## Prywatny interfejs

Nowa pozycja „Firmy” i zakładka „CRM” w istniejącym profilu kontaktu. Wspólne Shell, Modal, potwierdzenia, pola i obsługa błędów; etykiety PL/EN/DE/RU. API `/api/crm/*` wymaga istniejącego logowania. W demo dozwolone są tylko lokalne operacje CRM; blokady transportu pozostają aktywne. Publiczna usługa rezygnacji nie otrzymuje nowych tras ani dostępu do tabel CRM.

## Aktualizacja demo i odbiór

Zbuduj obraz z dokładnego commita pakietu i użyj `bash scripts/sekaro-demo.sh up`. Skrypt zachowuje override PostgreSQL 17. Nie uruchamiaj ponownie migracji PG15→17. Przed aktualizacją zachowaj kopię bazy (nowe tabele CRM powstają podczas startu). Nie scalono do main i agent nie wdrożył pakietu.

Do odbioru na istniejącym demo: firma z dwoma osobami, osoba bez firmy, adres i notatka, konflikt scalania i wspólna historia, zachowane blokady i stary profil źródłowy. Szczegóły dowodów i ograniczeń: `docs/qa/2026-10-04-stage5-crm.md`.
