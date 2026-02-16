'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { usersApi } from '@/client/api/users.api';
import { useApi } from '@/client/hooks/useApi';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { normalizeDiscordAvatar } from '@/lib/discord/avatar';

export default function OnboardingWizard() {
  const router = useRouter();
  const { data: currentUser, loading: loadingCurrentUser } = useCurrentUser();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { runSafe, loading, error, clearError } = useApi('onboarding-wizard');

  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState(18);
  const [status, setStatus] = useState<'seeking' | 'in_relationship'>('seeking');

  const [qualities, setQualities] = useState<string[]>(['', '', '']);
  const [priority, setPriority] = useState<
    'emotional_intimacy' | 'shared_interests' | 'financial_stability' | 'other'
  >('emotional_intimacy');
  const [experience, setExperience] = useState<'none' | '1-2_years' | 'more_2_years'>('none');
  const [dealBreakers, setDealBreakers] = useState('');
  const [firstDate, setFirstDate] = useState<'cafe' | 'walk' | 'online' | 'other'>('cafe');
  const [weeklyCommit, setWeeklyCommit] = useState<'<5h' | '5-10h' | '>10h'>('<5h');

  const [satisfaction, setSatisfaction] = useState(3);
  const [communication, setCommunication] = useState<'daily' | 'weekly' | 'less'>('daily');
  const [budgeting, setBudgeting] = useState<'shared' | 'separate'>('shared');
  const [conflictStyle, setConflictStyle] = useState<'immediate' | 'cool_off' | 'avoid'>('immediate');
  const [activities, setActivities] = useState(0);
  const [growthArea, setGrowthArea] = useState<
    'communication' | 'finance' | 'intimacy' | 'domestic' | 'emotional_support'
  >('communication');

  if (loadingCurrentUser && !currentUser) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <LoadingView label="Загружаем профиль..." />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <EmptyStateView
          title="Пользователь не найден"
          description="Перезапустите авторизацию и попробуйте снова."
        />
      </main>
    );
  }

  const submitStep1 = async () => {
    if (!currentUser) return;
    clearError();
    const saved = await runSafe(
      () =>
        usersApi.upsertCurrentUserProfile({
          username: currentUser.username,
          avatar: normalizeDiscordAvatar(currentUser.avatar),
          personal: {
            gender,
            age,
            city: 'unknown',
            relationshipStatus: status,
          },
        }),
      { loadingKey: 'onboarding-step-1' }
    );

    if (!saved) return;
    setStep(2);
  };

  const submitStep2 = async () => {
    clearError();
    const payload =
      status === 'seeking'
        ? {
            seeking: {
              valuedQualities: qualities,
              relationshipPriority: priority,
              minExperience: experience,
              dealBreakers,
              firstDateSetting: firstDate,
              weeklyTimeCommitment: weeklyCommit,
            },
          }
        : {
            inRelationship: {
              satisfactionRating: satisfaction,
              communicationFrequency: communication,
              jointBudgeting: budgeting,
              conflictResolutionStyle: conflictStyle,
              sharedActivitiesPerMonth: activities,
              mainGrowthArea: growthArea,
            },
          };

    const saved = await runSafe(
      () => usersApi.updateCurrentUserOnboarding(payload),
      { loadingKey: 'onboarding-step-2' }
    );

    if (!saved) return;
    setStep(3);
  };

  if (step === 3) {
    return (
      <div className="p-4 text-center">
        <p>Готово!</p>
        <button onClick={() => router.push('/main-menu')} className="mt-4 app-btn-primary px-3 py-2 text-white">
          В главное меню
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {error && (
        <ErrorView
          error={error}
          onAuthRequired={() => {
            router.push('/');
          }}
        />
      )}

      {step === 1 && (
        <>
          <label>
            Пол:
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value as 'male' | 'female')}
              className="ml-2"
            >
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
            </select>
          </label>

          <label>
            Возраст:
            <input
              type="number"
              value={age}
              onChange={(event) => setAge(Number(event.target.value))}
              className="ml-2 border"
            />
          </label>

          <label>
            Статус отношений:
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'seeking' | 'in_relationship')}
              className="ml-2"
            >
              <option value="seeking">Ищу отношения</option>
              <option value="in_relationship">В отношениях</option>
            </select>
          </label>

          <button onClick={submitStep1} disabled={loading} className="app-btn-primary px-3 py-2 text-white">
            Далее
          </button>
        </>
      )}

      {step === 2 && status === 'seeking' && (
        <>
          <label>
            Назовите три качества надёжного партнёра:
            {qualities.map((quality, index) => (
              <input
                key={index}
                type="text"
                value={quality}
                onChange={(event) => {
                  const next = [...qualities];
                  next[index] = event.target.value;
                  setQualities(next);
                }}
                className="block border mt-1"
              />
            ))}
          </label>

          <label>
            Главный приоритет в отношениях:
            <select
              value={priority}
              onChange={(event) =>
                setPriority(
                  event.target.value as
                    | 'emotional_intimacy'
                    | 'shared_interests'
                    | 'financial_stability'
                    | 'other'
                )
              }
              className="ml-2"
            >
              <option value="emotional_intimacy">Эмоциональная близость</option>
              <option value="shared_interests">Совместные интересы</option>
              <option value="financial_stability">Финансовая стабильность</option>
              <option value="other">Другое</option>
            </select>
          </label>

          <label>
            Минимальный опыт отношений:
            <select
              value={experience}
              onChange={(event) =>
                setExperience(event.target.value as 'none' | '1-2_years' | 'more_2_years')
              }
              className="ml-2"
            >
              <option value="none">Никогда не был(а) в отношениях</option>
              <option value="1-2_years">Был(а) 1-2 года</option>
              <option value="more_2_years">Более 2 лет</option>
            </select>
          </label>

          <label>
            Неприемлемые качества партнёра:
            <input
              type="text"
              value={dealBreakers}
              onChange={(event) => setDealBreakers(event.target.value)}
              className="ml-2 border"
            />
          </label>

          <label>
            Предпочтение для первого свидания:
            <select
              value={firstDate}
              onChange={(event) => setFirstDate(event.target.value as 'cafe' | 'walk' | 'online' | 'other')}
              className="ml-2"
            >
              <option value="cafe">Кафе/ресторан</option>
              <option value="walk">Прогулка</option>
              <option value="online">Онлайн</option>
              <option value="other">Другое</option>
            </select>
          </label>

          <label>
            Сколько времени готовы уделять отношениям в неделю:
            <select
              value={weeklyCommit}
              onChange={(event) => setWeeklyCommit(event.target.value as '<5h' | '5-10h' | '>10h')}
              className="ml-2"
            >
              <option value="<5h">&lt;5 ч</option>
              <option value="5-10h">5-10 ч</option>
              <option value=">10h">&gt;10 ч</option>
            </select>
          </label>

          <button onClick={submitStep2} disabled={loading} className="app-btn-primary px-3 py-2 text-white">
            Завершить
          </button>
        </>
      )}

      {step === 2 && status === 'in_relationship' && (
        <>
          <label>
            Удовлетворённость отношениями (1-5):
            <input
              type="number"
              min={1}
              max={5}
              value={satisfaction}
              onChange={(event) => setSatisfaction(Number(event.target.value))}
              className="ml-2 border"
            />
          </label>

          <label>
            Как часто обсуждаете важные темы:
            <select
              value={communication}
              onChange={(event) => setCommunication(event.target.value as 'daily' | 'weekly' | 'less')}
              className="ml-2"
            >
              <option value="daily">Ежедневно</option>
              <option value="weekly">Несколько раз в неделю</option>
              <option value="less">Реже</option>
            </select>
          </label>

          <label>
            Бюджет:
            <select
              value={budgeting}
              onChange={(event) => setBudgeting(event.target.value as 'shared' | 'separate')}
              className="ml-2"
            >
              <option value="shared">Общий</option>
              <option value="separate">Раздельный</option>
            </select>
          </label>

          <label>
            Как решаете конфликты:
            <select
              value={conflictStyle}
              onChange={(event) => setConflictStyle(event.target.value as 'immediate' | 'cool_off' | 'avoid')}
              className="ml-2"
            >
              <option value="immediate">Обсуждаем сразу</option>
              <option value="cool_off">Даём время остыть</option>
              <option value="avoid">Избегаем темы</option>
            </select>
          </label>

          <label>
            Совместных активностей в месяц:
            <input
              type="number"
              value={activities}
              onChange={(event) => setActivities(Number(event.target.value))}
              className="ml-2 border"
            />
          </label>

          <label>
            Основная зона роста:
            <select
              value={growthArea}
              onChange={(event) =>
                setGrowthArea(
                  event.target.value as
                    | 'communication'
                    | 'finance'
                    | 'intimacy'
                    | 'domestic'
                    | 'emotional_support'
                )
              }
              className="ml-2"
            >
              <option value="communication">Общение</option>
              <option value="finance">Финансы</option>
              <option value="intimacy">Интим</option>
              <option value="domestic">Быт</option>
              <option value="emotional_support">Эмоциональная поддержка</option>
            </select>
          </label>

          <button onClick={submitStep2} disabled={loading} className="app-btn-primary px-3 py-2 text-white">
            Завершить
          </button>
        </>
      )}
    </div>
  );
}
