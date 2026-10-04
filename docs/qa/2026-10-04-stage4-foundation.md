# Etap 4 — stabilna baza, 04.10.2026

Baza: wdrożony `ea78e1d`; gałąź `work/stage-4-stable-foundation-2026-10-04`.
Zakres i procedury: `docs/STAGE_4_OPERATIONS.md`.

Status: jeden pakiet przygotowany do prób operacyjnych. Nie wdrożono go przez agenta i nie scalono do main. Nie zatwierdzono oznaczenia 1.0.

## Dowody lokalne

- Pełna regresja backendu po zmianach: **541 passed, 9 skipped** (w tym 19 nowych przypadków etapu 4). Pominięte testy integracji nie są dowodem działania zewnętrznych transportów.
- Nowe testy: błąd restore 1 jest błędem, transakcja/exit-on-error, sekrety poza argv/komunikatem, jednorazowe staging i blokada path traversal, wymóg maintenance, niezależny URL rezygnacji bez trackingu, brak prywatnych tras publicznego procesu, GET/POST/idempotentny wynik i błąd DB, statyczna izolacja Compose, próbne scenariusze migracji/sygnatur i rollbacku na kontrolowanym wykonawcy Docker.
- Funkcja rezygnacji wykonana na PostgreSQL 18.3 przez PGlite 0.5.8 (WASM). Faktyczne `SET ROLE sekaro_unsubscribe`: odczyt tabel kontaktów, SMTP i użytkowników odrzucony, wykonanie funkcji dozwolone, powtórna rezygnacja nie dubluje suppression, zły token false, slot bez próby usunięty, niepewna próba i jej slot zachowane. Dowód: `2026-10-04-stage4-postgres.json`.
- Kompilacja Python i składnia skryptu Bash: PASS. Interfejs React nie był zmieniany w etapie 4; ostatni build i 240 testów UI dotyczą zaakceptowanego kodu etapu 3.

## Niewykonane próby — jawna bramka

W środowisku wykonawczym nie ma Dockera ani natywnego PostgreSQL. **Nie wykonano** rzeczywistego `pg_dump` PG15 → `pg_restore` PG17, buildów nowych Dockerfile ani testu komunikacji między sieciami kontenerów. PGlite i mocki nie zastępują tych prób.

Na istniejącym demo skrypt aktualizacji sam wymaga zgodności liczebności i sygnatur pełnych danych wszystkich tabel przed przełączeniem, zachowuje dump i stary wolumen. Wynik tej operacji należy dopisać tutaj przed uznaniem aktualizacji za odebraną. Następnie potwierdzić działanie aplikacji i blokady demo. Wystawienie osobnej domeny rezygnacji wymaga przygotowania operatora; nie otwarto panelu ani nowych publicznych tras w obecnej instalacji.

Przegląd bezpieczeństwa tego pakietu dotyczy backup/restore i granicy publicznej usługi. Nie jest certyfikacją całej aplikacji ani zakończeniem przyszłego etapu uprawnień użytkowników.
