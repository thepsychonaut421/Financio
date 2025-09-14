'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { UserPlus, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export function SignupPageContent() {
  const { login, isAuthenticated, isLoading } = useAuth(); // Using login for simulated signup
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/purchases'); 
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // In a real app, you would get the reCAPTCHA token here
    const recaptchaToken = 'dummy-recaptcha-token-for-demo'; // Placeholder

    try {
        const response = await fetch('/api/recaptcha/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: recaptchaToken }),
        });

        const result = await response.json();

        if (!result.success) {
            toast({
                title: "Verificare eșuată",
                description: result.message || "Verificarea reCAPTCHA a eșuat. Vă rugăm să încercați din nou.",
                variant: "destructive"
            });
            return;
        }

        // reCAPTCHA valid, proceed with signup logic
        // For this simulation, we'll just use the existing login function
        toast({
            title: "Verificare reCAPTCHA reușită!",
            description: "Acum se va efectua înregistrarea...",
        });
        login(); 

    } catch (error) {
        toast({
            title: "Eroare de rețea",
            description: "Nu s-a putut contacta serverul pentru verificarea reCAPTCHA.",
            variant: "destructive"
        });
    }
  };

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
          <CardTitle className="text-3xl font-bold font-headline text-primary">Create Account</CardTitle>
          <CardDescription className="text-muted-foreground">
            Join Financio and streamline your document workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-medium">Full Name</Label>
              <Input 
                id="name" 
                type="text" 
                placeholder="Your Name" 
                required 
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-signup" className="font-medium">Email Address</Label>
              <Input 
                id="email-signup" 
                type="email" 
                placeholder="you@example.com" 
                required 
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password-signup" className="font-medium">Password</Label>
              <Input 
                id="password-signup" 
                type="password" 
                required 
                placeholder="Choose a strong password" 
                className="h-12 text-base"
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="confirm-password-signup" className="font-medium">Confirm Password</Label>
              <Input 
                id="confirm-password-signup" 
                type="password" 
                required 
                placeholder="Confirm your password" 
                className="h-12 text-base"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This site is protected by reCAPTCHA and the Google{' '}
              <a href="https://policies.google.com/privacy" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and{' '}
              <a href="https://policies.google.com/terms" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Terms of Service</a> apply.
            </p>
            <Button type="submit" className="w-full font-semibold text-base py-6" size="lg">
              <UserPlus className="mr-2 h-5 w-5" /> Sign Up
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-3 p-6 bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline hover:text-primary/80 transition-colors">
              Sign In
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
