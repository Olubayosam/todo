import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { useUI } from '../../store/ui';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-on-ink shadow-lg animate-fade-up">
          {t.kind === 'error' ? <TriangleAlert size={16} className="text-urgent" /> : t.kind === 'success' ? <CheckCircle2 size={16} className="text-cyan" /> : <Info size={16} className="opacity-60" />}
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="ml-1 font-semibold text-gold"
              onClick={() => {
                t.action!.run();
                useUI.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
