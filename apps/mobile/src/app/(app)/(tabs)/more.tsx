import { Header, Screen, Txt } from '../../../components/ui';
import { useSettings } from '../../../lib/settings';

// Placeholder: dashboard group (C)
export default function Placeholder() {
  const { t } = useSettings();
  return (
    <>
      <Header title={t('app_name')} back />
      <Screen><Txt>{t('coming_soon')}</Txt></Screen>
    </>
  );
}
