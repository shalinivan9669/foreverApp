import { redirect } from 'next/navigation';

export default function LegacyMatchCardRedirect() {
  redirect('/invite');
}
