import { Inbox } from 'lucide-react';
import { useInboxTasks } from '../hooks/useTasks';
import { QuickAdd } from '../components/tasks/QuickAdd';
import { TaskList } from '../components/tasks/TaskList';
import { useLocalView } from '../hooks/useLocalView';

export function InboxView() {
  const tasks = useInboxTasks();
  const [view] = useLocalView();
  const open = tasks.filter((t) => !t.done).length;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5 sm:px-8 sm:pt-10">
      <header className="mb-6">
        <p className="mb-1 text-sm text-fg-3">Capture now, plan later</p>
        <h1 className="flex items-center gap-3 text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">
          Inbox
          {open > 0 && <span className="chip h-7 bg-sunken px-2.5 text-sm text-fg-2">{open}</span>}
        </h1>
      </header>
      <div className="mb-6">
        <QuickAdd date={null} />
      </div>
      {tasks.length ? (
        <TaskList tasks={tasks} variant={view === 'cards' ? 'card' : 'row'} />
      ) : (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-sunken text-fg-3">
            <Inbox size={24} />
          </div>
          <p className="font-medium">Inbox zero</p>
          <p className="mt-1 max-w-xs text-sm text-fg-3">Ideas without a date land here — including thoughts you park during a focus session.</p>
        </div>
      )}
    </div>
  );
}
