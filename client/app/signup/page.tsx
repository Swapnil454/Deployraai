'use client';

import { useState } from 'react';
import { auth } from '../lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword,
  sendEmailVerification
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleGoogleSignup = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleEmailPasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Send verification email
      await sendEmailVerification(userCredential.user);
      
      // Sign out immediately so they can't bypass verification
      await auth.signOut();
      
      setSuccessMsg('Account created successfully! Please check your email to verify your account before logging in.');
      setLoading(false);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Create an account</h1>
          <p className="text-sm text-zinc-400">
            Sign up for DeployAI to get started
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
            {error}
          </div>
        )}
        
        {successMsg && (
          <div className="mb-4 rounded bg-emerald-500/10 p-4 text-sm text-emerald-400 border border-emerald-500/20">
            {successMsg}
          </div>
        )}

        <button
          onClick={handleGoogleSignup}
          disabled={loading}
          className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
        >
          <GoogleIcon className="h-5 w-5" />
          Sign up with Google
        </button>

        <div className="relative mb-6 flex items-center py-2">
          <div className="flex-grow border-t border-zinc-800"></div>
          <span className="flex-shrink-0 px-4 text-xs text-zinc-600">Or use email</span>
          <div className="flex-grow border-t border-zinc-800"></div>
        </div>

        <form onSubmit={handleEmailPasswordSignup} className="space-y-4">
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
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder-zinc-400 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder-zinc-400 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors"
            />
          </div>
          
          <div className="pt-2">
            <button
              type="button"
              onClick={handleEmailPasswordSignup}
              disabled={loading}
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-transparent px-4 py-3 text-sm font-semibold text-zinc-300 transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
            >
              Verify Email
            </button>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-100 px-4 py-3 text-sm font-semibold text-black transition-all hover:bg-zinc-300 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Sign up'}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:underline font-medium">
            Log in
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-zinc-500">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
