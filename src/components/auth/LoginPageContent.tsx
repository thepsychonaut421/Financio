
'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { LogIn, ShieldCheck, Github, Chrome } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

const MicrosoftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" {...props}>
    <path fill="#f25022" d="M1 1h9v9H1z" />
    <path fill="#00a4ef" d="M1 11h9v9H1z" />
    <path fill="#7fba00" d="M11 1h9v9h-9z" />
    <path fill="#ffb900" d="M11 11h9v9h-9z" />
  </svg>
);

export function LoginPageContent() {
  const { login, signInWithMicrosoft, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('password');


  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/incoming-invoices');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    login(email, password);
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    toast({
        title: "Forgot Password",
        description: "Password reset functionality is not yet implemented in this demo.",
        variant: "default"
    });
  }
  
  const handleSocialLogin = (provider: 'Google' | 'GitHub' | 'Microsoft') => {
      switch (provider) {
        case 'Microsoft':
            signInWithMicrosoft();
            break;
        case 'Google':
            toast({ title: 'Google Sign-In', description: 'Sign-in with Google is not yet implemented in this demo.' });
            break;
        case 'GitHub':
            toast({ title: 'GitHub Sign-In', description: 'Sign-in with GitHub is not yet implemented in this demo.' });
            break;
      }
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
                src="https://placehold.co/120x40.png?text=Financio&font=roboto"
                alt="Financio Logo"
                width={120}
                height={40}
                className="mx-auto mb-4"
                data-ai-hint="modern minimalist logo"
                priority
            />
          </Link>
          <CardTitle className="text-3xl font-bold font-headline text-primary">Secure Login</CardTitle>
          <CardDescription className="text-muted-foreground">
            Access your Financio dashboard. Use test@example.com / password.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-medium">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                required
                className="h-12 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full font-semibold text-base py-6" size="lg">
              <LogIn className="mr-2 h-5 w-5" /> Sign In
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button variant="outline" className="py-6 text-base" onClick={() => handleSocialLogin('Google')}>
              <Chrome className="mr-2 h-5 w-5" /> Google
            </Button>
            <Button variant="outline" className="py-6 text-base" onClick={() => handleSocialLogin('GitHub')}>
              <Github className="mr-2 h-5 w-5" /> GitHub
            </Button>
            <Button variant="outline" className="py-6 text-base" onClick={() => handleSocialLogin('Microsoft')}>
                <MicrosoftIcon className="mr-2 h-5 w-5" /> Microsoft
            </Button>
          </div>

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
