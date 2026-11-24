import type { ShowcaseInfo } from '../../worker/nexon.ts';

export function ShowcaseBanner({ showcase }: { showcase: ShowcaseInfo }) {
  return (
    <div className="showcase-banner">
      <p className="showcase-title">{showcase.title}</p>
      <p className="showcase-date">{showcase.dateText}</p>
    </div>
  );
}
