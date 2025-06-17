'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListOrdered, ReceiptText, Landmark } from 'lucide-react';

const navLinks = [
  { href: '/', label: 'Line Item Extractor', icon: <ListOrdered className="w-5 h-5" /> },
  { href: '/incoming-invoices', label: 'Incoming Invoices', icon: <ReceiptText className="w-5 h-5" /> },
  { href: '/bank-matcher', label: 'Bank Matcher', icon: <Landmark className="w-5 h-5" /> },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-40">
      <nav className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl sm:text-2xl font-bold text-primary font-headline">
          PDF Extractor
        </Link>
        <div className="flex items-center space-x-1 sm:space-x-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center space-x-2 px-2 py-2 sm:px-3 rounded-md text-sm font-medium transition-colors
                          ${pathname === link.href
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
              title={link.label}
            >
              {link.icon}
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
