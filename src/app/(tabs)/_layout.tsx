import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useSettings } from '@/db/settings';

export default function TabLayout() {
  const { settings, loaded } = useSettings();
  if (loaded && !settings.onboarded) return <Redirect href="/onboarding" />;
  return <AppTabs />;
}
