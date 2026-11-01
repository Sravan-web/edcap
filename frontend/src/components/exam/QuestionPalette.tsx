'use client';
// ============================================================
// EdCap — Right Sidebar Question Palette & Matrix (<QuestionPalette />)
// Statuses: Answered | Unanswered / Visited | Marked for Review | Not Visited
// ============================================================
import React from 'react';
import Icon from '@/components/ui/Icon';

export type QuestionVisitStatus =
  | 'answered'
  | 'review'
  | 'visited_unanswered'
  | 'not_visited';

export interface PaletteQuestionItem {
  id: string;
  index: number;
  status: QuestionVisitStatus;
}

export interface QuestionPaletteProps {
  items: PaletteQuestionItem[];
  currentIndex: number;
  onJumpToQuestion: (index: number) => void;
  onOpenSubmitModal: () => void;
}

export default function QuestionPalette({
  items,
  currentIndex,
  onJumpToQuestion,
  onOpenSubmitModal,
}: QuestionPaletteProps) {
  const counts = {
    answered: items.filter(i => i.status === 'answered').length,
    review: items.filter(i => i.status === 'review').length,
    visited_unanswered: items.filter(i => i.status === 'visited_unanswered').length,
    not_visited: items.filter(i => i.status === 'not_visited').length,
  };

  return (
    <aside
      className="card card-padding"
      aria-label="Question Palette and Status Matrix"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        height: 'fit-content',
        position: 'sticky',
        top: 84,
      }}
    >
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="grid" size={16} style={{ color: 'var(--tint-indigo-fg)' }} />
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
              Question Palette
            </h2>
          </div>
          <span className="badge badge-gray">{items.length} Total</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Select any question number to jump directly.
        </p>
      </div>

      {/* Status Legend & Live Counters */}
      <div
        className="subcard"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          padding: 12,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="legend-swatch answered" aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Answered ({counts.answered})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="legend-swatch review" aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Review ({counts.review})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="legend-swatch visited" aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Unanswered ({counts.visited_unanswered})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="legend-swatch" aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Not Visited ({counts.not_visited})
          </span>
        </div>
      </div>

      {/* Interactive Question Matrix Grid */}
      <div
        role="group"
        aria-label="Question matrix"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
        }}
      >
        {items.map(item => {
          const isCurrent = item.index === currentIndex;
          const statusClass =
            item.status === 'answered'
              ? 'answered'
              : item.status === 'review'
              ? 'review'
              : item.status === 'visited_unanswered'
              ? 'visited'
              : '';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJumpToQuestion(item.index)}
              aria-label={`Question ${item.index + 1}, status: ${item.status.replace('_', ' ')}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={`palette-cell ${statusClass} ${isCurrent ? 'current' : ''}`}
            >
              {item.index + 1}
              {item.status === 'review' && <span className="review-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Full Submit Trigger */}
      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 16 }}>
        <button
          type="button"
          onClick={onOpenSubmitModal}
          className="btn btn-primary btn-full"
        >
          <span>Finish & Submit Exam</span>
          <Icon name="arrowRight" size={15} />
        </button>
      </div>
    </aside>
  );
}
