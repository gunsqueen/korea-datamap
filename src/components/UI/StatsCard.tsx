import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accentColor?: string;
  fullWidth?: boolean;
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  sub,
  accentColor = '#2563eb',
  fullWidth = false,
}: StatsCardProps) {
  const iconBg = accentColor + '18';

  return (
    <div className={`stats-card${fullWidth ? ' stats-card--full' : ''}`}>
      <div className="stats-card__icon" style={{ background: iconBg, color: accentColor }}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="stats-card__content">
        <div className="stats-card__label">{label}</div>
        <div className="stats-card__value" style={{ color: accentColor }}>
          {value}
        </div>
        {sub && <div className="stats-card__sub">{sub}</div>}
      </div>
    </div>
  );
}
