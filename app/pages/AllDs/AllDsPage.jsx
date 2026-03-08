import React, { useEffect, useMemo, useState } from 'react';
import styles from './AllDs.module.css';
import useAllDs from './useAllDs';
import useDeleteDs from './useDeleteDs';
import usePinDs from './usePinDs';
import SearchSortBar from './SearchSortBar';
import DsList from './DsList';
import { useAuth } from '../../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';

export default function AllDsPage({ currentUserId }) {
  const auth = useAuth();
  const userId = currentUserId || auth.userId;
  const { data, isLoading, isError, refetch } = useAllDs(userId);
  const deleteMut = useDeleteDs();
  const pinMut = usePinDs(userId);
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('allDsViewMode') || 'grid');
  const [searchText, setSearchText] = useState(() => localStorage.getItem('allDsSearchText') || '');
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('allDsSortBy') || 'name_asc');
  const [allInfoExpanded, setAllInfoExpanded] = useState(() => localStorage.getItem('allDsGlobalInfoExpanded') === 'true');
  const [deleteConfirm, setDeleteConfirm] = useState({});

  useEffect(() => { localStorage.setItem('allDsViewMode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('allDsSearchText', searchText); }, [searchText]);
  useEffect(() => { localStorage.setItem('allDsSortBy', sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem('allDsGlobalInfoExpanded', allInfoExpanded ? 'true' : 'false'); }, [allInfoExpanded]);

  const dbList = data?.dbList || [];

  const filtered = useMemo(() => {
    const txt = searchText.trim().toLowerCase();
    let out = dbList.filter(d => !txt || (d.name || '').toLowerCase().includes(txt));
    if (sortBy === 'name_asc') out = out.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    if (sortBy === 'name_desc') out = out.sort((a,b) => (b.name||'').localeCompare(a.name||''));
    if (sortBy === 'size_asc') out = out.sort((a,b) => (a.sizeOnDisk||0) - (b.sizeOnDisk||0));
    if (sortBy === 'size_desc') out = out.sort((a,b) => (b.sizeOnDisk||0) - (a.sizeOnDisk||0));
    // Float pinned datasets to the top, preserving the user's chosen sort order within each group
    const pinned = out.filter(d => d.pinned);
    const unpinned = out.filter(d => !d.pinned);
    return [...pinned, ...unpinned];
  }, [dbList, searchText, sortBy]);

  function handlePinToggle(dsName, pin) {
    pinMut.mutate({ dsName, dsUser: userId, pin });
  }

  function handleRequestDelete(dsName) {
    setDeleteConfirm(prev => ({ ...prev, [dsName]: true }));
  }
  function handleConfirmDelete(dsName) {
    deleteMut.mutate({ dsName, dsUser: userId });
    setDeleteConfirm(prev => {
      const updated = { ...prev };
      delete updated[dsName];
      return updated;
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div className={styles.titleContainer}>
          <h3 className={styles.pageTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Your Datasets
            <i
              className={`fa fa-info-circle ${allInfoExpanded ? styles.iconActive : ''} ${styles.globalInfoIcon}`}
              onClick={() => setAllInfoExpanded(v => !v)}
              role="button"
              aria-pressed={!!allInfoExpanded}
              title={allInfoExpanded ? 'Collapse all info' : 'Expand all info'}
            />
          </h3>
        </div>

        <div className={styles.headerControls}>
          <SearchSortBar
            viewMode={viewMode}
            onToggleView={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            searchText={searchText}
            onSearch={setSearchText}
            sortBy={sortBy}
            onSort={setSortBy}
            allInfoExpanded={allInfoExpanded}
            onToggleAllInfo={() => setAllInfoExpanded(v => !v)}
          />
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/ds/new-from-xls')}
          >
            <b>New Ds (xlsx)</b>
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/ds/new-from-csv')}
          >
            <b>New Ds (csv)</b>
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/ds/new-from-ds')}
          >
            <b>Copy Ds</b>
          </button>
        </div>
      </div>

      {isLoading && <div className={styles.loading}>Loading datasets...</div>}
      {isError && (
        <div className={styles.error}>
          Error loading datasets. <button onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {!isLoading && !isError && (
        <DsList
          dsList={filtered}
          viewMode={viewMode}
          onDeleteRequest={handleRequestDelete}
          onConfirmDelete={handleConfirmDelete}
          deleteConfirm={deleteConfirm}
          currentUserId={userId}
          allInfoExpanded={allInfoExpanded}
          onPinToggle={handlePinToggle}
        />
      )}
    </div>
  );
}
