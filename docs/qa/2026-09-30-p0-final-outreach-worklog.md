# P0 — roboczy postęp zbiorczego pakietu

Nie jest wydaniem do aktualizacji VPS. Plan 11 etapów i kolejność CRM pozostają bez zmian. Zamknięta lista pozostałego P0: `2026-09-30-p0-final-scope.md`.

## Zmiany

- Odbiorcy kampanii: PL/EN/DE/RU w filtrach, statusach, formularzach dodawania, imporcie, potwierdzeniach i wynikach operacji. Stan formularzy i filtry zachowują kody API. CSV kontaktów zachowuje techniczne nagłówki, statusy oraz dane użytkownika.
- Analityka kampanii i globalna: lokalizacja zakresów, walidacji, serii, etykiet i nagłówków CSV; wartości i źródła wskaźników bez zmian. Wspólna funkcja CSV zachowuje domyślne polskie nagłówki dla dotychczasowych wywołań. Zmiana języka nie pobiera ponownie raportu i nie kasuje wybranego zakresu/filtrów.
- Usunięcie odbiorcy i szablonu przekazuje jawne `danger:true` do potwierdzenia, niezależnie od języka.
- Szablony w DEMO: wyłączony formularz testowy i blokada także w funkcji obsługi submit; podgląd nadal dozwolony. Backend miał już blokadę DEMO — poprawka dotyczy spójności UI, nie nowej gwarancji transportu.
- Jedna checklista P0-01–P0-10 i zasada jednej publikacji całego pozostałego pakietu. Nie rozpoczęto etapu 2.

## Weryfikacja

- Pełny frontend: **184 testy, 21 plików — zaliczone**. Siedem nowych regresji języka sprawdza szkic, filtry, anulowanie usuwania, zakres i walidację dat, brak ponownych odczytów po zmianie języka oraz zachowanie danych CSV. Dwa testy szablonów sprawdzają brak test-send w DEMO (także programowe submit), działający podgląd oraz anulowanie usuwania.
- Backend: **41 testów `test_outbound_safety.py` i `test_demo.py` — zaliczone**. Izolowany SQLite i mockowany transport, bez rzeczywistych wysyłek. Nie jest to test migracji ani restore PostgreSQL. Pozostają istniejące ostrzeżenia SQLAlchemy i datetime.utcnow.
- Build produkcyjny zaliczony; pozostaje dotychczasowe ostrzeżenie Vite o dużym chunku.
- **48 wariantów UI**: odbiorcy z filtrami, formularz dodawania, analityka kampanii, analityka globalna × DE/RU × Dark/Light × 1600/768/390 px. Brak wykrytych błędów JavaScript, przepełnienia strony i problemów geometrii/fokusu dialogu. Figtree załadowane. Wszystkie API podmienione na fixtures, zewnętrzne originy blokowane.
- Obejrzano DE odbiorcy tablet Dark, RU dodawanie mobile Light oraz DE analityka desktop Dark. Nie jest to pełny odbiór wszystkich przewijanych fragmentów ani porównanie 98 plansz.
- Klucze i parametry czterech słowników spójne. Nazwy kampanii, kontaktów i treść pól nie są tłumaczone.

Macierz i trzy obejrzane zrzuty: `evidence-2026-09-30/final-outreach/`. Całą macierz można odtworzyć przez `scripts/check-p0-ui.cjs` z `P0_UI_WORKFLOWS=1`, `P0_UI_FLOWS=campaign-recipients,campaign-recipient-add,campaign-analytics,global-analytics`, `P0_UI_LANGUAGES=de,ru` oraz ścieżkami Playwright i Chromium. Wcześniejsze raporty opisują historyczne wyniki — nie sumować ich jako nowego odbioru.

## Granica tego punktu kontrolnego

Nie opublikowano wydania ani nie zmieniono demo, main, ROADMAP.md lub wersji produktu. Pełny pozostały zakres P0 nie jest zakończony. Otwarte pozycje nadal widnieją w zamkniętej checkliście; nie uznano ich za zaakceptowane odstępstwa. Następna komenda aktualizacji ma dotyczyć kompletnego zbiorczego pakietu.
