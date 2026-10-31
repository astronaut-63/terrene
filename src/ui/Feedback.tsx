export function Feedback({ message, error = false, busy = false }: { message: string; error?: boolean; busy?: boolean }) {
  if (!message) return null;
  return <p className={'feedback' + (error ? ' error' : '')} role={error ? 'alert' : 'status'} aria-live="polite">{busy && <span className="loading-dot" aria-hidden="true" />}{message}</p>;
}
