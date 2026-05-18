import { Card } from './Card';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function ChartCard({ title, children, action }: ChartCardProps) {
  return (
    <Card className="chart-card">
      <div className="chart-card__header">
        <span className="chart-card__title">{title}</span>
        {action && <div className="chart-card__action">{action}</div>}
      </div>
      <div className="chart-card__body">{children}</div>
    </Card>
  );
}
