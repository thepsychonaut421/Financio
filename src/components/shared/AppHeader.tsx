
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReceiptText, Landmark, FileEdit, FileScan, LogIn, LogOut, Home as HomeIcon, Menu, UserCircle, PackageCheck, Archive, PackagePlus, Library, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import React from 'react';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


const mainNavLinks = [
  { href: '/', label: 'Home', icon: <HomeIcon className="w-5 h-5" /> },
  { href: '/incoming-invoices', label: 'Incoming Invoices', icon: <ReceiptText className="w-5 h-5" /> },
  { href: '/processed-invoices', label: 'Processed', icon: <Archive className="w-5 h-5" /> },
  { href: '/bank-matcher', label: 'Bank Matcher', icon: <Landmark className="w-5 h-5" /> },
  { href: '/pdf-organizer', label: 'PDF Organizer', icon: <FileEdit className="w-5 h-5" /> },
  { href: '/bank-statement-extractor', label: 'Bank Statements', icon: <FileScan className="w-5 h-5" /> },
  { href: '/product-catalog', label: 'Product Catalog', icon: <Library className="w-5 h-5" /> },
  { href: '/stock-reconciliation', label: 'Stock Reconciliation', icon: <PackageCheck className="w-5 h-5" /> },
];

const settingsNavLinks = [
    { href: '/settings/erpnext', label: 'ERPNext Payments'},
    { href: '/settings/stock', label: 'Stock Settings'},
];


export function AppHeader() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { isAuthenticated, isLoading, logout } = useAuth(); // Get auth state and functions

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
  };

  const renderAuthButton = (isMobile: boolean) => {
    if (isLoading) {
      return (
        <Button variant="ghost" size={isMobile ? "default" : "sm"} className={`font-semibold ${isMobile ? 'w-full justify-start py-3 text-base' : 'hidden sm:inline-flex'}`} disabled>
          <UserCircle className="w-5 h-5 mr-2" /> Loading...
        </Button>
      );
    }
    if (isAuthenticated) {
      return (
        <Button 
          variant={isMobile ? "ghost" : "outline"} 
          size={isMobile ? "default" : "sm"}
          onClick={handleLogout}
          className={`font-semibold ${isMobile ? 'w-full justify-start py-3 text-base' : 'hidden sm:inline-flex'}`}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      );
    }
    return (
      <Link href="/login" passHref>
        <Button 
          variant={pathname === '/login' && !isMobile ? 'default' : (isMobile ? "ghost" : "outline")} 
          size={isMobile ? "default" : "sm"}
          className={`font-semibold ${isMobile ? 'w-full justify-start py-3 text-base' : 'hidden sm:inline-flex'}`}
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <LogIn className="w-4 h-4 mr-2" />
          Login
        </Button>
      </Link>
    );
  };


  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl sm:text-2xl font-bold text-primary font-headline">
          Financio
        </Link>
        
        <nav className="hidden lg:flex items-center space-x-1">
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
            {isAuthenticated && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant={pathname.startsWith('/settings') ? 'soft' : 'ghost'}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                                    ${pathname.startsWith('/settings')
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                    }`}
                     >
                       <Settings className="w-5 h-5" />
                       <span>Settings</span>
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Configuration</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {settingsNavLinks.map(link => (
                        <Link href={link.href} key={link.href}>
                            <DropdownMenuItem className="cursor-pointer">
                                {link.label}
                            </DropdownMenuItem>
                        </Link>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
            )}
        </nav>

        <div className="flex items-center space-x-2">
          {renderAuthButton(false)}
          
          <div className="lg:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-6 h-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-xs sm:max-w-sm p-0">
                <SheetHeader className="p-4 border-b text-left">
                  <SheetTitle>
                    <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-bold text-primary">
                      Financio
                    </Link>
                  </SheetTitle>
                </SheetHeader>
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
                   {isAuthenticated && (
                     <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="justify-start w-full text-base font-medium flex items-center space-x-3 px-3 py-3 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                                  <Settings className="w-5 h-5"/>
                                  <span>Settings</span>
                              </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {settingsNavLinks.map(link => (
                                <Link href={link.href} key={`mobile-${link.href}`} onClick={() => setIsMobileMenuOpen(false)}>
                                    <DropdownMenuItem>
                                        {link.label}
                                    </DropdownMenuItem>
                                </Link>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                     </>
                  )}
                  <hr className="my-2"/>
                  {renderAuthButton(true)}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
