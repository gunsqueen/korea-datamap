import type { HTMLAttributes, ReactNode } from 'react';

interface ListItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
}

export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  selected = false,
  className = '',
  ...props
}: ListItemProps) {
  return (
    <div className={`ui-list-item${selected ? ' ui-list-item--selected' : ''}${className ? ` ${className}` : ''}`} {...props}>
      {leading && <div className="ui-list-item__leading">{leading}</div>}
      <div className="ui-list-item__body">
        <div className="ui-list-item__title">{title}</div>
        {subtitle && <div className="ui-list-item__subtitle">{subtitle}</div>}
      </div>
      {trailing && <div className="ui-list-item__trailing">{trailing}</div>}
    </div>
  );
}
