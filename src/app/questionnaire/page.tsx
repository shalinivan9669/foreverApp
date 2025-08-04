'use client';
import { useEffect, useState } from 'react';
import { useUserStore }        from '@/store/useUserStore';
import QuestionCard            from '@/components/QuestionCard';
import { useRouter }           from 'next/navigation';
import type { QuestionType } from '@/models/Question';

export default function QuestionnairePage(){
  const user  = useUserStore(s=>s.user);
  const router= useRouter();
  const [qs, setQs] = useState<QuestionType[]>([]);
  const [ans,setAns]=useState<Record<string,number>>({});
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    fetch('/api/questions?limit=12')
      .then(r=>r.json()).then(setQs);
  },[]);

  const answer=(qid:string,val:number)=>{
    setAns(prev=>({...prev,[qid]:val}));
  };

  const submit= async ()=>{
    if(!user) return;
    setSaving(true);
    await fetch('/api/answers/bulk',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        userId:user.id,
        answers:Object.entries(ans).map(([qid,ui])=>({qid,ui}))
      })
    });
    setSaving(false);
    router.push('/main-menu');
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      {qs.map(q=>(
        <QuestionCard key={q._id} q={q} onAnswer={answer}/>
      ))}
      <button disabled={saving||!Object.keys(ans).length}
              onClick={submit}
              className="bg-blue-600 text-white p-2 rounded">
        Сохранить
      </button>
    </div>
  );
}
