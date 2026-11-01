'use client';
// ============================================================
// EdCap — Accessible Multiple-Choice Selection Pill (<ChoiceOption />)
// ============================================================
import React from 'react';
import Icon from '@/components/ui/Icon';

export interface ChoiceOptionProps {
  optionKey: 'A' | 'B' | 'C' | 'D';
  label: string;
  selected: boolean;
  disabled?: boolean;
  reviewState?: 'correct' | 'incorrect' | null;
  onSelect: (key: 'A' | 'B' | 'C' | 'D') => void;
}

export default function ChoiceOption({
  optionKey,
  label,
  selected,
  disabled = false,
  reviewState = null,
  onSelect,
}: ChoiceOptionProps) {
  let stateClass = 'quiz-option';
  if (reviewState === 'correct') {
    stateClass = 'quiz-option correct';
  } else if (reviewState === 'incorrect') {
    stateClass = 'quiz-option incorrect';
  } else if (selected) {
    stateClass = 'quiz-option selected';
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Option ${optionKey}: ${label}`}
      disabled={disabled}
      onClick={() => onSelect(optionKey)}
      className={stateClass}
    >
      <span className="quiz-option-marker" aria-hidden="true">
        {optionKey}
      </span>

      <span style={{ flex: 1, lineHeight: 1.5, fontSize: 14.5 }}>{label}</span>

      {selected && !reviewState && (
        <span className="badge badge-blue" style={{ fontSize: 10, textTransform: 'uppercase' }}>
          <Icon name="check" size={11} />
          <span>Selected</span>
        </span>
      )}
      {reviewState === 'correct' && (
        <span className="badge badge-green" style={{ fontSize: 10 }}>
          <Icon name="check" size={11} />
          <span>Correct</span>
        </span>
      )}
      {reviewState === 'incorrect' && (
        <span className="badge badge-red" style={{ fontSize: 10 }}>
          <Icon name="x" size={11} />
          <span>Your Choice</span>
        </span>
      )}
    </button>
  );
}
