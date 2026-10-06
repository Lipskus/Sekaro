# Etap 6 — odbiór demo 05.10.2026

Operator zgłosił wdrożenie pakietu `3a98261`. Po zalogowaniu i odświeżeniu aplikacji pojawiła się pozycja Sprzedaż. Nie odczytywano etykiety commita kontenera; identyfikacja wdrożenia opiera się na zgłoszeniu operatora i nowych funkcjach.

W tej samej instalacji utworzono pipeline „QA sprzedaż 20261005” z etapami Rozmowa/Oferta, szansę „QA — wdrożenie portowe” (1250,50 PLN, 40%, osoba 61 i firma 61), zadanie „QA — kontakt po ofercie” i spotkanie „QA — spotkanie projektowe”.

Potwierdzono zapis/odczyt, zmianę etapu i wygraną, historię dwóch wersji z autorem demo i czasem, powiązania następnego działania, przypomnienie, zbiorcze zakończenie 1/1 i filtr wszystkich statusów. Kalendarz pokazał zadanie 06.10 o 10:00 oraz spotkanie 07.10 14:00–15:00 Europe/Warsaw. Przejście z firmy otworzyło filtr company_id=61 z szansą. Dane QA pozostawiono jako przykłady.

Wizualnie sprawdzono jasny formularz i kalendarz oraz ciemny pipeline/listę. Przywrócono motyw systemowy. Nowe widoki mają widoczne panele, obramowania, kolumny i karty. Nie wykonano pełnego porównania z osobnymi zatwierdzonymi PNG ani odbioru mobile (brak sterowania viewportem w użytym interfejsie).

Początkowe wpisanie datetime-local przez Playwright fill nie przeniosło wartości do formularza React. Użycie natywnego AX setValue zapisało poprawne daty. To ograniczenie ścieżki automatyzacji testu, nie dowód błędu dat po stronie aplikacji.

Nie wykonywano wysyłki ani zaproszeń. Banner demo nadal potwierdza blokadę wysyłki/synchronizacji. Bezpieczeństwo transportu, konflikty rewizji i granice miesięcy były sprawdzone testami lokalnymi opisanymi w STAGE_6_SALES.md.

Odbiór funkcjonalny podstawowego przebiegu zakończony. Ograniczenia: wizualny mobile, pełna macierz stanów i lokalizacja surowych wartości historii pozostają niepotwierdzone/niedopracowane. Nie oznacza to odbioru referencyjnego 1:1 ani zmiany numeru na 1.0.
