
'use client';

import React, { useEffect } from 'react'; 
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { LogIn, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export function LoginPageContent() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/incoming-invoices'); 
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    login(); 
  };
  
  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    toast({
        title: "Forgot Password",
        description: "Password reset functionality is not yet implemented in this demo.",
        variant: "default"
    });
  }

  if (isLoading || (!isLoading && isAuthenticated)) {
    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
            <p>Loading...</p>
        </div>
    );
  }


  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-gradient-to-br from-primary/5 via-background to-background p-4">
      <Card className="w-full max-w-md shadow-2xl border-t-4 border-primary rounded-xl overflow-hidden">
        <CardHeader className="space-y-3 text-center bg-card p-8">
           <Link href="/" className="inline-block mx-auto">
            <Image 
                src="/financio-logo.png" 
                alt="Financio Logo"
                width={120}
                height={32}
                className="mx-auto mb-4"
                priority
            />
          </Link>
          <CardTitle className="text-3xl font-bold font-headline text-primary">Secure Login</CardTitle>
          <CardDescription className="text-muted-foreground">
            Access your Financio dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-medium">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="you@example.com" 
                required 
                className="h-12 text-base"
                defaultValue="test@example.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="font-medium">Password</Label>
                <a href="#" onClick={handleForgotPassword} className="text-sm text-primary hover:underline hover:text-primary/80 transition-colors">
                  Forgot password?
                </a>
              </div>
              <Input 
                id="password" 
                type="password" 
                required 
                placeholder="Enter your password" 
                className="h-12 text-base"
                defaultValue="password"
              />
            </div>
            <Button type="submit" className="w-full font-semibold text-base py-6" size="lg">
              <LogIn className="mr-2 h-5 w-5" /> Sign In
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-3 p-6 bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-primary hover:underline hover:text-primary/80 transition-colors">
              Create an Account
            </Link>
          </p>
           <p className="text-xs text-muted-foreground/80 flex items-center">
            <ShieldCheck className="w-3 h-3 mr-1 text-green-600"/> Your information is safe with us.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
