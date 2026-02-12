'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Home, Settings, BrainCircuit, Images, Plus, X, Network } from 'lucide-react';
import { FaXTwitter, FaDiscord, FaYoutube } from 'react-icons/fa6';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { useSidebar } from './SidebarContext';
import classNames from 'classnames';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'New Job', href: '/jobs/new', icon: Plus },
  { name: 'Jobs', href: '/jobs', icon: BrainCircuit },
  { name: 'Hosts', href: '/hosts', icon: Network },
  { name: 'Datasets', href: '/datasets', icon: Images },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const socialLinks = [
  { name: 'Discord', href: 'https://discord.gg/VXmU2f5WEU', icon: FaDiscord },
  { name: 'YouTube', href: 'https://www.youtube.com/@ostrisai', icon: FaYoutube },
  { name: 'X', href: 'https://x.com/ostrisai', icon: FaXTwitter },
];

const HeartIcon = () => (
  <svg height="24" version="1.1" width="24" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(0 -1028.4)">
      <path
        d="m7 1031.4c-1.5355 0-3.0784 0.5-4.25 1.7-2.3431 2.4-2.2788 6.1 0 8.5l9.25 9.8 9.25-9.8c2.279-2.4 2.343-6.1 0-8.5-2.343-2.3-6.157-2.3-8.5 0l-0.75 0.8-0.75-0.8c-1.172-1.2-2.7145-1.7-4.25-1.7z"
        fill="#c0392b"
      />
    </g>
  </svg>
);

/**
 * Checks if a nav item is active based on current pathname.
 * Exact match for dashboard, prefix match for others.
 */
function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/jobs/new') return pathname === '/jobs/new';
  return pathname.startsWith(href);
}

/**
 * Shared nav content rendered in all sidebar modes (mobile drawer, tablet rail, desktop full).
 */
function NavContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  const pathname = usePathname();

  const socialsBoxClass =
    'flex flex-col items-center justify-center p-1 hover:bg-gray-800 rounded-lg transition-colors';
  const socialIconClass = 'w-5 h-5 text-gray-400 hover:text-white';

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Logo */}
      <div className={classNames('py-3', collapsed ? 'px-2 flex justify-center' : 'px-4')}>
        {collapsed ? (
          <img src="/ostris_logo.png" alt="Ostris AI Toolkit" className="w-auto h-7" />
        ) : (
          <h1 className="text-l">
            <img src="/ostris_logo.png" alt="Ostris AI Toolkit" className="w-auto h-7 mr-3 inline" />
            <span className="font-bold uppercase">Ostris</span>
            <span className="ml-2 uppercase text-gray-300">AI-Toolkit</span>
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        <ul className={classNames('py-4 space-y-2', collapsed ? 'px-1' : 'px-2')}>
          {navigation.map(item => {
            const active = isActive(item.href, pathname);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={onNavClick}
                  title={collapsed ? item.name : undefined}
                  className={classNames(
                    'flex items-center py-3 rounded-lg transition-colors',
                    collapsed ? 'justify-center px-2' : 'px-4',
                    active ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800',
                  )}
                >
                  <item.icon className={classNames('w-5 h-5 shrink-0', !collapsed && 'mr-3')} />
                  {!collapsed && item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Support link */}
      {collapsed ? (
        <a
          href="https://ostris.com/support"
          target="_blank"
          rel="noreferrer"
          className="flex justify-center py-3"
          title="Support AI-Toolkit"
        >
          <div className="min-w-[26px] min-h-[26px]">
            <HeartIcon />
          </div>
        </a>
      ) : (
        <a
          href="https://ostris.com/support"
          target="_blank"
          rel="noreferrer"
          className="flex items-center space-x-2 px-4 py-3"
        >
          <div className="min-w-[26px] min-h-[26px]">
            <HeartIcon />
          </div>
          <div className="uppercase text-gray-400 text-sm mb-2 flex-1 pt-2 pl-0">Support AI-Toolkit</div>
        </a>
      )}

      {/* Social links */}
      <div className="px-1 py-1 border-t border-gray-800">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            {socialLinks.map(link => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={socialsBoxClass}
                title={link.name}
              >
                <link.icon className={socialIconClass} />
              </a>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {socialLinks.map(link => (
              <a key={link.name} href={link.href} target="_blank" rel="noreferrer" className={socialsBoxClass}>
                <link.icon className={socialIconClass} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Responsive sidebar with three modes:
 * - Mobile (<768px): Hidden by default, slide-out drawer via HeadlessUI Dialog
 * - Tablet (768-1024px): Icon rail (w-16), expands on hover to full width
 * - Desktop (>1024px): Full sidebar (w-59) always visible
 */
const Sidebar = () => {
  const { isOpen, close } = useSidebar();
  const [railHovered, setRailHovered] = useState(false);

  return (
    <>
      {/* Mobile drawer */}
      <Dialog open={isOpen} onClose={close} className="relative z-50 md:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        />
        <div className="fixed inset-0 z-50 flex">
          <DialogPanel
            transition
            className="relative flex w-72 max-w-[80vw] flex-col transition-transform duration-300 ease-in-out data-closed:-translate-x-full"
          >
            {/* Close button */}
            <button
              onClick={close}
              className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white z-10"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
            <NavContent collapsed={false} onNavClick={close} />
          </DialogPanel>
        </div>
      </Dialog>

      {/* Tablet: Icon rail with hover expand (md to lg) */}
      <div
        className="hidden md:flex lg:hidden shrink-0 relative"
        onMouseEnter={() => setRailHovered(true)}
        onMouseLeave={() => setRailHovered(false)}
      >
        {/* Static rail placeholder to maintain layout space */}
        <div className="w-16 shrink-0" />

        {/* Actual rail / expanded panel */}
        <div
          className={classNames(
            'absolute inset-y-0 left-0 z-40 transition-all duration-200 ease-in-out overflow-hidden',
            railHovered ? 'w-59' : 'w-16',
          )}
        >
          <NavContent collapsed={!railHovered} />
        </div>
      </div>

      {/* Desktop: Full sidebar (lg and above) */}
      <div className="hidden lg:flex shrink-0 w-59">
        <NavContent collapsed={false} />
      </div>
    </>
  );
};

export default Sidebar;
