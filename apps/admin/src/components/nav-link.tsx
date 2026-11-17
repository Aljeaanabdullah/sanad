"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/** Link that marks itself as the current page. `exact` for "/" so it isn't active everywhere. */
export function NavLink({
  href,
  exact = false,
  className,
  activeClassName,
  children,
}: {
  href: string;
  exact?: boolean;
  className: string;
  activeClassName: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  const ref = useRef<HTMLAnchorElement>(null);

  // On phones the menu is one scrolling row: keep the current page in view.
  useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>("ul, nav");
    if (!active || !ref.current || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const item = ref.current.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    scroller.scrollBy({ left: item.left + item.width / 2 - (box.left + box.width / 2) });
  }, [active]);

  return (
    <Link ref={ref} href={href} aria-current={active ? "page" : undefined} className={active ? activeClassName : className}>
      {children}
    </Link>
  );
}
