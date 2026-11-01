'use client';
// ============================================================
// EdCap — Sticky Exam Countdown Header (<TimerHeader />)
// Dynamic color changes: Emerald -> Amber (<10m) -> Pulsing Rose (<5m)
// ============================================================
import React from 'react';
import Icon from '@/components/ui/Icon';

export interface TimerHeaderProps {
  title: string;
  subjectCode: string;
  subjectName: string;
  secondsRemaining: number;
  totalQuestions: number;
  answeredCount: number;
  isCurrentFlagged: boolean;
  onToggleFlagCurrent: () => void;
  onOpenSubmitModal: () => void;
  onExitExam?: () => void;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function TimerHeader({
  title,
  subjectCode,
  subjectName,
  secondsRemaining,
  totalQuestions,
  answeredCount,
  isCurrentFlagged,
  onToggleFlagCurrent,
  onOpenSubmitModal,
  onExitExam,
}: TimerHeaderProps) {
  const isCritical = secondsRemaining <= 300; // < 5 minutes
  const isWarning = secondsRemaining > 300 && secondsRemaining <= 600; // 5-10 minutes

  const timerStateClass = isCritical
    ? 'exam-timer critical'
    : isWarning
    ? 'exam-timer warning'
    : 'exam-timer safe';

  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return (
    <header
      className="exam-sticky-header"
      role="banner"
      aria-label="Active examination header"
    >
      {/* Left: Exam Title & Course Badge */}
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        {onExitExam && (
          <button
            type="button"
            onClick={onExitExam}
            className="btn btn-secondary btn-sm"
            aria-label="Back to exam lobby"
            title="Exit to Lobby"
          >
            <Icon name="arrowLeft" size={14} />
            <span>Lobby</span>
          </button>
        )}
        <span className="badge badge-blue" style={{ fontSize: 11 }}>{subjectCode}</span>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: 15.5,
              fontWeight: 800,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {subjectName} · {answeredCount}/{totalQuestions} Answered ({progressPct}%)
          </div>
        </div>
      </div>

      {/* Center: Sticky Live Countdown Timer */}
      <div
        role="timer"
        aria-live={isCritical ? 'assertive' : 'off'}
        aria-atomic="true"
        aria-label={`Time remaining ${formatCountdown(secondsRemaining)}`}
        className={timerStateClass}
      >
        <Icon name={isCritical ? 'alert' : 'clock'} size={17} />
        <span>{formatCountdown(secondsRemaining)}</span>
        <span className="timer-label">
          {isCritical ? 'Closing Soon' : isWarning ? 'Under 10m' : 'Remaining'}
        </span>
      </div>

      {/* Right: Quick Flag & Submit Exam CTA */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleFlagCurrent}
          className={`btn btn-sm ${isCurrentFlagged ? 'badge-purple' : 'btn-secondary'}`}
          style={
            isCurrentFlagged
              ? {
                  background: 'var(--tint-violet-bg)',
                  borderColor: 'var(--tint-violet-bd)',
                  color: 'var(--tint-violet-fg)',
                  padding: '8px 14px',
                }
              : undefined
          }
          aria-pressed={isCurrentFlagged}
        >
          <Icon name="flag" size={14} />
          <span>{isCurrentFlagged ? 'Flagged for Review' : 'Flag Question'}</span>
        </button>

        <button
          id="btn-open-submit-modal"
          type="button"
          onClick={onOpenSubmitModal}
          className="btn btn-primary btn-sm"
        >
          <span>Submit Test</span>
          <Icon name="check" size={15} />
        </button>
      </div>
    </header>
  );
}
