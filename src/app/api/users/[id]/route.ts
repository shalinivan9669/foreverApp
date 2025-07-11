import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../lib/mongodb';
import { User, UserType } from '../../../../models/User';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await connectToDatabase();
  const doc = await User.findOne({ id: params.id }).lean<UserType | null>();
  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as Partial<UserType>;
  await connectToDatabase();
  const update: Record<string, unknown> = {};
  if (body.personal) update.personal = body.personal;
  if (body.vectors) update.vectors = body.vectors;
  if (body.preferences) update.preferences = body.preferences;
  if (body.embeddings) update.embeddings = body.embeddings;
  if (body.location) update.location = body.location;
  const doc = await User.findOneAndUpdate(
    { id: params.id },
    update,
    { new: true, runValidators: true }
  ).lean<UserType | null>();
  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(doc);
}
