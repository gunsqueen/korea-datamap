import type { ReactNode } from 'react';

interface PanelHeaderProps {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PanelHeader({ title, meta, actions }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <div className="panel-title-wrap">
        <h2 className="panel-title">{title}</h2>
        {meta}
      </div>
      {actions && <div className="panel-actions">{actions}</div>}
    </div>
  );
}
