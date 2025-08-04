import fs   from 'fs';
import path from 'path';
import { connectToDatabase } from '@/lib/mongodb';
import { Question }          from '@/models/Question';

(async () => {
  await connectToDatabase();

  const file = path.resolve('seed/questions.json');
  const raw  = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(raw);

  await Question.deleteMany({});
  await Question.insertMany(data);

  console.log('✅  Seeded', data.length, 'questions');
  process.exit(0);
})();
