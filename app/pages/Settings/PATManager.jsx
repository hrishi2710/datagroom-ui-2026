import React, { useState, useEffect } from 'react';
import { getPATs, createPAT, deletePAT } from '../../api/client';
import PATList from './PATList';
import PATCreateForm from './PATCreateModal';
import PATTokenDisplay from './PATDisplayModal';

export default function PATManager() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTokenData, setNewTokenData] = useState(null);
  const [tokenToDelete, setTokenToDelete] = useState(null);

  async function fetchTokens() {
    try {
      setLoading(true);
      setError('');
      const data = await getPATs();
      setTokens(data.tokens || []);
    } catch (err) {
      console.error('Error fetching tokens:', err);
      setError('Failed to load tokens. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTokens(); }, []);

  async function handleCreateToken(tokenData) {
    setNewTokenData(tokenData);
    setShowCreateForm(false);
    await fetchTokens();
  }

  async function handleDeleteToken() {
    if (!tokenToDelete) return;
    try {
      await deletePAT(tokenToDelete.token_id);
      await fetchTokens();
      setTokenToDelete(null);
    } catch (err) {
      console.error('Error deleting token:', err);
      setError('Failed to revoke token. Please try again.');
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--color-text)' }}>Tokens</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: '0 0 16px', lineHeight: 1.5, fontSize: 14 }}>
          Personal access tokens allow external applications to access your Datagroom datasets.
          Tokens inherit your dataset-level and row-level permissions automatically.
        </p>
        {!showCreateForm && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setShowCreateForm(true); setNewTokenData(null); }}
            disabled={loading}
          >
            + Generate New Token
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--color-danger-bg, #f8d7da)', color: 'var(--color-danger-text, #721c24)', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          {error}
          <button type="button" onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}

      {showCreateForm && (
        <PATCreateForm onClose={() => setShowCreateForm(false)} onCreate={handleCreateToken} />
      )}

      {newTokenData && (
        <PATTokenDisplay tokenData={newTokenData} onClose={() => setNewTokenData(null)} />
      )}

      <PATList
        tokens={tokens}
        loading={loading}
        tokenToDelete={tokenToDelete}
        onDelete={setTokenToDelete}
        onConfirmDelete={handleDeleteToken}
        onCancelDelete={() => setTokenToDelete(null)}
        onRefresh={fetchTokens}
      />
    </div>
  );
}
