import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import styles from './SidebarLayout.module.css';
import { useAuth } from './auth/AuthProvider';
import ThemeSwitcher from './components/ThemeSwitcher.jsx';

const SIDEBAR_KEY = 'sidebarOpen';

export default function SidebarLayout({ children, onLogout }) {
  console.log('[SidebarLayout] Rendered');
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    try {
      const val = localStorage.getItem(SIDEBAR_KEY) === 'true';
      console.log('[SidebarLayout] Initial open:', val);
      return val;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    console.log('[SidebarLayout] Sidebar open:', open);
    try {
      localStorage.setItem(SIDEBAR_KEY, open ? 'true' : 'false');
    } catch {}
  }, [open]);

  const handleToggle = () => setOpen(o => !o);

  const auth = useAuth();
  let displayName = auth?.userId || '';
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const saved = JSON.parse(raw);
      displayName = saved?.name || saved?.username || displayName;
    }
  } catch (e) {
    // ignore
  }

  return (
    <>
      {/* Hamburger button scrolls with content */}
      <button
        aria-label="Toggle sidebar"
        onClick={handleToggle}
        style={{
          position: 'absolute',
          top: 18,
          left: open ? 250 : 18,
          zIndex: 2001,
          background: 'none',
          border: 'none',
          color: 'var(--color-text-muted)',
          padding: '0.45rem 0.7rem',
          borderRadius: 'var(--border-radius)',
          fontSize: 24,
          cursor: 'pointer',
          boxShadow: 'none',
          outline: 'none',
          transition: 'left 0.2s'
        }}
      >
        <svg width="28" height="28" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect y="4" width="22" height="2.5" rx="1.25" fill="var(--color-text-muted)"/>
          <rect y="9.25" width="22" height="2.5" rx="1.25" fill="var(--color-text-muted)"/>
          <rect y="14.5" width="22" height="2.5" rx="1.25" fill="var(--color-text-muted)"/>
        </svg>
      </button>
      <div style={{display:'flex', minHeight:'100vh'}}>
          <div className={[
          styles.sidebar,
          open ? styles.sidebarOpen : styles.sidebarClosed
        ].join(' ')}>
          <div className={styles.sidebarBody} style={{display:'flex', flexDirection: 'column', height:'100%'}}>
            <div className={styles.sidebarSiteHeader} style={{padding: '0.6rem 0 0.6rem 0'}}>
              <div className={styles.sidebarSiteTitle}>Datagroom</div>
              <div className={styles.sidebarSiteWelcome}>Welcome, {displayName}</div>
            </div>
            <div style={{marginTop: '1rem', padding: '0.7rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
              <button
                type="button"
                className="btn btn-outline-light"
                style={{
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  fontSize: '1rem',
                  borderRadius: 'var(--border-radius)',
                  padding: '0.5rem 0.7rem',
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7em'
                }}
                onClick={() => navigate('/')}
              >
                <i className={`fa fa-home ${styles.sidebarHomeIcon}`} aria-hidden="true" />
                Your datasets
              </button>
              <button
                type="button"
                className="btn btn-outline-light"
                style={{
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  fontSize: '1rem',
                  borderRadius: 'var(--border-radius)',
                  padding: '0.5rem 0.7rem',
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7em'
                }}
                onClick={() => navigate('/settings/pats')}
                title="Tokens"
              >
                <i className={`fa fa-key ${styles.sidebarHomeIcon}`} aria-hidden="true" />
                Tokens
              </button>
              <button
                type="button"
                className="btn btn-outline-light"
                style={{
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  fontSize: '1rem',
                  borderRadius: 'var(--border-radius)',
                  padding: '0.5rem 0.7rem',
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7em'
                }}
                onClick={() => {
                  const base = import.meta.env.VITE_API_BASE || '';
                  window.open(`${base}/api-docs`, '_blank', 'noopener');
                }}
              >
                <i className={`fa fa-book ${styles.sidebarHomeIcon}`} aria-hidden="true" />
                API Docs
              </button>
            </div>
            <div style={{flex:1}} />
            <ThemeSwitcher />
            <div style={{padding:'1.2rem 0 1.5rem 0', display:'flex', flexDirection:'column', alignItems:'center'}}>
              <Button
                variant="outline-danger"
                style={{
                  width: '90%',
                  fontWeight: 600,
                  borderRadius: 'var(--border-radius)',
                  border: `1px solid var(--color-primary)`,
                  color: 'var(--color-primary)',
                  background: 'none'
                }}
                onClick={onLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
        <div className={[
          styles.mainContent,
          open ? styles.mainContentShift : ''
        ].join(' ')}>
          <div style={{paddingTop: 60}}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
