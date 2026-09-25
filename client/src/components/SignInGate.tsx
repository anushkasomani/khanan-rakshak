import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { motion } from 'framer-motion';
import { smooth } from '../motion';

export const SignInGate: React.FC = () => {
  const { googleLogin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError('Sign-in failed. Please try again.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await googleLogin(credentialResponse.credential);
    } catch {
      setError('Sign-in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 px-6">
      <motion.div className="w-full max-w-[320px]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={smooth}>
        <Logo size="lg" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-50">
          Sign in to Khanan Rakshak
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">Use your organization Google account.</p>

        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}

        {/* Google's button iframe is light-scheme; matching it avoids an opaque white backdrop. */}
        <div className="mt-8 h-10" style={{ colorScheme: 'light' }}>
          {isSubmitting ? (
            <div className="h-10 flex items-center gap-2 text-sm text-zinc-400">
              <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-200 rounded-full animate-spin" />
              Signing in…
            </div>
          ) : (
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Sign-in failed. Please try again.')}
              theme="outline"
              size="large"
              shape="rectangular"
              text="continue_with"
              width="320"
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};
