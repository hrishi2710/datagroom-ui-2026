import React from 'react';

export default function PATDeleteConfirm({ token, onConfirm, onCancel }) {
  function handleBackgroundClick(e) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div
      className="modal-overlay"
      onClick={handleBackgroundClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
      }}
    >
      <div
        className="modal-content"
        style={{
          background: 'var(--color-bg, #fff)',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          maxWidth: 440,
          width: '100%',
        }}
      >
        <div style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600 }}>Delete token?</h3>
          <p style={{ margin: '0 0 20px', color: '#666' }}>
            The token <strong>{token?.name}</strong> will be revoked. Any applications using this
            token will stop working.
          </p>
        </div>
        <div
          style={{
            padding: '20px 24px',
            borderTop: '1px solid var(--color-border, #e9ecef)',
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Delete Token
          </button>
        </div>
      </div>
    </div>
  );
}
