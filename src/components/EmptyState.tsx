import type { ReactNode } from 'react';
import type { ShowcaseInfo } from '../../worker/nexon.ts';
import { ShowcaseBanner } from './ShowcaseBanner.tsx';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  showShowcase?: boolean;
  showcase?: ShowcaseInfo;
}

export function EmptyState({ title, description, icon, action, showShowcase, showcase }: EmptyStateProps) {
  return (
    <section className="state-card glass-card">
      {icon && <div className="state-icon">{icon}</div>}
      <h2 className="state-title">{title}</h2>
      {description && <p className="state-desc">{description}</p>}
      {action}
      {showShowcase && showcase && <ShowcaseBanner showcase={showcase} />}
    </section>
  );
}
