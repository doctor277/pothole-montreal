import { Stack } from 'expo-router';

import { CitizenReportProvider } from '@/src/state/citizen-report-context';

export default function RootLayout() {
  return (
    <CitizenReportProvider>
      <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }} />
    </CitizenReportProvider>
  );
}
