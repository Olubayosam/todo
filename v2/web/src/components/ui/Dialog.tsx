import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

let displayTransitionSupport: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (displayTransitionSupport !== undefined) return displayTransitionSupport;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) return (displayTransitionSupport = false);
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  displayTransitionSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return displayTransitionSupport;
}

/** Closes with the exit transition even where `overlay`/display transitions are unsupported (Firefox, Safari). */
async function closeAnimated(el: HTMLDialogElement) {
  if (!(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay())) {
    el.setAttribute('data-closing', '');
    const anims = el.getAnimations({ subtree: true });
    if (anims.length) {
      await Promise.race([Promise.allSettled(anims.map((a) => a.finished)), new Promise((r) => setTimeout(r, 400))]);
    } else {
      await new Promise((r) => setTimeout(r, 180));
    }
    el.removeAttribute('data-closing');
  }
  el.close();
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 'auto' = bottom sheet on phones, centred dialog elsewhere */
  variant?: 'auto' | 'center' | 'sheet' | 'side';
  label: string;
  className?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, variant = 'auto', label, className = '', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const phone = useMediaQuery('(max-width: 639px)');
  const kind = variant === 'auto' ? (phone ? 'sheet' : 'center') : variant;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Keep content mounted during the exit transition
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) void closeAnimated(el).then(() => setMounted(false));
    else if (!open) setMounted(false);
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === el) onCloseRef.current(); // backdrop
    };
    el.addEventListener('cancel', onCancel);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('cancel', onCancel);
      el.removeEventListener('click', onClick);
    };
  }, []);

  const shell =
    kind === 'sheet'
      ? 'is-sheet'
      : kind === 'side'
        ? 'is-side'
        : '';
  const panel =
    kind === 'sheet'
      ? 'rounded-t-3xl max-h-[88dvh] w-full safe-bottom'
      : kind === 'side'
        ? 'h-full w-[min(440px,100vw)] rounded-l-2xl'
        : 'rounded-2xl w-[min(560px,calc(100vw-2rem))] max-h-[85dvh]';

  return (
    <dialog ref={ref} className={`ui-dialog ${shell}`} aria-label={label}>
      {mounted && (
        <div className={`bg-raised text-fg border border-line shadow-lg overflow-hidden flex flex-col ${panel} ${className}`}>
          {kind === 'sheet' && <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-line-strong shrink-0" aria-hidden />}
          {children}
        </div>
      )}
    </dialog>
  );
}
