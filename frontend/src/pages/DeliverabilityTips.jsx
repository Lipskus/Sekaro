import {useOperationsLanguage} from '../context/operationsLanguage';
import { useId, useState } from 'react';
import { PageFrame, Panel, Button, Icon } from '../redesign/ui';
import {
  RiShieldCheckLine,
  RiMailSendLine,
  RiFileTextLine,
  RiAlertLine,
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

const metrics = [
  { label: 'Wskaźnik odbić', safe: 'Poniżej 2%', danger: 'Powyżej 3%' },
  { label: 'Skargi spam', safe: 'Poniżej 0,1%', danger: 'Powyżej 0,3%' },
  { label: 'E-maile / skrzynkę / dzień', safe: 'Do 50', danger: 'Powyżej 50' },
  { label: 'Follow-upy w sekwencji', safe: '2–3 wiadomości', danger: '4+ wiadomości' },
  { label: 'Okres rozgrzewania', safe: '2–4 tygodnie', danger: 'Brak rozgrzewania' },
];
const actionBySection={setup:['/domains','Domeny nadawcze'],writing:['/templates','Otwórz szablony'],sending:['/inboxes','Ustawienia skrzynek'],reputation:['/leads','Otwórz kontakty']};
function Rule({rule,index}){
  const {ct,language}=useOperationsLanguage();
 const [open,setOpen]=useState(false),contentId=useId();
 return <article className="sk-deliverability-rule">
  <h3><button type="button" className="sk-deliverability-toggle" aria-expanded={open} aria-controls={contentId} onClick={()=>setOpen(v=>!v)}>
   <span className="sk-deliverability-number">{String(index+1).padStart(2,'0')}</span>
   <span className="sk-deliverability-rule-copy"><span>{ct(rule.title)}</span>{rule.tag&&<span className={`sk-badge ${rule.tag==='Zalecane'?'tone-amber':'tone-red'}`}>{ct(rule.tag)}</span>}</span>
   <RiArrowDownSLine size={20} className={open?'is-open':''}/>
  </button></h3>
  <div id={contentId} hidden={!open} className="sk-deliverability-body"><p>{ct(rule.body)}</p></div>
 </article>;
}

export default function DeliverabilityTips() {
  const {ct,language}=useOperationsLanguage();
  const [activeSection, setActiveSection] = useState('setup');
  const section = sections.find(s => s.id === activeSection);

  const sectionOffsets = {};
  let globalIndex = 0;
  sections.forEach(s => {
    sectionOffsets[s.id] = globalIndex;
    globalIndex += s.rules.length;
  });

  const action=actionBySection[activeSection]||actionBySection.setup;
  return <PageFrame className="sk-deliverability-page sk-deliverability-workspace" title={ct("Dostarczalność")} description={ct("Przewodnik po konfiguracji domen, skrzynek i wiadomości.")} actions={<Button to="/system-health" icon="shield">{ct("Stan systemu")}</Button>}>
    <section className="sk-deliverability-intro"><span className="sk-deliverability-intro-icon"><Icon name="shield" size={32}/></span><div><h2>{ct("Sprawdź przygotowanie do wysyłki")}</h2><p>{ct("Poniższe wskazówki są materiałem pomocniczym, a nie wynikiem pomiaru Twojej instalacji. Automatyczna analiza DNS, reputacji i dostarczalności nie jest jeszcze dostępna.")}</p></div></section>
    <div className="sk-deliverability-layout">
      <div className="sk-deliverability-main">
        <Panel title={ct("Lista kontrolna konfiguracji")} icon="check" className="sk-deliverability-checklist">
          <p className="sk-deliverability-description">{ct("Wybierz obszar i rozwiń wskazówkę, aby zobaczyć szczegóły.")}</p>
          <nav className="sk-deliverability-categories" aria-label={ct("Sekcje dostarczalności")}>{sections.map(item=><button key={item.id} aria-pressed={item.id===activeSection} onClick={()=>setActiveSection(item.id)}><item.icon size={19}/><span>{ct(item.label)}</span><small>{item.rules.length}</small></button>)}</nav>
          <h3 className="sk-deliverability-section-title">{ct(section.label)}</h3>
          <div className="sk-deliverability-rules">{section.rules.map((rule,i)=><Rule key={rule.title} rule={rule} index={sectionOffsets[activeSection]+i}/>)}</div>
          <div className="sk-deliverability-footer"><span>{ct('Wskazówki w tym obszarze: {count}',{count:section.rules.length})}</span><Button to={action[0]}>{ct(action[1])}</Button></div>
        </Panel>
        <Panel title={ct("Orientacyjne wartości z przewodnika")} className="sk-deliverability-reference">
          <p className="sk-deliverability-description">{ct("To nie są bieżące wyniki ani gwarancja dostarczenia. Limity zależą od dostawcy, historii skrzynki i odbiorców.")}</p>
          <div className="sk-deliverability-table-scroll" tabIndex={0} role="region" aria-label={ct("Orientacyjne wartości — tabela")}><table className="sk-table"><thead><tr><th>{ct("Metryka")}</th><th>{ct("Poziom orientacyjny")}</th><th>{ct("Sygnał do sprawdzenia")}</th></tr></thead><tbody>{metrics.map(m=><tr key={m.label}><td>{ct(m.label)}</td><td>{ct(m.safe)}</td><td>{ct(m.danger)}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>
      <aside className="sk-deliverability-aside" aria-label={ct("Narzędzia i informacje")}>
        <Panel title={ct("Narzędzia w Sekaro")} icon="settings">{[['/domains','globe','Domeny','Domeny powiązane ze skrzynkami.'],['/inboxes','mail','Skrzynki i rozgrzewanie','Limity, tracking oraz połączenia SMTP/IMAP.'],['/system-health','shield','Diagnostyka systemu','Dostępne kontrole i wykryte problemy.'],['/notifications','bell','Powiadomienia','Zdarzenia i alerty aplikacji.']].map(([to,icon,title,description])=><Button to={to} key={to} className="sk-deliverability-tool" icon={icon}><strong>{ct(title)}</strong><small>{ct(description)}</small></Button>)}</Panel>
        <Panel title={ct("Jak czytać ten widok")} icon="info"><p className="sk-deliverability-description">{ct("Oznaczenia „Wymagane” i „Zalecane” opisują wskazówki. Nie potwierdzają, że konfiguracja została sprawdzona lub wykonana.")}</p><p className="sk-deliverability-description">{ct("Brak alertu nie oznacza potwierdzonej dostarczalności. Obserwuj odpowiedzi i odbicia w kontekście własnej wysyłki.")}</p></Panel>
      </aside>
    </div>
  </PageFrame>;
}
