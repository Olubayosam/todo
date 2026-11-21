import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { login, useSession } from './session';
import { Submark } from '../components/ui/bits';

export function Login() {
  const error = useSession((s) => s.error);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      await login(value);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };

  const msg = localError ?? error;

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-carbon px-4 text-ivory">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-gold/20 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-cyan/15 blur-[120px]" aria-hidden />

      <main className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-10 flex flex-col items-center gap-6">
          <Submark className="h-14" />
          <img src="brand/wordmark-on-dark.svg" alt="Olubayosam" className="h-5" />
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/4 p-6 shadow-2xl backdrop-blur-xl">
          <label htmlFor="passcode" className="mb-3 flex items-center gap-2 text-sm text-ivory/70">
            <Lock size={14} /> Enter your passcode
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 focus-within:border-cyan/70 focus-within:ring-4 focus-within:ring-cyan/15">
            <input
              id="passcode"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-12 min-w-0 flex-1 bg-transparent text-base tracking-wider outline-none placeholder:text-ivory/30"
              placeholder="••••••••"
              aria-invalid={!!msg}
              aria-describedby={msg ? 'login-error' : undefined}
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="text-ivory/50 hover:text-ivory" aria-label={show ? 'Hide passcode' : 'Show passcode'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p id="login-error" className="mt-3 min-h-5 text-sm text-[#f37f79]" role="alert">
            {msg}
          </p>
          <button type="submit" disabled={!value || busy} className="btn btn-gold mt-2 h-12 w-full rounded-2xl text-[0.95rem]">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <>Unlock <ArrowRight size={17} /></>}
          </button>
        </form>
        <p className="mt-8 text-center text-xs text-ivory/35">
          Plan the day. Protect the focus.
        </p>
      </main>
    </div>
  );
}
