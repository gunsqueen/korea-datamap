import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevated?: boolean;
}

export function Card({ children, elevated = false, className = '', ...props }: CardProps) {
  return (
    <div className={`ui-card${elevated ? ' ui-card--elevated' : ''}${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </div>
  );
}
