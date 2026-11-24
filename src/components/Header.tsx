import { useEffect, useRef, useState } from 'react';
import { CloseIcon, MoonIcon, RefreshIcon, SunIcon } from './icons.tsx';

const SECRET_MESSAGES = ['♥유진님 사랑해♥', '♥정말루 사랑해♥', '♥세상에서 제일 사랑해♥'];

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Header({ isDark, onToggleTheme, onRefresh, isRefreshing }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!groupRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleSecret = () => {
    if (!open) {
      setMessage(SECRET_MESSAGES[Math.floor(Math.random() * SECRET_MESSAGES.length)] ?? '');
    }
    setOpen((v) => !v);
  };

  return (
    <header className="glass-header glass-panel">
      <div className="header-top-row">
        <div className="brand-group" ref={groupRef}>
          <button
            type="button"
            className="brand-mark top-left-icon"
            aria-label="숨겨진 이벤트 열기"
            aria-expanded={open}
            onClick={toggleSecret}
          >
            <img src="/favicon.png" alt="" className="brand-mark-img" />
          </button>
          <div className="brand-text">
            <h1 className="brand-title">일요일 요정</h1>
            <p className="brand-subtitle">썬데이 메이플 알리미</p>
          </div>

          {open && (
            <section className="secret-chat glass-panel-strong" aria-live="polite">
              <div className="secret-chat-header">
                <span>메시지</span>
                <button
                  type="button"
                  className="secret-chat-close"
                  aria-label="닫기"
                  onClick={() => setOpen(false)}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <div className="secret-chat-body">
                <p className="secret-chat-message">{message}</p>
              </div>
            </section>
          )}
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="glass-btn theme-toggle-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="새로고침"
            title="새로고침"
          >
            <span className={isRefreshing ? 'is-spinning' : undefined}>
              <RefreshIcon size={19} />
            </span>
          </button>
          <button
            type="button"
            className="glass-btn theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {isDark ? <SunIcon size={19} /> : <MoonIcon size={19} />}
          </button>
        </div>
      </div>
    </header>
  );
}
