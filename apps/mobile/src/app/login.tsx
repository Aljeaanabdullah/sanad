import { Header, Screen, Txt } from '../components/ui';
import { useSettings } from '../lib/settings';

// Placeholder: sign-in group (D)
export default function Placeholder() {
  const { t } = useSettings();
  return (
    <>
      <Header title={t('app_name')} back />
      <Screen><Txt>{t('coming_soon')}</Txt></Screen>
    </>
  );
}
