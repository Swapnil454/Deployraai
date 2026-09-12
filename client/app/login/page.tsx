'use client';

import { useState } from 'react';
import { getFirebaseAuth } from '../lib/firebase';
import { Pacifico } from 'next/font/google';
import { toast } from 'sonner';

const pacifico = Pacifico({ weight: '400', subsets: ['latin'] });

import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  GithubAuthProvider,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendEmailVerification
} from 'firebase/auth';
import { useRouter } from 'next/navigation';

const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

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
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      toast.error(err.message);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const auth = getFirebaseAuth();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        toast.error('Sign-in was cancelled. Please try again.');
      } else {
        toast.error('Google sign-in failed. Please try again later.');
      }
      setLoading(false);
    }
  };

  const handleGithubLogin = async () => {
    try {
      setLoading(true);
      const provider = new GithubAuthProvider();
      provider.addScope('read:user');
      provider.addScope('user:email');
      const auth = getFirebaseAuth();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        toast.error('Sign-in was cancelled. Please try again.');
      } else {
        toast.error('GitHub sign-in failed. Please try again later.');
      }
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (!isLogin) {
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        toast.error('Password should be at least 6 characters');
        return;
      }
    }
    
    try {
      setLoading(true);
      const auth = getFirebaseAuth();
      
      if (isLogin) {
        // Login Flow
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
          await sendEmailVerification(userCredential.user);
          await auth.signOut();
          toast.error('Please verify your email address before logging in. A new verification email has been sent to your inbox.');
          setLoading(false);
          return;
        }

        const idToken = await userCredential.user.getIdToken();
        await handleFirebaseToken(idToken);
      } else {
        // Signup Flow
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        await auth.signOut();
        
        toast.success('Account created successfully! Please check your email to verify your account before logging in.');
        setIsLogin(true); // switch to login mode after successful signup
        setPassword('');
        setConfirmPassword('');
        setLoading(false);
      }
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        toast.error('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        toast.error('An account with this email already exists.');
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. If you just created an account, please check your spam folder for the verification email or try again later.');
      } else {
        toast.error(err.message);
      }
      setLoading(false);
    }
  };

  return (
    <div suppressHydrationWarning className="flex min-h-screen w-full bg-black relative overflow-hidden z-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-400/10 via-black/0 to-black/0 -z-10"></div>
      
      {/* Left Column */}
      <div className="flex w-full flex-col justify-center px-8 py-12 lg:w-1/2 lg:px-24 xl:px-32 relative">
        <div className="mx-auto w-full max-w-md mt-2 lg:mt-0">
          <div className="-mt-8 lg:-mt-10 mb-4 flex items-center gap-3">
            <img 
              src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png" 
              alt="Logo" 
              className="h-14 w-auto"
            />
          </div>

          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white flex items-baseline gap-2">
            Welcome to <span className={`${pacifico.className} font-normal tracking-normal text-4xl`}>Deployra AI</span>
          </h1>
          <p className="mb-6 text-sm text-zinc-400 leading-relaxed">
            Get started - it's free.
          </p>

          <div className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-[#1c2128] px-4 py-3.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white transition-colors"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-zinc-800 bg-[#1c2128] px-4 py-3.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-white transition-colors"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-md border border-zinc-800 bg-[#1c2128] px-4 py-3.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-white transition-colors"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      {showConfirmPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
              
              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Processing...' : (isLogin ? 'Sign In Securely' : 'Create Account')}
                </button>
              </div>
            </form>

            <div className="relative flex items-center py-4 mt-2">
              <div className="flex-grow border-t border-zinc-800"></div>
              <span className="flex-shrink-0 px-4 text-xs text-zinc-600 uppercase tracking-wider">Alternative Logins</span>
              <div className="flex-grow border-t border-zinc-800"></div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                type="button"
                className="flex flex-1 items-center justify-center gap-3 rounded-md bg-white px-4 py-3.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
              >
                <GoogleIcon className="h-5 w-5" />
                Google
              </button>

              <button
                type="button"
                onClick={handleGithubLogin}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-3 rounded-md bg-[#24292e] px-4 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#2f363d] active:scale-[0.98] disabled:opacity-50"
              >
                <GithubIcon className="h-5 w-5" />
                GitHub
              </button>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-zinc-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              onClick={() => setIsLogin(!isLogin)} 
              className="font-semibold text-blue-500 hover:text-blue-400 hover:underline transition-colors"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </div>

          <div className="mt-6 text-center text-xs text-zinc-600">
            By {isLogin ? 'signing in' : 'signing up'}, you agree to our{' '}
            <span className="font-semibold text-zinc-400 cursor-pointer hover:text-zinc-300">Privacy Policy</span> and{' '}
            <span className="font-semibold text-zinc-400 cursor-pointer hover:text-zinc-300">Terms of Service</span>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-8 lg:p-12">
        <div className="duration-300 transition-[filter] will-change-filter relative aspect-square w-[600px] xl:w-[700px] max-w-full overflow-hidden">
          <video 
            autoPlay 
            loop 
            muted 
            playsInline 
            className="absolute left-0 top-0 h-full w-full object-cover" 
            poster="/static/cube-fallback.jpg" 
            src="https://res.cloudinary.com/q2bmwbvf/video/upload/v1789193379/cube.mp4" 
          ></video>
        </div>
      </div>
    </div>
  );
}
