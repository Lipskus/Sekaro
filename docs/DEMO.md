# Sekaro — izolowane demo do QA

Demo korzysta z istniejącego obrazu `sekaro:local` i osobnej bazy PostgreSQL.
Nie wymaga budowania obrazu: dodatkowy moduł `app/demo` jest montowany tylko do
kontenera demo. Wersja interfejsu pochodzi z obecnego obrazu; aktualizacja kodu
przez `git pull` sama nie aktualizuje UI zapisanego w obrazie.

## Uruchomienie na VPS

W katalogu repozytorium (np. `/opt/sekaro`):

```bash
bash scripts/sekaro-demo.sh up
```

Potrzebne są Docker Compose v2 obsługujący `--wait`, Python 3 oraz obraz
`sekaro:local`. Skrypt tworzy osobne, losowe hasła w `.sekaro-demo/env` (0600,
wykluczony z Git). Po udanym uruchomieniu wyświetla login `demo` i hasło.
Nie trzeba korzystać z produkcyjnego konta użytkownika ani podawać jego hasła.

Demo słucha wyłącznie na `127.0.0.1:5051`. Produkcja na `5050` pozostaje osobną
instancją. Dostęp przez przeglądarkę wymaga skierowania chronionej przez
Cloudflare Access/Zero Trust nazwy hosta na `http://127.0.0.1:5051` (gdy tunel
działa na hoście). Można też tymczasowo zmienić origin istniejącego chronionego
hosta z portu `5050` na `5051` i po QA przywrócić `5050`. Zachowaj tę samą
politykę Access. Jeżeli connector tunelu działa w kontenerze, jego `localhost`
nie oznacza hosta VPS — użyj właściwego adresu hosta dostępnego dla connectora.

Alternatywa do lokalnej przeglądarki:

```bash
ssh -L 5051:127.0.0.1:5051 ubuntu@ADRES_VPS
```

Następnie otwórz `http://localhost:5051`. Pasek u góry oznacza instancję DEMO.
Przy porównaniach PNG uwzględnij dodatkowe 30 px wysokości paska.

## Dane i zachowanie

- 60 fikcyjnych kontaktów, 3 listy i pola dodatkowe;
- 6 kampanii: aktywne, wstrzymana, zakończone przypisania, szkic bez kontaktów
  i kampania z brakującymi treściami personalizowanymi;
- 3 skrzynki ze stanami demonstracyjnymi: dostępna, wstrzymana/błąd, rozgrzewanie;
- 48 zapisanych pozycji kolejki (widok pokazuje pozycje przyszłe),
  120 historycznych zapisów wysyłki z 30 dni, otwarcia, kliknięcia i odpowiedzi;
- 12 rozmów / 36 wiadomości, 4 szablony po 3 wersje, 12 powiadomień.

Wszystkie adresy są fikcyjne w domenie `.invalid`; zapis statystyk nie oznacza
wysłania wiadomości. Początkowe daty są liczone względem uruchomienia.
Ponowne uruchomienie zachowuje edycje i nie duplikuje danych. Reset odświeża
daty i przywraca zestaw początkowy. Motywy Dark/Light działają jak w produkcji.

Demo nie uruchamia harmonogramu, automatycznego IMAP, MCP ani zadań backupu.
SMTP/IMAP są zablokowane w procesie. API blokuje wysyłkę testową, odpowiedzi,
synchronizację, podłączanie integracji i odtwarzanie backupów. Edycja kontaktów,
kampanii, lokalnych parametrów skrzynek i szablonów pozostaje dostępna.
Przeliczenie kolejki po edycji może zmienić jej demonstracyjny układ.

Kontenery mają własną sieć Docker `internal`, bez połączenia z siecią produkcji,
bez jej `.env`, haseł, wolumenów i backupów. Baza demo nie ma portu hosta.
Seeder odmawia działania na innej bazie/użytkowniku/hoście i w bazie z istniejącymi
danymi bez znacznika demo. Zwykły `app.main:app` nie importuje modułu demo.

## Obsługa

```bash
bash scripts/sekaro-demo.sh status  # kontenery i zdrowie
bash scripts/sekaro-demo.sh logs    # ostatnie logi aplikacji
bash scripts/sekaro-demo.sh login   # początkowy login i hasło
bash scripts/sekaro-demo.sh stop    # zwolnij RAM po QA; dane zostają
bash scripts/sekaro-demo.sh up      # uruchom ponownie
bash scripts/sekaro-demo.sh reset   # usuń TYLKO bazę demo i odtwórz przykłady
bash scripts/sekaro-demo.sh remove  # usuń kontenery i bazę TYLKO demo
```

`reset` i `remove` pracują wyłącznie na projekcie Compose `sekaro-demo`.
Plik haseł pozostaje po usunięciu demo. Reset przywraca zapisane w nim hasło
początkowe, również jeśli wcześniej zmieniono je w interfejsie.
Na VPS z 1 GB RAM uruchamiaj demo na czas testów i zatrzymuj po ich zakończeniu.
