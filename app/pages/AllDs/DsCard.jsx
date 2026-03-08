import React from 'react';
import { Link } from 'react-router-dom';
import styles from './AllDs.module.css';

export default function DsCard({ ds, viewMode, onDeleteRequest, onConfirmDelete, isAwaitingConfirm, currentUserId, allInfoExpanded, pinned = false, onPinToggle }) {
  const owner = ds?.perms?.owner || null;
  const size = ds?.sizeOnDisk ? `${Math.round(ds.sizeOnDisk / 1024)} KB` : '—';
  const isOwner = owner && currentUserId && String(owner).toLowerCase() === String(currentUserId).toLowerCase();

  const [perCardExpanded, setPerCardExpanded] = React.useState(null); // null = follow global
  const expanded = perCardExpanded !== null ? perCardExpanded : !!allInfoExpanded;

  // When global toggle changes, enforce it on per-card state (but allow later per-card overrides)
  React.useEffect(() => {
    setPerCardExpanded(allInfoExpanded);
  }, [allInfoExpanded]);

  function toggleCard() {
    setPerCardExpanded(prev => (prev === null ? !expanded : !prev));
  }

  return (
    <div className={viewMode === 'grid' ? styles.card : styles.cardList}>
      <div className={styles.cardBody}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to={`/ds/${encodeURIComponent(ds.name)}/default`} className={styles.cardTitle}>
            {ds.name}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onPinToggle && (
              <i
                className={`fa fa-thumbtack ${pinned ? styles.pinIconActive : styles.pinIcon}`}
                onClick={() => onPinToggle(ds.name, !pinned)}
                role="button"
                aria-pressed={pinned}
                title={pinned ? 'Unpin from top of list' : 'Pin to top of list'}
              />
            )}
            <i
              className={`fa fa-info-circle ${styles.cardInfoIcon} ${expanded ? styles.iconActive : ''}`}
              onClick={toggleCard}
              role="button"
              aria-pressed={expanded}
              title={expanded ? 'Hide info' : 'Show info'}
            />
          </div>
        </div>

        {expanded ? (
          <>
            <div className={styles.cardMeta}>Owner: {owner || '—'}</div>
            <div className={styles.cardMeta}>Size: {size}</div>
          </>
        ) : (
          <div style={{ height: 6 }} />
        )}
      </div>
      <div className={styles.cardActions}>
        {isOwner && !isAwaitingConfirm && (
          <button className={styles.deleteBtn} onClick={onDeleteRequest}>Delete</button>
        )}
        {isOwner && isAwaitingConfirm && (
          <button className={styles.deleteBtnConfirm} onClick={onConfirmDelete}>Confirm Deletion</button>
        )}
      </div>
    </div>
  );
}
