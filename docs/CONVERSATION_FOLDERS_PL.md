# Archiwum i Kosz w Odebranych

Po otwarciu wątku dostępne są przyciski „Archiwizuj wątek” i „Przenieś do kosza”.
Zakładki Archiwum i Kosz pozwalają znaleźć odłożone rozmowy i przywrócić je na
listę główną. Przeniesienie do Kosza wymaga potwierdzenia.

Operacje dotyczą całych wątków i są wspólne dla użytkowników instalacji.
Nie kasują pojedynczych wiadomości, historii CRM ani poczty u dostawcy.
Kosz nie ma automatycznego opróżniania ani trwałego usuwania.
Nie zatrzymuje również kampanii i nie zastępuje listy wykluczeń.

Wątki w Archiwum i Koszu nie są liczone w powiadomieniach o nieprzeczytanych
odpowiedziach. Nowszy znacznik czasu aktywności wątku przywraca go na listę główną.
Synchronizacja tych samych wiadomości lub starszej historii nie zmienia folderu.
Szkic odpowiedzi pozostaje dostępny w bieżącej sesji po przywróceniu wątku.

Aktualizacja tworzy dodatkową tabelę `conversation_state` przy uruchomieniu
aplikacji. Nie wymaga zmiany konfiguracji SMTP, Gmail ani Microsoft 365.
Standardowa kopia bazy obejmuje stan folderów.

API: `POST /api/unibox/conversation-folder` przyjmuje `inbox_id`, `thread_id`
i `folder` (`inbox`, `archive`, `trash`). Wymaga uprawnień odczytu i zapisu poczty.

Weryfikacja: 59 testów backendu, 9 testów szkiców i akcji wątków, build frontendu
oraz 18 widoków testowych w szerokościach 390/768/1600 px, jasnych i ciemnych.
Testy używają lokalnych danych i nie modyfikują skrzynek produkcyjnych.
