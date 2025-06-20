
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListOrdered, ReceiptText, Landmark, FileEdit, FileScan, LogIn, Home as HomeIcon, Menu } from 'lucide-react'; // Renamed Home to HomeIcon
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'; // For mobile menu
import React from 'react';

const mainNavLinks = [
  { href: '/', label: 'Home', icon: <HomeIcon className="w-5 h-5" /> },
  { href: '/extractor', label: 'Extractor', icon: <ListOrdered className="w-5 h-5" /> },
  { href: '/incoming-invoices', label: 'Incoming Invoices', icon: <ReceiptText className="w-5 h-5" /> },
  { href: '/bank-matcher', label: 'Bank Matcher', icon: <Landmark className="w-5 h-5" /> },
  { href: '/pdf-organizer', label: 'PDF Organizer', icon: <FileEdit className="w-5 h-5" /> },
  { href: '/bank-statement-extractor', label: 'Bank Statements', icon: <FileScan className="w-5 h-5" /> },
];

export function AppHeader() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl sm:text-2xl font-bold text-primary font-headline">
          PDF Suite
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          {mainNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                          ${pathname === link.href
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
              title={link.label}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center space-x-2">
          <Link href="/login" passHref>
            <Button 
              variant={pathname === '/login' ? 'default' : 'outline'} 
              size="sm" 
              className="font-semibold hidden sm:inline-flex"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          </Link>
          
          {/* Mobile Menu Trigger */}
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-6 h-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-xs sm:max-w-sm p-0">
                <div className="p-4 border-b">
                  <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-bold text-primary">
                    PDF Suite
                  </Link>
                </div>
                <nav className="flex flex-col space-y-1 p-4">
                  {mainNavLinks.map((link) => (
                    <Link
                      key={`mobile-${link.href}`}
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium transition-colors
                                  ${pathname === link.href
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                  }`}
                    >
                      {link.icon}
                      <span>{link.label}</span>
                    </Link>
                  ))}
                  <hr className="my-2"/>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium transition-colors
                                ${pathname === '/login'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                }`}
                  >
                    <LogIn className="w-5 h-5" />
                    <span>Login</span>
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
