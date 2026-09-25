import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { PageFrame, SectionTabs, Metric } from '../redesign/ui';
import {
  RiShieldCheckLine,
  RiMailSendLine,
  RiFileTextLine,
  RiAlertLine,
  RiCheckLine,
  RiArrowDownSLine,
} from 'react-icons/ri';

const sections = [
  {
    id: 'setup',
    label: 'Przed wysyłką',
    icon: RiShieldCheckLine,
    rules: [
      {
        title: 'Zweryfikuj domenę nadawczą',
        body: 'Domena nadawcza potrzebuje poprawnych rekordów uwierzytelniających, aby serwery pocztowe mogły ufać wiadomościom. SPF i DKIM są wymagane.',
        tag: 'Wymagane',
      },
      {
        title: 'Używaj osobnej domeny do cold outreach',
        body: 'Nie wysyłaj cold mailingu z głównej domeny firmowej. Użyj osobnej domeny lub subdomeny przeznaczonej tylko do outreachu. W razie wysokiej liczby odbić lub skarg reputacja głównej domeny pozostanie odizolowana.',
        tag: 'Wymagane',
      },
      {
        title: 'Rozgrzewaj nowe skrzynki',
        body: 'Nową skrzynkę należy rozgrzać przed rozpoczęciem regularnej wysyłki. W ustawieniach skrzynki włącz stopniowe zwiększanie limitu. Rozgrzewanie przez 2–4 tygodnie pomaga budować reputację nadawcy i ograniczać trafianie wiadomości do spamu.',
        tag: 'Wymagane',
      },
      {
        title: 'Zweryfikuj listę kontaktów',
        body: 'Przed uruchomieniem kampanii zweryfikuj adresy kontaktów. W Ustawieniach włącz weryfikację e-mail i skonfiguruj obsługiwanego dostawcę. Po włączeniu tej funkcji nowe kontakty dodawane do kampanii mogą być sprawdzane automatycznie.',
        tag: 'Zalecane',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Treść wiadomości',
    icon: RiFileTextLine,
    rules: [
      {
        title: 'Czysty tekst czy HTML — kiedy czego używać',
        body: 'Jeśli nie śledzisz otwarć ani kliknięć, rozważ wysyłkę w czystym tekście. Jest prostsza i nie wymaga elementów HTML używanych do trackingu. Śledzenie otwarć i kliknięć wymaga HTML; przy małej skali często wystarczy mierzenie odpowiedzi.',
        tag: null,
      },
      {
        title: 'Przy trackingu rozważ pierwszy e-mail w czystym tekście',
        body: 'Jeżeli korzystasz ze śledzenia otwarć lub kliknięć, pierwszy e-mail w sekwencji może pozostać w czystym tekście bez trackingu, a kolejne wiadomości mogą używać HTML. Ogranicza to złożoność pierwszej wiadomości budującej wątek.',
        tag: 'Wskazówka',
      },
      {
        title: 'Pisz naturalnie i konkretnie',
        body: 'Stosuj krótkie zdania, konkretny cel i naturalny język. Unikaj pustych formułek i długich, formalnych akapitów, które utrudniają szybkie zrozumienie wiadomości.',
        tag: null,
      },
      {
        title: 'Personalizuj więcej niż tylko imię',
        body: 'Samo imię to podstawowa personalizacja. Wykorzystuj informacje rzeczywiście związane z odbiorcą — np. kontekst firmy, obszar działalności lub konkretny problem, do którego odnosi się wiadomość.',
        tag: null,
      },
      {
        title: 'Jedno główne wezwanie do działania',
        body: 'Zakończ wiadomość jednym, prostym wezwaniem do działania. Kilka równoległych próśb utrudnia odbiorcy podjęcie decyzji i osłabia czytelność wiadomości.',
        tag: null,
      },
      {
        title: 'Unikaj załączników w pierwszym kontakcie',
        body: 'Załączniki mogą zwiększać ryzyko filtracji i obniżać zaufanie do pierwszej wiadomości. Jeśli musisz udostępnić materiał, rozważ bezpieczny link.',
        tag: null,
      },
    ],
  },
  {
    id: 'sending',
    label: 'Bezpieczna wysyłka',
    icon: RiMailSendLine,
    rules: [
      {
        title: 'Wysyłaj w godzinach pracy odbiorcy',
        body: 'Dopasuj okno wysyłki do strefy czasowej i typowych godzin pracy odbiorcy. Wiadomość wysłana w środku nocy może zostać łatwo przeoczona.',
        tag: null,
      },
      {
        title: 'Utrzymuj konserwatywny limit dzienny na skrzynkę',
        body: 'Nawet po rozgrzaniu skrzynki utrzymuj umiarkowany dzienny wolumen. Jeśli potrzebujesz większej skali, rozdzielaj wysyłkę między skrzynki zamiast nadmiernie obciążać jedną.',
        tag: null,
      },
      {
        title: 'Rozkładaj wysyłkę w czasie',
        body: 'Nie wysyłaj całej listy jednocześnie. Rozłóż wiadomości w ciągu dnia i stosuj odstępy oraz jitter, aby ograniczyć gwałtowne skoki wolumenu.',
        tag: null,
      },
      {
        title: 'Utrzymuj krótkie sekwencje',
        body: 'Większa liczba follow-upów nie zawsze zwiększa liczbę odpowiedzi. Ogranicz sekwencję do kilku wiadomości i przerwij ją po odpowiedzi lub wypisaniu.',
        tag: null,
      },
    ],
  },
  {
    id: 'reputation',
    label: 'Reputacja nadawcy',
    icon: RiAlertLine,
    rules: [
      {
        title: 'Natychmiast obsługuj odbite adresy',
        body: 'Odbicie oznacza, że adres nie przyjął wiadomości. Zatrzymaj dalszą wysyłkę do takich adresów i regularnie kontroluj poziom odbić. Weryfikacja e-mail może automatycznie ograniczać liczbę niepoprawnych adresów przed wysyłką.',
        tag: 'Krytyczne',
      },
      {
        title: 'Respektuj każde wypisanie',
        body: 'Każdą prośbę o zaprzestanie kontaktu należy respektować i blokować dalszą wysyłkę zgodnie z obowiązującymi zasadami oraz konfiguracją listy wykluczeń. Korzystaj z nagłówków i linków wypisania tam, gdzie są wymagane.',
        tag: 'Krytyczne',
      },
      {
        title: 'Traktuj odpowiedzi jako kluczowy sygnał',
        body: 'Wskaźnik odpowiedzi jest bezpośrednim sygnałem reakcji odbiorcy. Otwarcia mogą być zniekształcone przez mechanizmy ochrony prywatności i automatyczne pobieranie obrazów, dlatego interpretuj je ostrożnie.',
        tag: null,
      },
    ],
  },
];

const tagStyles = {
  Wymagane:     'bg-red-100 text-red-700 border border-red-200',
  Krytyczne:    'bg-red-100 text-red-700 border border-red-200',
  Zalecane:     'bg-amber-100 text-amber-700 border border-amber-200',
  Wskazówka:    'bg-teal-100 text-teal-700 border border-teal-200',
};

const metrics = [
  { label: 'Wskaźnik odbić',          safe: 'Poniżej 2%',   danger: 'Powyżej 3%' },
  { label: 'Skargi spam',              safe: 'Poniżej 0,1%', danger: 'Powyżej 0,3%' },
  { label: 'E-maile / skrzynkę / dzień', safe: 'Do 50', danger: 'Powyżej 50' },
  { label: 'Follow-upy w sekwencji', safe: '2–3 wiadomości', danger: '4+ wiadomości' },
  { label: 'Okres rozgrzewania', safe: '2–4 tygodnie', danger: 'Brak rozgrzewania' },
];

function Tag({ label }) {
  const cls = tagStyles[label];
  if (!cls) return null;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

function Rule({ rule, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen(v => !v)}
      className={`rounded-lg border shadow-sm cursor-pointer transition-colors duration-150 ${
        open
          ? 'bg-gray-50 border-gray-300'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/* Header row — never compresses */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-xs font-semibold text-gray-300 w-6 flex-shrink-0 text-right tabular-nums">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-gray-800 leading-snug">{rule.title}</span>
          {rule.tag && <Tag label={rule.tag} />}
        </div>
        <span className={`text-gray-400 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}>
          <RiArrowDownSLine size={18} />
        </span>
      </div>

      {/* Animated body — grid trick for smooth height transition */}
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="px-5 py-4 pl-14 text-sm text-gray-600 leading-relaxed border-t border-gray-100">
            {rule.body}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DeliverabilityTips() {
  const [activeSection, setActiveSection] = useState('setup');
  const section = sections.find(s => s.id === activeSection);

  const sectionOffsets = {};
  let globalIndex = 0;
  sections.forEach(s => {
    sectionOffsets[s.id] = globalIndex;
    globalIndex += s.rules.length;
  });

  return (
    <PageFrame
      className="sk-deliverability-page"
      title="Dostarczalność"
      description="Praktyczne wskazówki poprawiające dostarczalność, reputację domeny i bezpieczeństwo wysyłki."
    >
      <div className="sk-deliverability-metrics">
        <Metric icon="shield" title="Wskaźnik odbić" value="< 2%" detail="zalecany poziom" tone="green" />
        <Metric icon="send" title="Dzienny wolumen" value="≤ 50" detail="na jedną skrzynkę" tone="blue" />
        <Metric icon="history" title="Rozgrzewanie" value="2–4 tyg." detail="dla nowych skrzynek" tone="amber" />
        <Metric icon="mail" title="Follow-up" value="2–3" detail="wiadomości w sekwencji" tone="purple" />
      </div>

      <SectionTabs
        value={activeSection}
        onChange={setActiveSection}
        ariaLabel="Sekcje dostarczalności"
        items={sections.map(item => ({ id: item.id, label: item.label }))}
      />

      {/* Rules list */}
      <div className="sk-deliverability-rules">
        {section.rules.map((rule, i) => (
          <Rule key={rule.title} rule={rule} index={sectionOffsets[activeSection] + i} />
        ))}
      </div>

      {/* Quick reference table */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Szybka referencja</h2>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            {['Metryka', 'Bezpiecznie', 'Ryzyko'].map(h => (
              <span key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</span>
            ))}
          </div>
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={`grid grid-cols-3 px-4 py-3 text-sm ${
                i < metrics.length - 1 ? 'border-b border-gray-100' : ''
              } ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
            >
              <span className="text-gray-600 font-medium">{m.label}</span>
              <span className="flex items-center gap-1 text-teal-600 font-medium">
                <RiCheckLine size={14} className="flex-shrink-0" />{m.safe}
              </span>
              <span className="flex items-center gap-1 text-red-500 font-medium">
                <RiAlertLine size={14} className="flex-shrink-0" />{m.danger}
              </span>
            </div>
          ))}
        </div>
      </div>

    </PageFrame>
  );
}
