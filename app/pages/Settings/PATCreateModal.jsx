import React, { useState } from 'react';
import { createPAT } from '../../api/client';

export default function PATCreateForm({ onClose, onCreate }) {
  const [formData, setFormData] = useState({ name: '', expiresInDays: 365 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Token name is required');
      return;
    }
    if (formData.name.length > 100) {
      setError('Token name must be less than 100 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const tokenData = await createPAT({
        name: formData.name.trim(),
        expiresInDays: formData.expiresInDays,
      });
      onCreate(tokenData);
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to generate token');
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--color-primary)',
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
          Generate New Token
        </h4>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="pat-name" style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14, color: 'var(--color-text)' }}>
              Token Name <span style={{ color: 'var(--color-danger, #dc3545)' }}>*</span>
            </label>
            <input
              id="pat-name"
              type="text"
              className="form-control"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., My API Token"
              maxLength={100}
              required
              disabled={loading}
              autoFocus
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <small style={{ display: 'block', marginTop: 4, color: 'var(--color-text-muted)' }}>
              A descriptive name to help you identify this token later
            </small>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="pat-expiry" style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14, color: 'var(--color-text)' }}>
              Token Expiration
            </label>
            <select
              id="pat-expiry"
              value={formData.expiresInDays}
              onChange={(e) => setFormData({ ...formData, expiresInDays: parseInt(e.target.value, 10) })}
              disabled={loading}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)' }}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>1 year (recommended)</option>
              <option value={0}>Never (not recommended)</option>
            </select>
            <small style={{ display: 'block', marginTop: 4, color: 'var(--color-text-muted)' }}>
              Tokens should expire for security reasons
            </small>
          </div>
          {error && (
            <div style={{ padding: 10, background: 'var(--color-danger-bg, #f8d7da)', color: 'var(--color-danger-text, #721c24)', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
              {error}
            </div>
          )}
        </div>
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
        }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Generating...' : 'Generate Token'}
          </button>
        </div>
      </form>
    </div>
  );
}
