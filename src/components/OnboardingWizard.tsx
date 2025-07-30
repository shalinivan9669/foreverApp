'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';

export default function OnboardingWizard() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 1 fields
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState(18);
  const [status, setStatus] = useState<'seeking' | 'in_relationship'>('seeking');

  // seeking fields
  const [qualities, setQualities] = useState<string[]>(['', '', '']);
  const [priority, setPriority] = useState<
    'emotional_intimacy' | 'shared_interests' | 'financial_stability' | 'other'
  >('emotional_intimacy');
  const [experience, setExperience] = useState<'none' | '1-2_years' | 'more_2_years'>('none');
  const [dealBreakers, setDealBreakers] = useState('');
  const [firstDate, setFirstDate] = useState<'cafe' | 'walk' | 'online' | 'other'>('cafe');
  const [weeklyCommit, setWeeklyCommit] = useState<'<5h' | '5-10h' | '>10h'>('<5h');

  // in relationship fields
  const [satisfaction, setSatisfaction] = useState(3);
  const [communication, setCommunication] = useState<'daily' | 'weekly' | 'less'>('daily');
  const [budgeting, setBudgeting] = useState<'shared' | 'separate'>('shared');
  const [conflictStyle, setConflictStyle] = useState<'immediate' | 'cool_off' | 'avoid'>('immediate');
  const [activities, setActivities] = useState(0);
  const [growthArea, setGrowthArea] = useState<
    'communication' | 'finance' | 'intimacy' | 'domestic' | 'emotional_support'
  >('communication');

  if (!user) return <div className="text-center mt-4">No user</div>;

  const submitStep1 = async () => {
    setError(null);
    setLoading(true);
    const res = await fetch('/.proxy/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        personal: {
          gender,
          age,
          city: 'unknown',
          relationshipStatus: status,
        },
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('Не удалось сохранить профиль. Попробуйте ещё раз.');
      return;
    }
    setStep(2);
  };

  const submitStep2 = async () => {
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
    setError(null);
    setLoading(true);
    const res = await fetch(`/.proxy/api/users/${user.id}/onboarding`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      setError('Не удалось завершить анкету. Попробуйте ещё раз.');
      return;
    }
    setStep(3);
  };

  if (step === 3) {
    return (
      <div className="p-4 text-center">
        <p>Готово!</p>
        <button
          onClick={() => router.push('/main-menu')}
          className="mt-4 bg-blue-600 text-white p-2 rounded"
        >
          В главное меню
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {error && <p className="text-red-600">{error}</p>}
      {step === 1 && (
        <>
          <label>
            Пол:
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
              className="ml-2"
            >
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
              <option value="other">Иной</option>
            </select>
          </label>
          <label>
            Возраст:
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="ml-2 border"
            />
          </label>
          <label>
            Семейное положение:
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as 'seeking' | 'in_relationship')
              }
              className="ml-2"
            >
              <option value="seeking">Ищу отношения</option>
              <option value="in_relationship">В отношениях</option>
            </select>
          </label>
          <button
            onClick={submitStep1}
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
            Далее
          </button>
        </>
      )}

      {step === 2 && status === 'seeking' && (
        <>
          <label>
            Назовите три качества надёжного партнёра:
            {qualities.map((q, i) => (
              <input
                key={i}
                type="text"
                value={q}
                onChange={(e) => {
                  const arr = [...qualities];
                  arr[i] = e.target.value;
                  setQualities(arr);
                }}
                className="block border mt-1"
              />
            ))}
          </label>
          <label>
            Главный приоритет в отношениях:
            <select
              value={priority}
              onChange={(e) =>
                setPriority(
                  e.target.value as
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
              onChange={(e) =>
                setExperience(e.target.value as 'none' | '1-2_years' | 'more_2_years')
              }
              className="ml-2"
            >
              <option value="none">Никогда не был</option>
              <option value="1-2_years">Был 1-2 года</option>
              <option value="more_2_years">Более 2 лет</option>
            </select>
          </label>
          <label>
            Неприемлемые качества партнёра:
            <input
              type="text"
              value={dealBreakers}
              onChange={(e) => setDealBreakers(e.target.value)}
              className="ml-2 border"
            />
          </label>
          <label>
            Предпочтение для первого свидания:
            <select
              value={firstDate}
              onChange={(e) =>
                setFirstDate(
                  e.target.value as 'cafe' | 'walk' | 'online' | 'other'
                )
              }
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
              onChange={(e) =>
                setWeeklyCommit(e.target.value as '<5h' | '5-10h' | '>10h')
              }
              className="ml-2"
            >
              <option value="<5h">&lt;5 ч</option>
              <option value="5-10h">5-10 ч</option>
              <option value=">10h">&gt;10 ч</option>
            </select>
          </label>
          <button
            onClick={submitStep2}
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
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
              onChange={(e) => setSatisfaction(Number(e.target.value))}
              className="ml-2 border"
            />
          </label>
          <label>
            Как часто обсуждаете важные темы:
            <select
              value={communication}
              onChange={(e) =>
                setCommunication(e.target.value as 'daily' | 'weekly' | 'less')
              }
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
              onChange={(e) =>
                setBudgeting(e.target.value as 'shared' | 'separate')
              }
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
              onChange={(e) =>
                setConflictStyle(
                  e.target.value as 'immediate' | 'cool_off' | 'avoid'
                )
              }
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
              onChange={(e) => setActivities(Number(e.target.value))}
              className="ml-2 border"
            />
          </label>
          <label>
            Основная область работы:
            <select
              value={growthArea}
              onChange={(e) =>
                setGrowthArea(
                  e.target.value as
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
          <button
            onClick={submitStep2}
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
            Завершить
          </button>
        </>
      )}
    </div>
  );
}
