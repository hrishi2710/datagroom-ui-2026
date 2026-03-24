import React, { useState } from 'react';

export default function PATTokenDisplay({ tokenData, onClose }) {
  const [copied, setCopied] = useState(false);

  const token = tokenData?.token || '';

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--color-warning, #ffc107)',
      borderRadius: 8,
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
          <i className="fa fa-check-circle" aria-hidden="true" style={{ marginRight: 8, color: 'var(--color-success, #28a745)' }} />
          Token Created
        </h4>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--color-warning-bg, #fff3cd)',
          color: 'var(--color-warning-text, #856404)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14,
        }}>
          <strong>Important:</strong> This token is shown only once. Copy it now and store it securely.
        </div>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14, color: 'var(--color-text)' }}>
          Your Token
        </label>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'var(--color-bg-light)',
          border: '1px solid var(--color-border)',
          padding: '10px 12px',
          borderRadius: 6,
        }}>
          <code style={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: 13,
            wordBreak: 'break-all',
            color: 'var(--color-primary)',
          }}>
            {token}
          </code>
          <button
            type="button"
            className="btn btn-primary"
            onClick={copyToClipboard}
            style={{ whiteSpace: 'nowrap', padding: '5px 14px', fontSize: 13 }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
