'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { entryApi, type EntryStateDTO, type EntryProfileRequest } from '@/client/api/entry.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import BackBar from '@/components/ui/BackBar';
import LoadingView from '@/components/ui/LoadingView';

const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900';

export default function EntryPage() {
  const router = useRouter();
  const { refetch } = useCurrentUser({ enabled: false });
  const [state, setState] = useState<EntryStateDTO | null>(null);
  const [cohort, setCohort] = useState<EntryProfileRequest['cohort'] | ''>('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<EntryProfileRequest['gender'] | ''>('');
  const [city, setCity] = useState('');
  const [searchCityId, setSearchCityId] = useState('');
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [locationMode, setLocationMode] = useState<EntryProfileRequest['locationMode']>('NONE');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    entryApi.get(controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setState(next);
      setCohort(next.hasPair ? 'EXISTING_PARTNER' : next.user.entryCohort ?? '');
      setAge(next.user.personal?.age ? String(next.user.personal.age) : '');
      setGender(next.user.personal?.gender ?? '');
      setCity(next.user.personal?.city ?? '');
      setLocationMode(next.user.location ? 'KEEP' : 'NONE');
      if (next.user.locationSource === 'CITY_CATALOG' && next.user.location) {
        const storedCoordinates = next.user.location.coordinates;
        const storedCity = next.searchCities.find((item) => item.coordinates[0] === storedCoordinates[0] && item.coordinates[1] === storedCoordinates[1]);
        if (storedCity) setSearchCityId(storedCity.id);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError('Не удалось загрузить профиль. Переподключитесь через Discord или обновите страницу.');
    });
    return () => controller.abort();
  }, []);

  const locate = () => {
    if (!navigator.geolocation) { setNotice('Выберите город поиска из списка — геолокация здесь недоступна.'); return; }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition((position) => {
      // Exact device location never crosses the transport boundary.
      setCoordinates([Math.round(position.coords.longitude * 100) / 100, Math.round(position.coords.latitude * 100) / 100]);
      setLocationMode('DEVICE');
      setSearchCityId('');
      setLocating(false);
      setNotice('Приблизительное местоположение готово. Другие пользователи не увидят координаты.');
    }, () => {
      setLocating(false);
      setNotice('Discord или браузер не разрешил геолокацию. Можно выбрать город поиска из списка или продолжить без поиска.');
    }, { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 });
  };

  const save = async () => {
    if (!cohort || !gender || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await entryApi.save({ cohort, gender, age: Number(age), city: city.trim(), locationMode, ...(searchCityId ? { searchCityId } : {}), ...(coordinates ? { coordinates } : {}) });
      await refetch();
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = fragment.get('token');
      const partnerCode = fragment.get('partnerCode');
      const returnToJoin = fragment.get('return') === 'join' && (token || partnerCode);
      const nextFragment = returnToJoin ? `#${fragment.toString()}` : '';
      router.replace(next.onboardingCompleted
        ? returnToJoin ? `/join#${new URLSearchParams(token ? { token } : { partnerCode: partnerCode ?? '' })}` : next.hasPair ? '/main-menu' : cohort === 'EXISTING_PARTNER' ? '/invite' : '/match-card/create'
        : `/mvp-onboarding${nextFragment}`);
    } catch {
      setError('Не удалось сохранить. Проверьте возраст, город и выбранный путь. При активной паре путь поиска недоступен.');
    } finally { setBusy(false); }
  };

  if (!state && !error) return <LoadingView label="Знакомимся с вами..." />;

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title="О вас и вашем пути" fallbackHref="/" />
      <section className="app-panel app-panel-solid p-4 sm:p-6">
        <p className="app-muted text-xs">Первый шаг</p>
        <h1 className="font-display mt-1 text-2xl font-semibold">С чего начнём?</h1>
        <p className="app-muted mt-2 text-sm">Личное пространство останется вашим при любом выборе. Пара появится только после подтверждения обоих.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {([
            ['SOLO', 'Хочу найти партнёра', 'Пройдём личную настройку, подготовим карточку и откроем поиск. Личное развитие тоже останется доступным.'],
            ['EXISTING_PARTNER', 'У меня уже есть партнёр', 'Сначала личная настройка, затем безопасно свяжем ваши аккаунты.'],
          ] as const).map(([value, title, description]) => (
            <button key={value} type="button" disabled={state?.hasPair && value === 'SOLO'} aria-pressed={cohort === value} onClick={() => setCohort(value)} className={`rounded-xl border p-4 text-left disabled:opacity-50 ${cohort === value ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`}>
              <span className="block font-semibold">{title}</span><span className="app-muted mt-2 block text-sm">{description}</span>
            </button>
          ))}
        </div>
      </section>
      {state && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="app-panel app-panel-solid space-y-4 p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Несколько сведений о себе</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Возраст<input type="number" min={18} max={120} required value={age} onChange={(event) => setAge(event.target.value)} className={fieldClass} /></label>
          <label className="text-sm">Пол<select required value={gender} onChange={(event) => setGender(event.target.value as EntryProfileRequest['gender'])} className={fieldClass}><option value="">Выберите</option><option value="female">Женщина</option><option value="male">Мужчина</option></select></label>
        </div>
        <label className="block text-sm">Город<input required maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" className={fieldClass} /></label>
        {cohort === 'SOLO' && <div className="app-panel-soft space-y-3 p-3">
          <h3 className="font-medium">Где искать партнёра</h3>
          <p className="app-muted text-sm">Для поиска нужно выбрать город или приблизительное место. Можно пропустить этот шаг и вернуться к нему перед публикацией карточки.</p>
          <label className="block text-sm">Город поиска<select value={searchCityId} onChange={(event) => { setSearchCityId(event.target.value); setCoordinates(null); setLocationMode(event.target.value ? 'CITY_CATALOG' : 'NONE'); }} className={fieldClass}>
            <option value="">{locationMode === 'KEEP' ? 'Оставить сохранённое место' : locationMode === 'DEVICE' ? 'Использовать приблизительное местоположение' : 'Настрою позже / моего города нет'}</option>
            {state.searchCities.map((item) => <option key={item.id} value={item.id}>{item.name}, {item.country}</option>)}
          </select></label>
          <p className="app-muted text-xs">При выборе города расстояние считается от его примерного центра. Если города нет, личные функции доступны; поиск можно настроить позже.</p>
          <button type="button" onClick={locate} disabled={locating} className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-50">{locating ? 'Определяем...' : 'Использовать место устройства'}</button>
          {locationMode !== 'NONE' && <button type="button" onClick={() => { setLocationMode('NONE'); setCoordinates(null); setSearchCityId(''); }} className="ml-2 text-sm underline">Не использовать местоположение</button>}
          {notice && <p role="status" className="app-muted text-sm">{notice}</p>}
        </div>}
        <p className="app-muted text-xs">Ваш код «Вместе»: <span className="break-all font-mono">{state.user.publicId}</span>. Он поможет найти приглашение вашего партнёра; для входа всё равно нужен ваш аккаунт.</p>
        <button type="submit" disabled={!cohort || !gender || busy || locating} className="app-btn-primary w-full px-4 py-3 disabled:opacity-50">{busy ? 'Сохраняем...' : state.onboardingCompleted ? 'Сохранить и продолжить' : 'Продолжить личную настройку'}</button>
      </form>}
      {error && <div className="app-alert app-alert-error" role="alert">{error}</div>}
    </main>
  );
}
