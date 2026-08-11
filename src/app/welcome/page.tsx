import { redirect } from 'next/navigation';

export default function WelcomeLegacyRedirect() {
  redirect('/mvp-onboarding');
}
