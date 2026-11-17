// Holds the side menu and the Sanad button for the signed-in app and tells the kit about them.
import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NavContext, navAction, ROOT_PATHS } from '../../lib/nav';
import { SanadButton } from './SanadButton';
import { SideMenu } from './SideMenu';

export function AppNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sanadButton = ROOT_PATHS.includes(pathname);

  const openMenu = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const go = useCallback(
    (href: string) => {
      setOpen(false);
      const a = navAction(href, pathname);
      if (a.kind === 'home') {
        if (router.canDismiss()) router.dismissTo('/');
        else router.replace('/');
      } else if (a.kind === 'replace') router.replace(a.href as Href);
      else if (a.kind === 'push') router.push(a.href as Href);
    },
    [pathname, router],
  );

  const value = useMemo(() => ({ openMenu, sanadButton }), [openMenu, sanadButton]);
  return (
    <NavContext.Provider value={value}>
      {children}
      {sanadButton ? <SanadButton onPress={() => router.push('/assistant')} /> : null}
      <SideMenu open={open} pathname={pathname} onClose={close} onGo={go} />
    </NavContext.Provider>
  );
}
