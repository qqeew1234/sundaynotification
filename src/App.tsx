import { useCallback, useEffect, useState } from 'react';
import type { SundayEventApiResponse } from '../worker/nexon.ts';
import { AmbientBackground } from './components/AmbientBackground.tsx';
import { EmptyState } from './components/EmptyState.tsx';
import { EventCard } from './components/EventCard.tsx';
import { Header } from './components/Header.tsx';
import { AlertCircleIcon, RefreshIcon } from './components/icons.tsx';
import { useTheme } from './hooks/useTheme.ts';
import { useToast } from './hooks/useToast.ts';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'done'; data: SundayEventApiResponse }
  | { kind: 'failed'; message: string };

function formatChecked(iso: string): string {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const { message, showToast } = useToast();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (manual: boolean) => {
      setRefreshing(true);
      try {
        const res = await fetch('/api/sunday-event', manual ? { cache: 'no-store' } : undefined);
        const data = (await res.json()) as SundayEventApiResponse;
        setState({ kind: 'done', data });
        if (manual) showToast('최신 정보를 확인했어요');
      } catch {
        setState({ kind: 'failed', message: '서버에 연결할 수 없습니다.' });
      } finally {
        setRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const retry = (
    <button type="button" className="glass-btn" onClick={() => void load(true)}>
      <RefreshIcon size={16} />
      다시 시도
    </button>
  );

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크를 복사했어요');
    } catch {
      showToast('복사에 실패했어요');
    }
  };

  let body;
  let checkedAt: string | null = null;
  if (state.kind === 'loading') {
    body = (
      <section className="state-card glass-card">
        <div className="loading-spinner" />
        <p className="state-desc">이벤트를 불러오는 중...</p>
      </section>
    );
  } else if (state.kind === 'failed') {
    body = (
      <EmptyState
        icon={<AlertCircleIcon size={28} />}
        title="불러오지 못했어요"
        description={state.message}
        action={retry}
      />
    );
  } else {
    const { data } = state;
    checkedAt = data.fetchedAt;
    if (data.status !== 'ok') {
      body = (
        <EmptyState
          icon={<AlertCircleIcon size={28} />}
          title={data.status === 'unconfigured' ? '서버 설정이 필요해요' : '불러오지 못했어요'}
          description={data.error}
          action={retry}
        />
      );
    } else if (data.notice) {
      body = (
        <EventCard
          notice={data.notice}
          showShowcase={data.showShowcase}
          showcase={data.showcase}
          onCopy={(url) => void copyLink(url)}
        />
      );
    } else {
      body = (
        <EmptyState
          title="진행 중인 썬데이 메이플 이벤트가 없습니다."
          description="매주 금요일 오전 10시에 발표 됩니다"
          showShowcase={data.showShowcase}
          showcase={data.showcase}
        />
      );
    }
  }

  return (
    <>
      <AmbientBackground />
      <div className="app-shell">
        <div className="app-container">
          <Header
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onRefresh={() => void load(true)}
            isRefreshing={refreshing}
          />
          <main className="main-column">{body}</main>
        </div>
        <footer className="app-footer">
          <div className="footer-glass-box glass-panel">
            <span>매일 오전 10시(KST) 자동 갱신 · Data based on NEXON Open API</span>
            {checkedAt && <p className="footer-data-meta">마지막 동기화 (KST): {formatChecked(checkedAt)}</p>}
          </div>
        </footer>
      </div>
      {message && (
        <div className="glass-toast" role="status">
          {message}
        </div>
      )}
    </>
  );
}
