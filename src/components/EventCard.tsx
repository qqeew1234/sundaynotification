import type { ShowcaseInfo, SundayEventNotice } from '../../worker/nexon.ts';
import { CalendarIcon, CopyIcon, ExternalLinkIcon } from './icons.tsx';
import { ShowcaseBanner } from './ShowcaseBanner.tsx';

interface EventCardProps {
  notice: SundayEventNotice;
  showShowcase: boolean;
  showcase: ShowcaseInfo;
  onCopy: () => void;
}

export function EventCard({ notice, showShowcase, showcase, onCopy }: EventCardProps) {
  return (
    <article className="event-panel glass-card">
      <div className="event-badges">
        <span className="specialist-badge">진행 중</span>
        <span className="glass-pill event-period">
          <CalendarIcon size={14} />
          {notice.startAt} ~ {notice.endAt}
        </span>
      </div>
      <h2 className="event-title">{notice.title}</h2>
      <div className="event-actions">
        <a
          className="glass-btn-primary"
          href={notice.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon size={16} />
          공식 공지 보기
        </a>
        <button type="button" className="glass-btn" onClick={onCopy}>
          <CopyIcon size={16} />
          링크 복사
        </button>
      </div>
      {showShowcase && <ShowcaseBanner showcase={showcase} />}
      <hr className="event-divider" />
      <section
        className="event-content"
        dangerouslySetInnerHTML={{ __html: notice.contentsHtml }}
      />
    </article>
  );
}
