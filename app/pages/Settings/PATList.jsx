import React from 'react';

function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function formatExpiry(expiresAt, isExpired) {
  if (!expiresAt) return <span style={{ color: 'var(--color-success, #28a745)', fontWeight: 500 }}>Never</span>;
  if (isExpired) return <span style={{ color: 'var(--color-danger, #dc3545)', fontWeight: 600 }}>Expired</span>;
  const date = new Date(expiresAt);
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return <span style={{ color: 'var(--color-danger, #dc3545)', fontWeight: 600 }}>In {diffDays} days</span>;
  if (diffDays < 30) return <span style={{ color: 'var(--color-warning, #ffc107)', fontWeight: 500 }}>In {Math.ceil(diffDays / 7)} weeks</span>;
  return <span style={{ color: 'var(--color-success, #28a745)' }}>{formatDate(expiresAt)}</span>;
}

export default function PATList({ tokens, loading, onDelete, onConfirmDelete, onCancelDelete, tokenToDelete, onRefresh }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)' }}>
        <p>Loading tokens...</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: 60,
        background: 'var(--color-bg-light)',
        borderRadius: 8,
        border: '2px dashed var(--color-border)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16, color: 'var(--color-primary)' }}>
          <i className="fa fa-key" aria-hidden="true" />
        </div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>No tokens yet</h3>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Generate your first personal access token to get started.</p>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--color-bg)',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-light)',
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
          Your Tokens ({tokens.length})
        </h3>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          style={{ padding: '4px 12px', fontSize: 13 }}
        >
          ↻ Refresh
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-bg-light)', border: 'none', borderBottom: '1px solid var(--color-border)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-bg-light)', border: 'none', borderBottom: '1px solid var(--color-border)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Created</th>
            <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-bg-light)', border: 'none', borderBottom: '1px solid var(--color-border)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expires</th>
            <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-bg-light)', border: 'none', borderBottom: '1px solid var(--color-border)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', width: 120 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <React.Fragment key={token.token_id}>
              <tr style={{
                borderTop: '1px solid var(--color-border)',
                opacity: token.is_expired ? 0.6 : 1,
                background: tokenToDelete?.token_id === token.token_id ? 'var(--color-bg-light)' : 'var(--color-bg)',
              }}>
                <td style={{ padding: '14px 16px', color: 'var(--color-text)', border: 'none' }}>
                  <strong>{token.name}</strong>
                  {token.is_expired && (
                    <span style={{
                      marginLeft: 8,
                      background: 'var(--color-warning-bg, #fff3cd)',
                      color: 'var(--color-warning-text, #856404)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                    }}>Expired</span>
                  )}
                </td>
                <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)', fontSize: 13, border: 'none' }}>
                  {formatDate(token.created_at)}
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, border: 'none' }}>
                  {formatExpiry(token.expires_at, token.is_expired)}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', border: 'none' }}>
                  {tokenToDelete?.token_id === token.token_id ? null : (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => onDelete({ token_id: token.token_id, name: token.name })}
                      style={{ padding: '4px 12px', fontSize: 13 }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
              {tokenToDelete?.token_id === token.token_id && (
                <tr>
                  <td colSpan={4} style={{
                    padding: '12px 16px',
                    background: 'var(--color-bg-light)',
                    border: 'none',
                    borderTop: '1px solid var(--color-border)',
                  }}>
                    <span style={{ marginRight: 16, color: 'var(--color-text)', fontSize: 14 }}>
                      Revoke <strong>{token.name}</strong>? Apps using this token will lose access immediately.
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={onConfirmDelete}
                      style={{ marginRight: 8, padding: '4px 12px', fontSize: 13 }}
                    >
                      Confirm Revoke
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={onCancelDelete}
                      style={{ padding: '4px 12px', fontSize: 13 }}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
