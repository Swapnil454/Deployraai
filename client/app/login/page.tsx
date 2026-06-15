'use client';

import { useState } from 'react';
import { auth } from '../lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  sendEmailVerification
} from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleFirebaseToken = async (idToken: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/firebase-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to authenticate');
      
      if (data.user?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (!userCredential.user.emailVerified) {
        await sendEmailVerification(userCredential.user);
        await auth.signOut();
        setError('Please verify your email address before logging in. A new verification email has been sent to your inbox.');
        setLoading(false);
        return;
      }

      const idToken = await userCredential.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!email || !password) {
      setError('Please enter your email and password to verify');
      return;
    }
    try {
      setLoading(true);
      setError('');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (userCredential.user.emailVerified) {
        setError('Your email is already verified. You can log in directly.');
        await auth.signOut();
      } else {
        await sendEmailVerification(userCredential.user);
        await auth.signOut();
        setVerificationSent(true);
      }
      setLoading(false);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password, or account does not exist.');
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  return (
    <div suppressHydrationWarning className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-xl backdrop-blur-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Welcome back</h1>
          <p className="text-sm text-zinc-400">
            Sign in to your DeployAI account to continue
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </button>

        <div className="relative mb-6 flex items-center py-2">
          <div className="flex-grow border-t border-zinc-800"></div>
          <span className="flex-shrink-0 px-4 text-xs text-zinc-600">Or use email</span>
          <div className="flex-grow border-t border-zinc-800"></div>
        </div>

        <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder-zinc-400 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder-zinc-400 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors"
            />
          </div>
          
          <div className="pt-2">
            {verificationSent ? (
              <p className="text-sm text-green-400 text-center py-2 mb-2 bg-green-500/10 rounded-lg border border-green-500/20">Verification link sent! Check your email.</p>
            ) : (
              <button
                type="button"
                onClick={handleVerifyEmail}
                disabled={loading}
                className="mb-2 w-full rounded-lg border border-zinc-700 bg-transparent px-4 py-3 text-sm font-semibold text-zinc-300 transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                Verify Email
              </button>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-100 px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-zinc-300 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Login'}
            </button>
          </div>
        </form>

        <div className="relative mb-4 mt-6 flex items-center py-2">
          <div className="flex-grow border-t border-zinc-800"></div>
          <span className="flex-shrink-0 px-4 text-xs text-zinc-600">Legacy / Alternative login</span>
          <div className="flex-grow border-t border-zinc-800"></div>
        </div>

        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/auth/github`}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#24292e] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#2f363d] active:scale-[0.98] disabled:opacity-50"
        >
          <GithubIcon className="h-5 w-5" />
          Continue with GitHub
        </a>
        
        <p className="mt-8 text-center text-sm text-zinc-400">
          Don't have an account?{' '}
          <Link href="/signup" className="text-white hover:underline font-medium">
            Sign up
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-zinc-500">
          By clicking continue, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
