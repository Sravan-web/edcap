'use client';
// ============================================================
// EdCap — Test Submission Summary & Confirmation Modal (<ExamModal />)
// ============================================================
import React from 'react';
import Icon from '@/components/ui/Icon';

export interface ExamModalProps {
  isOpen: boolean;
  totalQuestions: number;
  answeredCount: number;
  reviewCount: number;
  unansweredCount: number;
  notVisitedCount: number;
  secondsRemaining: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirmSubmit: () => void;
}

export default function ExamModal({
  isOpen,
  totalQuestions,
  answeredCount,
  reviewCount,
  unansweredCount,
  notVisitedCount,
  secondsRemaining,
  submitting,
  onCancel,
  onConfirmSubmit,
}: ExamModalProps) {
  if (!isOpen) return null;

  const totalPending = unansweredCount + notVisitedCount;
  const minsLeft = Math.floor(Math.max(0, secondsRemaining) / 60);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-submit-modal-title"
      className="modal-backdrop"
    >
      <div
        className="card card-padding"
        style={{
          maxWidth: 480,
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="badge badge-blue">Final Submission Check</span>
          <span className="flex items-center gap-2" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            <Icon name="clock" size={14} />
            <span>{minsLeft}m remaining</span>
          </span>
        </div>

        <h2
          id="exam-submit-modal-title"
          style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}
        >
          Ready to submit your examination?
        </h2>

        {totalPending > 0 ? (
          <div role="alert" className="callout callout-danger mb-4">
            <Icon name="alert" size={18} />
            <div>
              <strong>You have {totalPending} unanswered question{totalPending > 1 ? 's' : ''}.</strong>{' '}
              Are you sure you want to submit now?
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>
            You have answered all {totalQuestions} questions. Confirm to lock your responses and generate your diagnostic score report.
          </p>
        )}

        {/* Summary Breakdown Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
            marginBottom: 22,
          }}
        >
          <div className="subcard">
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{answeredCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Answered</div>
          </div>

          <div className="subcard">
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>{totalPending}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Unanswered</div>
          </div>

          <div className="subcard">
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tint-violet-fg)' }}>{reviewCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Marked for Review</div>
          </div>

          <div className="subcard">
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{totalQuestions}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Total Questions</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn btn-secondary btn-full"
          >
            <Icon name="arrowLeft" size={15} />
            <span>Return to Exam</span>
          </button>

          <button
            id="btn-confirm-submit-exam"
            type="button"
            onClick={onConfirmSubmit}
            disabled={submitting}
            className="btn btn-primary btn-full"
          >
            <Icon name="checkCircle" size={15} />
            <span>{submitting ? 'Grading Exam…' : 'Confirm & Submit'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
