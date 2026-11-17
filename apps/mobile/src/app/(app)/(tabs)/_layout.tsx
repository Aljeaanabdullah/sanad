// The four section roots: Home, Requests, Reports, and Account & settings. There is no bottom tab bar
// any more (owner decision 2026-11-17): the header's menu button opens the side menu and the round
// Sanad button at the bottom centre opens the assistant (components/nav). The folder name is kept so
// the routes (/, /requests, /reports, /more) do not change.
import { Stack } from 'expo-router';
import { useSettings } from '../../../lib/settings';

export default function SectionsLayout() {
  const { c } = useSettings();
  // Moving between sections from the menu replaces the screen, so a calm fade reads better than a slide.
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade' }} />;
}
