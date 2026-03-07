/**
 * ControlPanel Component
 * 
 * Consolidated control panel for DsView page containing:
 * - Settings (checkboxes for view options)
 * - Quick Actions (Add Row, Refresh Jira, Copy-to-clipboard)
 * - Navigation (links to related pages)
 */

import React from 'react';
import { Link } from 'react-router-dom';
import styles from './ControlPanel.module.css';

function ControlPanel({
  // Settings props
  chronologyDescending,
  setChronologyDescending,
  showAllFilters,
  setShowAllFilters,
  singleClickEdit,
  handleSingleClickEditToggle,
  disableEditing,
  disableEditingRef,
  setDisableEditing,
  toggleEditing,
  setForceRefresh,
  
  // Actions props
  handleAddRow,
  handleRefreshJira,
  handleCopyToClipboard,
  refreshJiraMutation,
  
  // Navigation props
  dsName,
  dsView,
  
  // View config for Jira check
  viewConfig,
}) {

  return (
    <div className={styles.controlPanel}>
      {/* Top Row: Settings, Quick Actions, and Navigation side-by-side */}
      <div className={styles.topRow}>
        {/* Settings Section */}
        <div className={styles.panelSection}>
          <div className={styles.sectionHeader}>
            <i className='fas fa-cog'></i> Settings
          </div>
          <div className={styles.sectionContent}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={chronologyDescending}
                onChange={(e) => {
                  setChronologyDescending(e.target.checked);
                  localStorage.setItem('chronologyDescending', JSON.stringify(e.target.checked));
                  setForceRefresh(prev => prev + 1);
                }}
              />
              Desc order <i className='fas fa-level-down-alt'></i>
            </label>
            
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showAllFilters}
                onChange={(e) => {
                  setShowAllFilters(e.target.checked);
                  localStorage.setItem('showAllFilters', JSON.stringify(e.target.checked));
                }}
              />
              Show filters <i className='fas fa-filter'></i>
            </label>
            
            <label className={styles.checkboxLabel}>
              <input 
                type="checkbox" 
                checked={singleClickEdit} 
                onChange={handleSingleClickEditToggle}
              />
              1-click edit <i className='fas fa-bolt'></i>
            </label>
            
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={disableEditing}
                onChange={(e) => {
                  const checked = e.target.checked;
                  disableEditingRef.current = checked; // Sync ref
                  setDisableEditing(checked);
                  localStorage.setItem('disableEditing', JSON.stringify(checked));
                  toggleEditing(checked);
                }}
              />
              Disable edit <i className='fas fa-ban'></i>
            </label>
          </div>
        </div>

        {/* Quick Actions Section */}
        <div className={styles.panelSection}>
          <div className={styles.sectionHeader}>
            <i className='fas fa-bolt'></i> Quick Actions
          </div>
          <div className={styles.sectionContent}>
            <button className={styles.actionButton} onClick={handleAddRow}>
              <i className='fas fa-plus'></i> Add Row
            </button>
            
            {/* Refresh Jira button - conditional */}
            {(() => {
              try {
                if ((viewConfig?.jiraConfig?.jira) || (viewConfig?.jiraAgileConfig?.jira)) {
                  return (
                    <button 
                      className={styles.actionButton}
                      onClick={handleRefreshJira}
                      disabled={refreshJiraMutation?.isPending}
                    >
                      <i className='fas fa-redo'></i> Refresh Jira
                    </button>
                  );
                }
              } catch (e) {}
              return null;
            })()}
            
            <button className={styles.actionButton} onClick={handleCopyToClipboard}>
              <i className='fas fa-clipboard'></i> Copy
            </button>
          </div>
        </div>

        {/* Navigation Section */}
        <div className={styles.panelSection}>
          <div className={styles.sectionHeader}>
            <i className='fas fa-link'></i> Navigation
          </div>
          <div className={styles.sectionContent}>
            <Link to={`/dsEditLog/${dsName}`} target="_blank" className={styles.navLink}>
              <i className='fas fa-file-alt'></i> Edit-log
            </Link>
            
            <Link to={`/dsViewEdit/${dsName}/${dsView}`} target="_blank" className={styles.navLink}>
              <i className='fas fa-edit'></i> Edit-view
            </Link>
            
            <Link to={`/dsBulkEdit/${dsName}`} target="_blank" className={styles.navLink}>
              <i className='fas fa-edit'></i> Bulk-edit
            </Link>
            
            <Link to={`/dsAttachments/${dsName}`} target="_blank" className={styles.navLink}>
              <i className='fas fa-file-alt'></i> Attachments
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControlPanel;
