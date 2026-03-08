import React from 'react';
import DsCard from './DsCard';
import styles from './AllDs.module.css';

export default function DsList({ dsList = [], viewMode = 'grid', onDeleteRequest, onConfirmDelete, deleteConfirm = {}, currentUserId, allInfoExpanded, onPinToggle }) {
  if (!dsList || dsList.length === 0) return <div className={styles.empty}>No datasets found.</div>;

  return (
    <div className={viewMode === 'grid' ? styles.grid : styles.list}>
      {dsList.map(ds => (
        <DsCard 
          key={ds.name} 
          ds={ds} 
          viewMode={viewMode} 
          onDeleteRequest={() => onDeleteRequest(ds.name)} 
          onConfirmDelete={() => onConfirmDelete(ds.name)}
          isAwaitingConfirm={!!deleteConfirm[ds.name]}
          currentUserId={currentUserId} 
          allInfoExpanded={allInfoExpanded}
          pinned={!!ds.pinned}
          onPinToggle={onPinToggle}
        />
      ))}
    </div>
  );
}
