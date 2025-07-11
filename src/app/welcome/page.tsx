'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';

export default function WelcomePage() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState<number>(18);
  const [status, setStatus] = useState<'seeking' | 'in_relationship'>('seeking');
  const [partner, setPartner] = useState('');

  if (!user) return <div className="text-center mt-4">No user</div>;

  const submit = async () => {
    await fetch('/.proxy/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        personal: {
          gender,
          age,
          city: partner || 'unknown',
          relationshipStatus: status,
        },
      }),
    });
    router.push('/main-menu');
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <label>
        Пол:
        <select value={gender} onChange={(e) => setGender(e.target.value as any)} className="ml-2">
          <option value="male">Мужской</option>
          <option value="female">Женский</option>
          <option value="other">Иной</option>
        </select>
      </label>
      <label>
        Возраст:
        <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} className="ml-2 border" />
      </label>
      <label>
        Семейное положение:
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="ml-2">
          <option value="seeking">Ищу отношения</option>
          <option value="in_relationship">В отношениях</option>
        </select>
      </label>
      {status === 'in_relationship' && (
        <label>
          Ник партнёра:
          <input type="text" value={partner} onChange={(e) => setPartner(e.target.value)} className="ml-2 border" />
        </label>
      )}
      <button onClick={submit} className="bg-blue-600 text-white p-2 rounded">Сохранить</button>
    </div>
  );
}
