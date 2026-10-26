import { ArrowRight, CircleDot, UsersRound } from "lucide-react";

export function QueueIllustration() {
  return (
    <div className="queue-illustration" role="img" aria-label="Illustration of queue information flowing into a student view">
      <div className="queue-illustration__orbit queue-illustration__orbit--outer" aria-hidden="true" />
      <div className="queue-illustration__orbit queue-illustration__orbit--inner" aria-hidden="true" />
      <div className="queue-illustration__signal-card">
        <div className="queue-illustration__signal-top">
          <span className="queue-illustration__signal-icon"><UsersRound size={19} aria-hidden="true" /></span>
          <span className="queue-illustration__signal-label">QUEUE MODULE</span>
        </div>
        <div className="queue-illustration__signal-line" aria-hidden="true" />
        <div className="queue-illustration__signal-line queue-illustration__signal-line--short" aria-hidden="true" />
        <span className="queue-illustration__signal-state"><CircleDot size={13} aria-hidden="true" /> Awaiting integration</span>
      </div>
      <span className="queue-illustration__connector" aria-hidden="true"><ArrowRight size={19} /></span>
      <div className="queue-illustration__student-card">
        <span className="queue-illustration__student-orb" aria-hidden="true" />
        <span className="queue-illustration__student-label">STUDENT VIEW</span>
        <span className="queue-illustration__student-copy">Queue information appears here when provided.</span>
      </div>
      <span className="queue-illustration__spark queue-illustration__spark--one" aria-hidden="true">✳</span>
      <span className="queue-illustration__spark queue-illustration__spark--two" aria-hidden="true">✳</span>
    </div>
  );
}
