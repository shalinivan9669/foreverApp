import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { VectorSnapshot } from '@/models/VectorSnapshot';
import { AXES, type Axis } from '@/domain/vectors';
import { createVectorSnapshot, readAxisLayer } from '@/domain/services/vectorScoring.service';

const layers = ['trait', 'state', 'matching'] as const;

const run = async () => {
  await connectToDatabase();
  const users = await User.find({}).lean<UserType[]>();
  let inserted = 0;

  for (const user of users) {
    for (const axis of AXES as Axis[]) {
      for (const layer of layers) {
        const existing = await VectorSnapshot.exists({
          userId: user.id,
          axis,
          layer,
          'reason.source': 'migration',
        });
        if (existing) continue;

        const current = readAxisLayer(user, axis, layer);
        await VectorSnapshot.create(
          createVectorSnapshot({
            userId: user.id,
            layer,
            axis,
            before: current,
            after: current,
            reason: { source: 'migration' },
            scoringVersion: current.scoringVersion,
          })
        );
        inserted += 1;
      }
    }
  }

  console.log(`backfill-vector-snapshots inserted=${inserted}`);
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
