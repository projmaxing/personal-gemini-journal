import React, { useState } from 'react';
import { 
  signInWithGoogle, 
  signInWithEmail, 
  signUpWithEmail, 
  signInAsGuest 
} from '../firebase/config';
import { ShieldCheck, Lock, KeyRound, Sparkles, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be stronger (at least 6 characters).');
      } else {
        setError(err.message || 'Authentication failed. Please check credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked by browser. Please allow popups or use Email/Guest sign-in.');
      } else {
        setError('Google sign-in could not be completed. You may also use Email or Verified Guest sign-in below.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInAsGuest();
    } catch (err: any) {
      console.error('Guest Sign-In failed:', err);
      setError('Guest authentication failed. Please try Email sign-in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white font-bold text-2xl shadow-lg shadow-blue-500/20 mb-4">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Gemini Journal
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
          A confidential, multi-turn AI reflection companion with zero-trust authenticated data isolation.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-[#1E293B] py-8 px-6 shadow-2xl shadow-black/40 border border-slate-700/60 rounded-2xl sm:px-10">
          
          {/* Security Guarantee Banner */}
          <div className="mb-6 p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs text-slate-300 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Private & Isolated Storage:</span>
              <p className="mt-0.5 text-slate-400">
                Your entries and conversations are strictly private and accessible only when signed into your account.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Primary Google Auth */}
          <button
            id="btn-signin-google"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-700 rounded-xl shadow-xs text-sm font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 focus:outline-hidden transition-all disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#1E293B] px-2 text-slate-500 font-mono">or email sign-in</span>
            </div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300">Email address</label>
              <input
                id="input-auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Password</label>
              <input
                id="input-auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
            </div>

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : isSignUp ? (
                <>
                  <span>Create Private Journal Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Sign In Securely</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-xs text-slate-400 hover:text-blue-400 underline font-medium transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#1E293B] px-2 text-slate-500 font-mono">Instant Sandbox Access</span>
            </div>
          </div>

          {/* Guest Sign-In */}
          <button
            id="btn-signin-guest"
            type="button"
            onClick={handleGuestSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Continue as Guest</span>
          </button>
        </div>

        {/* Threat Model & Security Posture Quick Highlights */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="p-3.5 bg-[#1E293B]/70 border border-slate-700/50 rounded-xl text-left">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mb-1.5" />
            <div className="text-xs font-semibold text-white">Zero-Trust Tokens</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Google JWKS signature verified on every request.</div>
          </div>
          <div className="p-3.5 bg-[#1E293B]/70 border border-slate-700/50 rounded-xl text-left">
            <KeyRound className="w-4 h-4 text-cyan-400 mb-1.5" />
            <div className="text-xs font-semibold text-white">Server-Side Gemini</div>
            <div className="text-[11px] text-slate-400 mt-0.5">API keys never exposed to browser JavaScript.</div>
          </div>
          <div className="p-3.5 bg-[#1E293B]/70 border border-slate-700/50 rounded-xl text-left">
            <Sparkles className="w-4 h-4 text-blue-400 mb-1.5" />
            <div className="text-xs font-semibold text-white">Reflection Insights</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Analyzes only your private authenticated entries.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
