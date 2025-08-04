'use client';
type Props = { q:{ _id:string; text:Record<string,string>; scale:'likert5'|'bool' };
               onAnswer:(qid:string,val:number)=>void };

export default function QuestionCard({q,onAnswer}:Props){
  return (
    <div className="border p-4">
      <p>{q.text.ru}</p>
      {q.scale==='likert5' && (
        <div className="flex gap-2 mt-2">
          {[1,2,3,4,5].map(i=>(
            <button key={i} onClick={()=>onAnswer(q._id,i)}
              className="px-2 py-1 border rounded">{i}</button>
          ))}
        </div>
      )}
      {q.scale==='bool' && (
        <div className="flex gap-4 mt-2">
          <button onClick={()=>onAnswer(q._id,1)} className="btn">Нет</button>
          <button onClick={()=>onAnswer(q._id,2)} className="btn">Да</button>
        </div>
      )}
    </div>
  );
}
