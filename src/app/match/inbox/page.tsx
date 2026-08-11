import { redirect } from 'next/navigation';

export default function LegacyMatchInboxRedirect() {
  redirect('/main-menu');
}
