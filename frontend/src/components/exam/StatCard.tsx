'use client';
// ============================================================
// EdCap — Modular SaaS Metric Card (<StatCard />)
// ============================================================
import React from 'react';
import Icon, { type IconName } from '@/components/ui/Icon';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: string;
  trendPositive?: boolean;
  icon: IconName | React.ReactNode;
  accentColor?: 'indigo' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';
}

const ACCENT_MAP: Record<
  NonNullable<StatCardProps['accentColor']>,
  { tone: string; valueColor?: string }
> = {
  indigo:  { tone: 'tone-indigo' },
  blue:    { tone: 'tone-blue' },
  emerald: { tone: 'tone-emerald', valueColor: 'var(--success)' },
  rose:    { tone: 'tone-rose',    valueColor: 'var(--danger)' },
  amber:   { tone: 'tone-amber',   valueColor: 'var(--warning)' },
  violet:  { tone: 'tone-violet',  valueColor: 'var(--brand-400)' },
};

export default function StatCard({
  label,
  value,
  subtext,
  trend,
  trendPositive = true,
  icon,
  accentColor = 'indigo',
}: StatCardProps) {
  const palette = ACCENT_MAP[accentColor];

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div
          className={`icon-tile ${palette.tone}`}
          style={{ width: 40, height: 40 }}
          aria-hidden="true"
        >
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={19} /> : icon}
        </div>
        {trend && (
          <span
            className={`badge ${trendPositive ? 'badge-green' : 'badge-red'}`}
            style={{ textTransform: 'none', fontSize: 11 }}
          >
            <Icon name={trendPositive ? 'trendingUp' : 'trendingDown'} size={12} />
            <span>{trend}</span>
          </span>
        )}
      </div>

      <div
        className="stat-value"
        style={palette.valueColor ? { color: palette.valueColor } : undefined}
      >
        {value}
      </div>

      <div className="stat-label">{label}</div>

      {subtext && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {subtext}
        </div>
      )}
    </div>
  );
}
