/**
 * DsView Page - Dataset Viewer and Editor
 * 
 * Main component for viewing and editing dataset records with:
 * - Interactive Tabulator table
 * - Real-time collaborative editing via Socket.io
 * - Cell-level locking
 * - Advanced filtering and sorting
 * - JIRA integration
 * - Excel export
 * - Presentation mode
 * 
 * Migration Note: This is a partial implementation framework.
 * The full 2,360-line reference implementation needs to be incrementally
 * migrated with all methods, handlers, and features.
 */

import React, { useState, useEffect, useRef, useReducer, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Row, Col } from 'react-bootstrap';
import { useQueryClient } from '@tanstack/react-query';
import styles from './DsViewPage.module.css';
import { useAuth } from '../../auth/AuthProvider';
import { downloadXlsx, fetchViewColumns, setViewDefinitions, getOtherTableAttrs, setOtherTableAttrs } from '../../api/ds';

// Hooks
import useDsView from '../../hooks/useDsView';
import useEditCell from '../../hooks/useEditCell';
import { useInsertRow, useDeleteRow, useDeleteManyRows, useAddColumn, useDeleteColumn } from '../../hooks/useDsOperations';
import useDatasetSocket from '../../hooks/useDatasetSocket';
import useRefreshJira from '../../hooks/useRefreshJira';

// Components
import MyTabulator from '../../components/MyTabulator';
import Notification from '../../components/Notification';
import ControlPanel from './components/ControlPanel.jsx';
import FilterControls from './components/FilterControls.jsx';
import Modal from './components/Modal.jsx';
import ModalEditor from './components/ModalEditor.jsx';
import DescriptionEditorModal from './components/DescriptionEditorModal.jsx';
import JiraForm from './components/jiraForm.jsx';
import AddColumnForm from './components/AddColumnForm';

// Editors
import * as DateEditorModule from '@tabulator/react-tabulator/lib/editors/DateEditor';
const DateEditor = DateEditorModule.default;
import MyInput from '../../components/editors/MyInput.jsx';
import MyTextArea from '../../components/editors/MyTextArea.jsx';
import MyCodeMirror from '../../components/editors/MyCodeMirror.jsx';
import MyAutoCompleter from '../../components/editors/MyAutoCompleter.jsx';
import MySingleAutoCompleter from '../../components/editors/MySingleAutoCompleter.jsx';
import ColorPicker from '../../components/editors/ColorPicker.jsx';

// Helpers
import createClipboardHelpers from './helpers/clipboardHelpers';
import createDomHelpers from './helpers/domHelpers';
import createTabulatorConfig from './helpers/tabulatorConfig';
import createJiraHelpers from './helpers/jiraHelpers.jsx';
import { applyFilterColumnAttrs } from './helpers/filterHelpers';
import { md } from './helpers/tabulatorConfig';

// Reducer
import { editReducer, initialEditState, EDIT_ACTION_TYPES } from './reducers/editReducer';

// Styles
//import './DsView.css';
import './DsViewSimple.css';
//import "reveal.js/dist/reveal.css";
//import './rjs_white.css';
//import '@tabulator/styles/tabulator-custom.css';
//import 'highlight.js/styles/base16/solarized-light.css'
import './solarized-light.css';
import './simpleStyles.css';

// Mermaid for diagram rendering
import mermaid from 'mermaid';

// API
const API_URL = import.meta.env.VITE_API_BASE || '';

function DsViewPage() {
  const { dsName, dsView, filter: filterParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth.userId;

  const DEBUG_URL_RESTORE = false;
  const urlRestoreLog = useCallback((...args) => {
    if (DEBUG_URL_RESTORE) console.log(...args);
  }, []);

  // Refs
  const tabulatorRef = useRef(null);
  const timersRef = useRef({});
  const cellImEditingRef = useRef(null);
  const reqCount = useRef(0);
  const fetchAllMatchingRecordsRef = useRef(false);
  
  // Store edit-related state in refs so cellEditCheck can access current values
  const singleClickEditRef = useRef(false);
  const disableEditingRef = useRef(false);
  const connectedStateRef = useRef(false);
  const dbConnectivityStateRef = useRef(false);
  const originalColumnAttrsRef = useRef(null);
  const mouseDownOnHtmlLinkRef = useRef(false);
  const mouseDownOnBadgeCopyIconRef = useRef(false);
  const scrollPositionBeforeLoadRef = useRef({ top: 0, left: 0 });

  // Fetch view configuration
  const { data: viewConfig, isLoading, isError, error } = useDsView(dsName, dsView, userId);

  // Mutations
  const editCellMutation = useEditCell(dsName, dsView, userId);
  const insertRowMutation = useInsertRow(dsName, dsView, userId);
  const deleteRowMutation = useDeleteRow(dsName, dsView, userId);
  const deleteManyRowsMutation = useDeleteManyRows(dsName, dsView, userId);
  const addColumnMutation = useAddColumn(dsName, dsView, userId);
  const deleteColumnMutation = useDeleteColumn(dsName, dsView, userId);
  const refreshJiraMutation = useRefreshJira(dsName, dsView, userId);

  // Edit state
  const [editState, dispatchEdit] = useReducer(editReducer, initialEditState);

  // UI State
  const [pageSize, setPageSize] = useState(30);
  const [filter, setFilter] = useState('');
  const [initialHeaderFilter, setInitialHeaderFilter] = useState([]);
  const [initialSort, setInitialSort] = useState([]);
  const [filterColumnAttrs, setFilterColumnAttrs] = useState({});
  const [showAllFilters, setShowAllFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('showAllFilters');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [frozenCol, setFrozenCol] = useState(null);
  const [chronologyDescending, setChronologyDescending] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0); // Counter to force table refresh
  const [fetchAllMatchingRecords, setFetchAllMatchingRecords] = useState(false);
  const [totalRecs, setTotalRecs] = useState(0);
  const [moreMatchingDocs, setMoreMatchingDocs] = useState(false);
  const [_id, set_id] = useState('');
  const [currentTheme, setCurrentTheme] = useState(() => {
    // Detect initial theme from localStorage
    return localStorage.getItem('theme') || 'light';
  });
  
  // Column resize tracking ref
  const columnResizedRecentlyRef = useRef(false);
  // Track last-processed search string so we don't re-apply same URL twice
  const lastProcessedSearchRef = useRef('');
  // Ref to store handleDeleteRow so handlers can call it without re-creating handlers
  const handleDeleteRowRef = useRef(null);
  
  // Initialize singleClickEdit from localStorage
  const [singleClickEdit, setSingleClickEdit] = useState(() => {
    try {
      const saved = localStorage.getItem('singleClickEdit');
      const value = saved ? JSON.parse(saved) : false;
      singleClickEditRef.current = value; // Sync ref
      return value;
    } catch {
      return false;
    }
  });
  const [disableEditing, setDisableEditing] = useState(() => {
    try {
      const saved = localStorage.getItem('disableEditing');
      const value = saved ? JSON.parse(saved) : false;
      disableEditingRef.current = value; // Sync ref
      return value;
    } catch {
      return false;
    }
  });
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalQuestion, setModalQuestion] = useState('');
  const [modalCallback, setModalCallback] = useState(null);
  const [modalOk, setModalOk] = useState('OK');
  const [modalCancel, setModalCancel] = useState('Cancel');
  const [showModalEditor, setShowModalEditor] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('success');
  const [notificationMessage, setNotificationMessage] = useState('');
  
  // Description editor state
  const queryClient = useQueryClient();
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [freshViewConfig, setFreshViewConfig] = useState(null);
  const [isLoadingFreshConfig, setIsLoadingFreshConfig] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  
  // Add column modal state
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [addColumnPosition, setAddColumnPosition] = useState('left');
  const [addColumnReferenceField, setAddColumnReferenceField] = useState('');
  const [addColumnError, setAddColumnError] = useState('');
  const [addColumnProcessing, setAddColumnProcessing] = useState(false);

  // Delete column modal state
  const [showDeleteColumnModal, setShowDeleteColumnModal] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState('');

  // Table attributes modal state
  const [showTableAttributesModal, setShowTableAttributesModal] = useState(false);
  const [tableAttrsFixedHeight, setTableAttrsFixedHeight] = useState(false);
  const [tableAttrsRowMaxHeightEnabled, setTableAttrsRowMaxHeightEnabled] = useState(false);
  const [tableAttrsRowMaxHeight, setTableAttrsRowMaxHeight] = useState(100);
  const [tableAttrsRowHeightEnabled, setTableAttrsRowHeightEnabled] = useState(false);
  const [tableAttrsRowHeight, setTableAttrsRowHeight] = useState(50);
  const [tableAttrsLoading, setTableAttrsLoading] = useState(false);
  const [tableAttrsSaving, setTableAttrsSaving] = useState(false);
  const [tableAttrsError, setTableAttrsError] = useState('');

  // Memoize user object to prevent socket reconnections
  const socketUser = useMemo(() => ({ user: userId }), [userId]);

  // Calculate table height based on fixedHeight setting
  // Reference: DsView.js lines 1872-1883, 1941
  const tableHeight = useMemo(() => {
    let fixedHeight = false;
    try {
      fixedHeight = viewConfig?.otherTableAttrs?.fixedHeight;
    } catch (e) {}
    
    if (fixedHeight) {
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      if (vh) {
        return `${vh - 50}px`;
      }
    }
    return undefined;
  }, [viewConfig]);

  // Handle cell unlock callback from socket (defined early to be used in socket hook)
  const handleCellUnlocked = useCallback((unlockedObj) => {
    // Additional processing after cell unlock
    if (tabulatorRef.current && !cellImEditingRef.current) {
      if (timersRef.current['post-cell-edited']) {
        clearTimeout(timersRef.current['post-cell-edited']);
      }
      timersRef.current['post-cell-edited'] = setTimeout(() => {
        if (!cellImEditingRef.current && tabulatorRef.current) {
          tabulatorRef.current.table.rowManager.adjustTableSize(false);
          // Call DOM helpers for rendering
          if (domHelpers.current) {
            domHelpers.current.normalizeAllImgRows();
            domHelpers.current.applyHighlightJsBadge();
            // Render plotly graphs after DOM layout & paint is ready
            // (Double requestAnimationFrame ensures cells are fully laid out before measuring)
            requestAnimationFrame(() => requestAnimationFrame(() => domHelpers.current.renderPlotlyInCells()));
          }
        }
      }, 500);
    }
  }, []);

  // Socket.io for real-time collaboration
  // Use empty string for socket to connect to same origin (Vite proxy handles WebSocket)
  const { 
    connectedState, 
    dbConnectivityState, 
    lockedCells, 
    emitLock, 
    emitUnlock,
    isCellLocked,
    requestActiveLocks
  } = useDatasetSocket(dsName, dsView, socketUser, tabulatorRef, {
    apiUrl: '', // Connect to same origin, Vite proxy will forward WebSocket
    onCellUnlocked: handleCellUnlocked,
  });

  useEffect(() => {
    document.title = dsName || 'Datagroom';
    return () => { document.title = 'Datagroom'; };
  }, [dsName]);

  // Sync socket state to refs so callbacks always have current values (fixes stale closure bug)
  useEffect(() => {
    connectedStateRef.current = connectedState;
    console.log('[SOCKET STATE] connectedState changed to:', connectedState);
  }, [connectedState]);
  
  useEffect(() => {
    dbConnectivityStateRef.current = dbConnectivityState;
    console.log('[DB STATE] dbConnectivityState changed to:', dbConnectivityState);
  }, [dbConnectivityState]);

  const clipboardHelpers = useRef(null);
  const domHelpers = useRef(null);

  // Initialize mermaid for diagram rendering
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      securityLevel: 'loose',
      theme: 'default',
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
      }
    });
  }, []);

  // Helper function to render Mermaid diagrams
  // Called after renderComplete to process all .mermaid divs
  const renderMermaidDiagrams = useCallback(() => {
    // Use a timeout to debounce multiple rapid calls
    if (timersRef.current['mermaid-render']) {
      clearTimeout(timersRef.current['mermaid-render']);
    }
    
    timersRef.current['mermaid-render'] = setTimeout(() => {
      try {
        mermaid.run({ querySelector: '.mermaid' }).catch(err => {
          console.error('[MERMAID] Rendering error (caught promise rejection):', err);
        });
      } catch (err) {
        console.error('[MERMAID] Rendering error:', err);
      }
    }, 100);
  }, []);

  // Listen for window resize events (e.g., opening debug console) and re-render Mermaid
  useEffect(() => {
    const handleResize = () => {
      // Re-render both Mermaid and Plotly on window resize
      if (domHelpers.current) {
        requestAnimationFrame(() => requestAnimationFrame(() => domHelpers.current.renderPlotlyInCells()));
      }
      renderMermaidDiagrams();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderMermaidDiagrams]);

  // Display connection status indicator (matches reference implementation style)
  const displayConnectedStatus = () => {
    if (connectedState) {
      if (dbConnectivityState) {
        return (
          <span>
            <i className='fas fa-server'></i>&nbsp;<b>Connection Status:&nbsp;</b>{' '}
            <b className="status-connected">Connected</b>&nbsp;|
          </span>
        );
      } else {
        return (
          <span>
            <i className='fas fa-server'></i>&nbsp;<b>Connection Status:&nbsp;</b>{' '}
            <b className="status-disconnected">Disconnected</b>{' '}
            <i>(Database connectivity is down)</i>&nbsp;|
          </span>
        );
      }
    } else {
      return (
        <span>
          <i className='fas fa-server'></i>&nbsp;<b>Connection Status:&nbsp;</b>{' '}
          <b className="status-disconnected">Disconnected</b>
          <i>(Server connectivity is down)</i>&nbsp;|
        </span>
      );
    }
  };
  const tabulatorConfigHelper = useRef(null);
  const jiraHelpers = useRef(null);
  const [columns, setColumns] = useState([]);
  // Prevent initial table mount until URL-derived filters/sorts/attrs are applied
  const [initialUrlProcessed, setInitialUrlProcessed] = useState(false);
  const lastGeneratedFilterAttrsRef = useRef('');
  // Track viewConfig.columnAttrs hash to detect when backend columns change (e.g., after filter save)
  const lastGeneratedViewConfigHashRef = useRef('');

  // Initialize chronologyDescending from localStorage on mount
  // Reference: DsView.js lines 138-143
  // Default to true if never set (matching reference implementation)
  useEffect(() => {
    const chronologyDescendingFromLocal = localStorage.getItem('chronologyDescending');
    if (chronologyDescendingFromLocal === 'false') {
      setChronologyDescending(false);
    } else {
      // Default to true if null/undefined or any other value
      setChronologyDescending(true);
    }
  }, []);

  // Initialize fetchAllMatchingRecords from localStorage (per dataset view)
  useEffect(() => {
    try {
      const key = `fetchAllMatchingRecords:${dsName}:${dsView}`;
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        setFetchAllMatchingRecords(parsed);
        fetchAllMatchingRecordsRef.current = parsed;
      }
    } catch (e) {
      console.error('Error restoring fetchAllMatchingRecords from localStorage', e);
    }
  }, [dsName, dsView]);

  // Keep refs in sync so functions passed once to Tabulator can read latest values
  useEffect(() => { fetchAllMatchingRecordsRef.current = fetchAllMatchingRecords; }, [fetchAllMatchingRecords]);
  const chronologyDescendingRef = useRef(chronologyDescending);
  useEffect(() => { chronologyDescendingRef.current = chronologyDescending; }, [chronologyDescending]);

  // Listen for theme changes to re-render table with new colors
  useEffect(() => {
    const handleThemeChange = () => {
      const newTheme = localStorage.getItem('theme') || 'light';
      if (newTheme !== currentTheme) {
        setCurrentTheme(newTheme);
      }
    };
    
    // Poll for theme changes (fallback if storage event doesn't fire)
    const interval = setInterval(handleThemeChange, 500);
    
    // Listen for storage events (works across tabs)
    window.addEventListener('storage', handleThemeChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, [currentTheme]);

  // Disable browser's automatic scroll restoration to prevent unwanted scrolling
  // This is especially important in maximized windows where content height changes trigger auto-scroll
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      const originalScrollRestoration = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      console.log('[SCROLL] Disabled browser scroll restoration');
      
      return () => {
        window.history.scrollRestoration = originalScrollRestoration;
        console.log('[SCROLL] Restored browser scroll restoration');
      };
    }
  }, []);

  // Force instant scroll behavior to prevent smooth scrolling that can cause jumps
  useEffect(() => {
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    console.log('[SCROLL] Set scroll behavior to auto');
    
    return () => {
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
      console.log('[SCROLL] Restored scroll behavior');
    };
  }, []);

  // Process URL parameters for chronologyDescending
  // Reference: DsView.js lines 343-345, 439
  // URL params override localStorage
  useEffect(() => {
    const chronologyDescendingParam = searchParams.get('chronologyDescending');
    if (chronologyDescendingParam !== null) {
      const value = chronologyDescendingParam.toLowerCase() === 'true';
      setChronologyDescending(value);
      localStorage.setItem('chronologyDescending', JSON.stringify(value));
    }
  }, [searchParams]);

  // Utility function to execute operations while preserving scroll position
  // Prevents unwanted scrolling during layout-affecting operations (filters, column changes, etc.)
  const executeWithScrollPreservation = useCallback((table, operation) => {
    if (!table || !table.rowManager?.element) {
      // If no table, just execute the operation
      if (operation) operation();
      return;
    }
    
    const rowManagerElement = table.rowManager.element;
    
    // Capture current scroll position
    const scrollTop = rowManagerElement.scrollTop;
    const scrollLeft = rowManagerElement.scrollLeft;
    
    // Temporarily disable smooth scrolling to prevent visual jumps
    const originalScrollBehavior = rowManagerElement.style.scrollBehavior;
    rowManagerElement.style.scrollBehavior = 'auto';
    
    // Execute the operation
    if (operation) operation();
    
    // Restore scroll position immediately (synchronous) to minimize visual jump
    rowManagerElement.scrollTop = scrollTop;
    rowManagerElement.scrollLeft = scrollLeft;
    
    // Double requestAnimationFrame ensures restoration happens after browser paint
    // This catches any cases where the operation causes additional layout changes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (rowManagerElement) {
          rowManagerElement.scrollTop = scrollTop;
          rowManagerElement.scrollLeft = scrollLeft;
          // Restore original scroll behavior
          rowManagerElement.style.scrollBehavior = originalScrollBehavior;
        }
      });
    });
  }, []);

  // Process filter change - handle filter selection from FilterControls
  // Reference: DsView.js lines 1996-2037
  const processFilterChange = useCallback((filterName) => {
    // Don't navigate if viewing single row
    if (searchParams.get('_id')) return;
    
    // Build URL with filter and navigate
    const newUrl = filterName ? `/ds/${dsName}/${dsView}/${filterName}` : `/ds/${dsName}/${dsView}`;
    navigate(newUrl, { replace: true });
    // State will be updated by the useEffect that watches filterParam
  }, [dsName, dsView, navigate, searchParams]);

  // Clicking the title should clear all filters (path and search params)
  const handleTitleClick = useCallback(() => {
    // Don't clear if viewing single row (preserves _id URL)
    if (searchParams.get('_id')) return;
    
    try {
      // Clear query string params
      setSearchParams({});
    } catch (e) {}

    // Navigate to base view path without any filter
    navigate(`/ds/${dsName}/${dsView}`, { replace: true });

    // Clear local filter state immediately so UI updates fast
    setFilter('');
    setInitialHeaderFilter([]);
    setInitialSort([]);
    setFilterColumnAttrs({});

    // Clear header filters and restore column attrs on the table shortly after
    setTimeout(() => {
      try {
        if (tabulatorRef.current?.table) {
          executeWithScrollPreservation(tabulatorRef.current.table, () => {
            const existing = tabulatorRef.current.table.getHeaderFilters() || [];
            for (let j = 0; j < existing.length; j++) {
              const f = existing[j];
              if (f && f.field && typeof tabulatorRef.current.table.setHeaderFilterValue === 'function') {
                tabulatorRef.current.table.setHeaderFilterValue(f.field, null);
              }
            }
            // Show all columns and restore widths
            applyFilterColumnAttrs(tabulatorRef.current, {}, columnResizedRecentlyRef.current, originalColumnAttrsRef.current, viewConfig);
            // Clear sorters
            try { if (typeof tabulatorRef.current.table.clearSort === 'function') tabulatorRef.current.table.clearSort(); } catch (e) {}
          });
        }
      } catch (e) {}
    }, 50);
  }, [dsName, dsView, navigate, setSearchParams, executeWithScrollPreservation]);
  
  // Handle Show Filters toggle - when turning off, navigate to default view
  const handleShowAllFiltersToggle = useCallback((checked) => {
    setShowAllFilters(checked);
    localStorage.setItem('showAllFilters', JSON.stringify(checked));
    
    // If turning OFF filters, navigate to default view (existing effects will handle cleanup)
    if (!checked) {
      // Don't clear if viewing single row (preserves _id URL)
      if (searchParams.get('_id')) return;
      
      // Navigate to base view - this will trigger effects that clear all filter state
      navigate(`/ds/${dsName}/${dsView}`, { replace: true });
    }
  }, [dsName, dsView, navigate, searchParams]);
  
  // Utility function to redraw table while preserving scroll position
  // Prevents unwanted scrolling when redrawing the table
  const redrawTableWithScrollPreservation = useCallback((table) => {
    if (!table || !table.rowManager?.element) return;
    
    const rowManagerElement = table.rowManager.element;
    
    // Capture current scroll position
    const scrollTop = rowManagerElement.scrollTop;
    const scrollLeft = rowManagerElement.scrollLeft;
    
    // Temporarily disable smooth scrolling to prevent visual jumps
    const originalScrollBehavior = rowManagerElement.style.scrollBehavior;
    rowManagerElement.style.scrollBehavior = 'auto';
    
    // Perform redraw
    table.redraw(true);
    
    // Restore scroll position immediately (synchronous) to minimize visual jump
    rowManagerElement.scrollTop = scrollTop;
    rowManagerElement.scrollLeft = scrollLeft;
    
    // Double requestAnimationFrame ensures restoration happens after browser paint
    // This catches any cases where the redraw causes additional layout changes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (rowManagerElement) {
          rowManagerElement.scrollTop = scrollTop;
          rowManagerElement.scrollLeft = scrollLeft;
          // Restore original scroll behavior
          rowManagerElement.style.scrollBehavior = originalScrollBehavior;
        }
      });
    });
  }, []);

  // Handle column resize to set the flag
  const handleColumnResized = useCallback((column) => {
    columnResizedRecentlyRef.current = true;
    // Clear flag after 1 second
    setTimeout(() => {
      columnResizedRecentlyRef.current = false;
    }, 1000);
    
    // Redraw table with new column widths while preserving scroll position
    const table = tabulatorRef.current?.table;
    if (table) {
      redrawTableWithScrollPreservation(table);
    }
  }, [redrawTableWithScrollPreservation]);

  // Process search params (query string) and restore ad-hoc filter state
  // This mirrors the reference's processFilterViaUrl and takes precedence
  useEffect(() => {
    if (!viewConfig) return;
    const searchString = searchParams.toString();
    urlRestoreLog('[URL RESTORE] processFilterViaUrl: searchString =', searchString);
    
    // If searchParams got cleared after being processed, log it but don't process again
    if (!searchString && lastProcessedSearchRef.current && lastProcessedSearchRef.current !== '') return;
    
    if (!searchString) return; // nothing to do
    if (lastProcessedSearchRef.current === searchString) {
      urlRestoreLog('[URL RESTORE] searchParams already processed, skipping');
      return; // already handled
    }

    const entries = Array.from(searchParams.entries());
    if (!entries.length) {
      lastProcessedSearchRef.current = searchString;
      return;
    }

    let hdrFilters = [];
    let hdrSorters = [];
    let colAttrs = {};
    let singleId = null;
    let pageSz = pageSize;
    let chronology = chronologyDescending;
    let fetchAll = fetchAllMatchingRecords;

    // Build column name list from viewConfig.
    // IMPORTANT: this app's Tabulator config is driven by `viewConfig.columnAttrs` (array).
    // Some backends also provide `viewConfig.columns` as an object keyed by numeric strings;
    // in that case Object.keys() returns ['1','2',...], which breaks URL field filter restore.
    const columnNames = (() => {
      try {
        if (!viewConfig) return [];

        // Preferred: columnAttrs array (matches tabulatorConfig.js)
        if (Array.isArray(viewConfig.columnAttrs)) {
          return viewConfig.columnAttrs
            .map((c) => {
              if (typeof c === 'string') return c;
              if (typeof c === 'object' && c !== null) return c.field || c.name || c.title;
              return null;
            })
            .filter(Boolean);
        }

        // Fallback: columns array
        if (Array.isArray(viewConfig.columns)) {
          return viewConfig.columns
            .map((c) => {
              if (typeof c === 'string') return c;
              if (typeof c === 'object' && c !== null) return c.field || c.name || c.title;
              return null;
            })
            .filter(Boolean);
        }

        // Fallback: columns object
        if (viewConfig.columns && typeof viewConfig.columns === 'object') {
          const vals = Object.values(viewConfig.columns);
          const extracted = vals
            .map((c) => {
              if (typeof c === 'string') return c;
              if (typeof c === 'object' && c !== null) return c.field || c.name || c.title;
              return null;
            })
            .filter(Boolean);
          if (extracted.length) return extracted;

          // Last resort: if it's actually keyed by field name, keys are OK.
          return Object.keys(viewConfig.columns);
        }
      } catch (e) {}
      return [];
    })();
    urlRestoreLog('[URL RESTORE] columnNames from viewConfig:', columnNames);

    for (const [k, v] of entries) {
      if (k === '_id') { singleId = v; break; }
      if (k === 'hdrSorters') { try { hdrSorters = JSON.parse(v); } catch (e) { console.error('hdrSorters parse error', e); } continue; }
      if (k === 'filterColumnAttrs') { try { colAttrs = JSON.parse(v); urlRestoreLog('[URL RESTORE] Parsed filterColumnAttrs from URL:', colAttrs); } catch (e) { console.error('filterColumnAttrs parse error', e); } continue; }
      if (k === 'fetchAllMatchingRecords') { fetchAll = String(v).toLowerCase() === 'true'; continue; }
      if (k === 'pageSize') { const p = parseInt(v); if (p > 0) pageSz = p; continue; }
      if (k === 'chronologyDescending') { chronology = String(v).toLowerCase() === 'true'; continue; }
      if (columnNames.includes(k)) { 
        urlRestoreLog('[URL RESTORE] Found field filter:', k, '=', v);
        hdrFilters.push({ field: k, value: v }); 
      } else {
        urlRestoreLog('[URL RESTORE] Skipping URL param (not a column):', k);
      }
    }

    if (singleId) {
      // single-row mode: clear header filters and hide filter UI
      setFilter('');
      setInitialHeaderFilter([]);
      setShowAllFilters(false);
      set_id(singleId);
      // Trigger table refresh after state update
      setTimeout(() => { try { tabulatorRef.current?.table?.setData(); } catch (e) {} }, 50);
    } else {
      set_id('');
      urlRestoreLog('[URL RESTORE] Setting state from URL:', { hdrFilters, hdrSorters, colAttrs, pageSz, chronology, fetchAll });
      urlRestoreLog('[URL RESTORE] hdrFilters.length =', hdrFilters.length, ', will set showAllFilters =', hdrFilters.length > 0);
      setInitialHeaderFilter(hdrFilters);
      setInitialSort(hdrSorters);
      setFilterColumnAttrs(colAttrs);
      // Only force filters ON when URL includes field filters.
      // Do not force filters OFF (that can hide FilterControls and inadvertently clear the URL).
      const shouldShowFilters = hdrFilters.length > 0;
      urlRestoreLog('[URL RESTORE] Calling setShowAllFilters with:', shouldShowFilters);
      if (shouldShowFilters) setShowAllFilters(true);
      setPageSize(pageSz);
      setChronologyDescending(chronology);
      setFetchAllMatchingRecords(fetchAll);
      fetchAllMatchingRecordsRef.current = fetchAll;

      // Apply column attrs and header filter values to Tabulator after state update
      setTimeout(() => {
        if (tabulatorRef.current?.table) {
          try {
            executeWithScrollPreservation(tabulatorRef.current.table, () => {
              const existing = tabulatorRef.current.table.getHeaderFilters() || [];
              for (let j = 0; j < existing.length; j++) {
                const f = existing[j];
                if (f && f.field && typeof tabulatorRef.current.table.setHeaderFilterValue === 'function') {
                  tabulatorRef.current.table.setHeaderFilterValue(f.field, null);
                }
              }

              applyFilterColumnAttrs(tabulatorRef.current, colAttrs, columnResizedRecentlyRef.current, originalColumnAttrsRef.current, viewConfig);

              if (Array.isArray(hdrFilters) && hdrFilters.length) {
                for (let i = 0; i < hdrFilters.length; i++) {
                  const hf = hdrFilters[i];
                  if (hf && hf.field && typeof tabulatorRef.current.table.setHeaderFilterValue === 'function') {
                    tabulatorRef.current.table.setHeaderFilterValue(hf.field, hf.value);
                  }
                }
              }

              if (Array.isArray(hdrSorters) && hdrSorters.length) {
                try {
                  tabulatorRef.current.table.setSort(hdrSorters);
                } catch (e) {
                  console.error('Error applying hdrSorters from URL', e);
                }
              } else {
                try {
                  if (typeof tabulatorRef.current.table.clearSort === 'function') {
                    tabulatorRef.current.table.clearSort();
                  }
                } catch (e) {}
              }
            });
          } catch (e) {
            console.error('Error applying URL filters/attrs', e);
          }
        }
      }, 50);
    }

    lastProcessedSearchRef.current = searchString;
    urlRestoreLog('[URL RESTORE] processFilterViaUrl complete, marked as processed');
  }, [searchParams, viewConfig, executeWithScrollPreservation]);

  // (removed premature marking here — we'll set `initialUrlProcessed` once columns are generated)

  // Process filter from URL - only when filterParam actually changes
  useEffect(() => {
    console.log('[FILTER-EFFECT] Running. filterParam:', filterParam, ', current filter state:', filter, ', viewConfig.filters:', Object.keys(viewConfig?.filters || {}));
    if (!viewConfig) {
      console.log('[FILTER-EFFECT] No viewConfig, returning');
      return;
    }
    // If viewing single row via _id param, don't process pathname filters
    if (searchParams.get('_id')) {
      console.log('[FILTER-EFFECT] Has _id in searchParams, returning');
      return;
    }
    // If a query string is present, it takes precedence over pathname-based saved filters
    if (searchParams.toString()) {
      console.log('[FILTER-EFFECT] Has searchParams, returning');
      return;
    }
    // If in single-row mode (_id state is set), don't process pathname filters
    if (_id) {
      console.log('[FILTER-EFFECT] Has _id state, returning');
      return;
    }
    
    // Update filter state based on URL parameter
    if (filterParam) {
      console.log('[FILTER-EFFECT] Processing filterParam:', filterParam);
      const filterData = viewConfig.filters?.[filterParam];
      console.log('[FILTER-EFFECT] Filter data for', filterParam, ':', filterData ? 'FOUND' : 'NOT FOUND');
      
      if (filterData) {
        // Sanitize and deep clone filter data
        try {
          // Sanitize hdrFilters to remove any circular references from Tabulator objects
          const rawHdrFilters = filterData.hdrFilters || [];
          const hdrFilters = Array.isArray(rawHdrFilters) 
            ? rawHdrFilters.map(hf => ({
                field: hf.field,
                value: hf.value,
                type: hf.type
              }))
            : [];
          
          // Sanitize hdrSorters to remove any circular references from Tabulator objects
          const rawHdrSorters = filterData.hdrSorters || [];
          const hdrSorters = Array.isArray(rawHdrSorters)
            ? rawHdrSorters.map(hs => ({
                column: typeof hs.column === 'string' ? hs.column : hs.field,
                dir: hs.dir
              }))
            : [];
          
          // Column attributes should be safe, but deep clone anyway
          const colAttrs = JSON.parse(JSON.stringify(filterData.filterColumnAttrs || {}));
          
          // Update state if filter name changed OR if filter data changed (e.g., after save)
          // Compare stringified attrs to detect backend updates after filter save
          const colAttrsStr = JSON.stringify(colAttrs);
          const currentColAttrsStr = JSON.stringify(filterColumnAttrs);
          const shouldUpdate = (filter !== filterParam) || (colAttrsStr !== currentColAttrsStr);
          
          if (shouldUpdate) {
            console.log('[FILTER] Applying filter from URL:', filterParam);
            setFilter(filterParam);
            setInitialHeaderFilter(hdrFilters);
            setInitialSort(hdrSorters);
            setFilterColumnAttrs(colAttrs);
            setShowAllFilters(true);
            
            // Apply filter column attributes after state update
            setTimeout(() => {
              if (tabulatorRef.current?.table) {
                try {
                  executeWithScrollPreservation(tabulatorRef.current.table, () => {
                    // Clear all existing header filters first so old regexes are removed
                    const existing = tabulatorRef.current.table.getHeaderFilters() || [];
                    for (let j = 0; j < existing.length; j++) {
                      const f = existing[j];
                      if (f && f.field && typeof tabulatorRef.current.table.setHeaderFilterValue === 'function') {
                        tabulatorRef.current.table.setHeaderFilterValue(f.field, null);
                      }
                    }

                    // Apply column visibility/width attrs (pass original attrs so widths can be restored when needed)
                    applyFilterColumnAttrs(tabulatorRef.current, colAttrs, columnResizedRecentlyRef.current, originalColumnAttrsRef.current, viewConfig);

                    // Now apply saved header filter values so Tabulator (and backend) perform filtering
                    if (Array.isArray(hdrFilters) && hdrFilters.length) {
                      for (let i = 0; i < hdrFilters.length; i++) {
                        const hf = hdrFilters[i];
                        if (hf && hf.field && typeof tabulatorRef.current.table.setHeaderFilterValue === 'function') {
                          tabulatorRef.current.table.setHeaderFilterValue(hf.field, hf.value);
                        }
                      }
                    }
                    // Apply saved sorters (hdrSorters) if present
                    if (Array.isArray(hdrSorters) && hdrSorters.length) {
                      try {
                        // Tabulator accepts sort entries like [{column: 'field', dir: 'asc'}]
                        tabulatorRef.current.table.setSort(hdrSorters);
                      } catch (e) {
                        console.error('Error applying saved sorters:', e);
                      }
                    } else {
                      // No saved sorters for this filter: clear any existing sort
                      try {
                        if (typeof tabulatorRef.current.table.clearSort === 'function') {
                          tabulatorRef.current.table.clearSort();
                        }
                      } catch (e) {
                        console.error('Error clearing sorters:', e);
                      }
                    }
                  });
                } catch (e) {
                  console.error('Error applying header filters or column attrs:', e);
                }
              }
            }, 100);
          }
        } catch (e) {
          console.error('Error parsing filter data:', e);
        }
      } else {
        // Filter name in URL but no data found in viewConfig yet
        // Don't set filter state - wait for viewConfig to update with the filter data
        // The useEffect will run again when viewConfig updates (it's in dependencies)
        console.log('[FILTER] Filter not found in viewConfig yet:', filterParam, '- waiting for data');
      }
    } else {
      // No filter in URL - clear everything
      setFilter('');
      setInitialHeaderFilter([]);
      setInitialSort([]);
      setFilterColumnAttrs({});
      // Clear header filters and restore column attrs
      setTimeout(() => {
        if (tabulatorRef.current?.table) {
          try {
            executeWithScrollPreservation(tabulatorRef.current.table, () => {
              const existing = tabulatorRef.current.table.getHeaderFilters() || [];
              for (let j = 0; j < existing.length; j++) {
                const f = existing[j];
                if (f && f.field && typeof tabulatorRef.current.table.setHeaderFilterValue === 'function') {
                  tabulatorRef.current.table.setHeaderFilterValue(f.field, null);
                }
              }
              // Apply empty attrs to show all columns and restore original widths
              applyFilterColumnAttrs(tabulatorRef.current, {}, columnResizedRecentlyRef.current, originalColumnAttrsRef.current, viewConfig);
              // Clear sorters when filter cleared
              try {
                if (typeof tabulatorRef.current.table.clearSort === 'function') {
                  tabulatorRef.current.table.clearSort();
                }
              } catch (e) {
                console.error('Error clearing sorters on filter clear:', e);
              }
            });
          } catch (e) {
            console.error('Error clearing header filters:', e);
          }
        }
      }, 100);
    }
  }, [filterParam, viewConfig, searchParams, _id, executeWithScrollPreservation]); // Respect viewConfig, searchParams, and _id for reload handling

  // If there is no URL pathname filter and no query string, we'll allow mount once columns are ready

  // Ajax helper functions (from reference implementation)
  const generateParamsList = useCallback((data, prefix = "") => {
    let output = [];
    
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        output = output.concat(generateParamsList(item, prefix ? prefix + "[" + i + "]" : i));
      });
    } else if (typeof data === "object" && data !== null) {
      for (let key in data) {
        output = output.concat(generateParamsList(data[key], prefix ? prefix + "[" + key + "]" : key));
      }
    } else {
      output.push({ key: prefix, value: data });
    }
    
    return output;
  }, []);

  const serializeParams = useCallback((params) => {
    const output = generateParamsList(params);
    const encoded = [];
    
    output.forEach((item) => {
      encoded.push(encodeURIComponent(item.key) + "=" + encodeURIComponent(item.value));
    });
    
    return encoded.join("&");
  }, [generateParamsList]);

  const ajaxURLGenerator = useCallback((url, config, params) => {
    try {
      if (!url) return url;
      if (!params || typeof params !== 'object') params = {};
      // Always attach our special params so server can return totals and reqCount
      params.fetchAllMatchingRecords = fetchAllMatchingRecordsRef.current;
      params.chronology = chronologyDescendingRef.current ? 'desc' : 'asc';
      params.reqCount = ++(reqCount.current);

      // Always append our params as query string so server can report totals
      if (!config) config = {};
      const qs = serializeParams(params);
      url += (url.includes('?') ? '&' : '?') + qs;
    } catch (e) {
      console.error('ajaxURLGenerator error', e);
    }
    return url;
  }, [serializeParams]);

  const ajaxResponse = useCallback((url, params, response) => {
    try {
      // ajax response received; process below
      if (response == null) return response;
      const respReqCount = response.reqCount;
      // Optionally inspect response keys during debugging
      try { /* inspect response keys if needed */ } catch (e) {}
      const respReqCountNum = respReqCount == null ? undefined : Number(respReqCount);

      if (respReqCount == null || respReqCountNum === reqCount.current || respReqCountNum === 0) {
        // Try common field names for totals in case server uses a different key
        const totals = response.total ?? response.count ?? response.totalCount ?? response.totals ?? 0;
        const more = response.moreMatchingDocs ?? response.more ?? false;
        setTotalRecs(totals || 0);
        setMoreMatchingDocs(more || false);
      } else {
        // ignored stale response
      }
    } catch (e) {
      console.error('ajaxResponse handler error', e);
    }
    return response;
  }, []);

  // Restore fetchAllMatchingRecords from URL search params on load
  useEffect(() => {
    try {
      const val = searchParams.get('fetchAllMatchingRecords');
      if (val !== null) {
        const parsed = String(val).toLowerCase() === 'true';
        setFetchAllMatchingRecords(parsed);
        // Trigger table refresh so Tabulator uses new param
        setTimeout(() => { try { tabulatorRef.current?.table?.setData(); } catch (e) {} }, 50);
      }
    } catch (e) {
      console.error('Error restoring fetchAllMatchingRecords from URL', e);
    }
  }, [searchParams]);

  // Generate a view URL capturing current header filters, sorters, column attrs and options
  const urlGeneratorFunctionForView = useCallback((e, cell) => {
    try {
      // If viewing a single row, generate row URL instead
      if (_id) {
        // Generate row URL with canonical base path
        const basePath = `/ds/${dsName}/${dsView}`;
        let finalUrl = window.location.origin + basePath;
        if (_id) finalUrl += '?' + `_id=${encodeURIComponent(_id)}`;

        console.log('Url copied for row:', finalUrl);
        clipboardHelpers.current.copyTextToClipboard(finalUrl);
        return;
      }
      
      const table = tabulatorRef.current?.table;
      if (!table) return;

      const currentHeaderFilters = table.getHeaderFilters() || [];
      const queryParamsObject = {};

      for (const hf of currentHeaderFilters) {
        if (hf && hf.field && hf.value != null && hf.value !== '' && hf.type === 'like') {
          queryParamsObject[hf.field] = hf.value;
        }
      }

      // Sorters
      const hdrSortersTmp = table.getSorters() || [];
      const hdrSorters = hdrSortersTmp.map(s => ({ column: s.field, dir: s.dir }));
      if (hdrSorters.length) queryParamsObject['hdrSorters'] = JSON.stringify(hdrSorters);

      // Column attrs (visibility / width)
      const cols = table.getColumns() || [];
      const filterColumnAttrsObj = {};
      for (let i = 0; i < cols.length; i++) {
        const field = cols[i].getField();
        const attrsForField = {};
        if (!cols[i].isVisible()) attrsForField.hidden = true;
        attrsForField.width = cols[i].getWidth();
        filterColumnAttrsObj[field] = attrsForField;
      }
      queryParamsObject['filterColumnAttrs'] = JSON.stringify(filterColumnAttrsObj);

      // fetchAllMatchingRecords, pageSize, chronology
      queryParamsObject['fetchAllMatchingRecords'] = fetchAllMatchingRecords ? true : false;
      queryParamsObject['pageSize'] = table.getPageSize ? (table.getPageSize() || pageSize) : pageSize;
      queryParamsObject['chronologyDescending'] = chronologyDescending ? true : false;

      const queryParams = new URLSearchParams(Object.entries(queryParamsObject));
      // Use canonical base path (without any pathname-based filter)
      const basePath = `/ds/${dsName}/${dsView}`;
      let finalUrl = window.location.origin + basePath;
      if (queryParams.toString()) finalUrl += '?' + queryParams.toString();

      console.log('Url copied for view:', finalUrl);
      clipboardHelpers.current.copyTextToClipboard(finalUrl);
    } catch (e) {
      console.error('urlGeneratorFunctionForView error', e);
    }
  }, [_id, dsName, dsView, fetchAllMatchingRecords, pageSize, chronologyDescending]);

  // Wrapper to support both row and view URL generation (used by context menu)
  const urlGeneratorFunction = useCallback((e, cell, forView) => {
    try {
      if (forView) {
        urlGeneratorFunctionForView(e, cell);
        return;
      }

      // Determine _id from the provided cell
      let _id = null;
      try {
        if (cell && typeof cell.getRow === 'function') {
          _id = cell.getRow().getData()?._id;
        }
      } catch (err) {
        _id = null;
      }

      // Use canonical base view path (do not include any pathname-based filter)
      const basePath = `/ds/${dsName}/${dsView}`;
      let finalUrl = window.location.origin + basePath;
      if (_id) finalUrl += '?' + `_id=${encodeURIComponent(_id)}`;

      console.log('Url copied for row:', finalUrl);
      clipboardHelpers.current.copyTextToClipboard(finalUrl);
    } catch (e) {
      console.error('urlGeneratorFunction error', e);
    }
  }, [urlGeneratorFunctionForView, dsName, dsView]);

  // Delete all rows matching current header filters - preview (pretend) and confirm
  const deleteAllRowsInQuery = useCallback(async () => {
    try {
      const table = tabulatorRef.current?.table;
      if (!table) {
        setNotificationType('error');
        setNotificationMessage('Table not initialized');
        setShowNotification(true);
        return;
      }

      const filters = table.getHeaderFilters ? (table.getHeaderFilters() || []) : [];
      const baseUrl = `${API_URL}/ds/deleteFromQuery/${dsName}/${dsView}/${userId}`;
      const previewUrl = ajaxURLGenerator(baseUrl, {}, { filters, pretend: true });

      // Preview POST
      let previewJson = null;
      try {
        const resp = await fetch(previewUrl, { method: 'post', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
        if (!resp.ok) throw new Error('Preview failed');
        previewJson = await resp.json();
      } catch (err) {
        console.error('deleteAllRowsInQuery preview error', err);
        setNotificationType('error');
        setNotificationMessage('Preview failed');
        setShowNotification(true);
        return;
      }

      const total = previewJson?.total ?? 0;
      const more = previewJson?.moreMatchingDocs ?? false;

      const question = `This will delete ${total} rows${more ? ' (and more matches on server)' : ''}. Please confirm.`;
      setModalTitle('Delete all rows in query?');
      setModalQuestion(question);
      setModalOk('Delete');
      setModalCancel('Cancel');

      // Set callback for confirm button
      setModalCallback(() => async () => {
        try {
          const deleteUrl = ajaxURLGenerator(baseUrl, {}, { filters, pretend: false });
          const resp = await fetch(deleteUrl, { method: 'post', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
          if (!resp.ok) throw new Error('Delete failed');
          const result = await resp.json();

          setNotificationType('success');
          setNotificationMessage('Delete completed');
          setShowNotification(true);
          setShowModal(false);
          // Clear table data locally instead of refreshing from server
          // This shows empty table confirming deletion while preserving filters
          try { 
            if (tabulatorRef.current?.table?.clearData) {
              tabulatorRef.current.table.clearData();
            }
          } catch (e) { console.error(e); }
        } catch (err) {
          console.error('deleteAllRowsInQuery error', err);
          setNotificationType('error');
          setNotificationMessage('Delete failed');
          setShowNotification(true);
          setShowModal(false);
        }
      });

      setShowModal(true);
    } catch (e) {
      console.error('deleteAllRowsInQuery outer error', e);
    }
  }, [tabulatorRef, API_URL, dsName, dsView, userId, ajaxURLGenerator]);

  // Delete all rows in view (visible rows in the table)
  const deleteAllRowsInView = useCallback(() => {
    try {
      const table = tabulatorRef.current?.table;
      if (!table) {
        setNotificationType('error');
        setNotificationMessage('Table not initialized');
        setShowNotification(true);
        return;
      }

      // Get all rows from table
      const rows = table.getRows() || [];
      const objects = [];
      
      // Collect _id from each row
      for (let i = 0; i < rows.length; i++) {
        const _id = rows[i].getData()?._id;
        if (_id) {
          objects.push(_id);
        }
      }

      if (objects.length === 0) {
        setNotificationType('info');
        setNotificationMessage('No rows to delete');
        setShowNotification(true);
        return;
      }

      // Show confirmation modal
      setModalTitle('Delete all rows in view?');
      setModalQuestion(`This will delete ${rows.length} rows. Please confirm. Undoing support is not yet available!`);
      setModalOk('Delete');
      setModalCancel('Cancel');
      
      // Set callback for confirm button
      setModalCallback(() => () => {
        deleteManyRowsMutation.mutate(
          {
            dsName,
            dsView,
            dsUser: userId,
            objects,
          },
          {
            onSuccess: () => {
              setNotificationType('success');
              setNotificationMessage(`Successfully deleted ${objects.length} rows`);
              setShowNotification(true);
              setShowModal(false);
              // Clear table data locally instead of refreshing from server
              // This shows empty table confirming deletion while preserving filters
              try { 
                if (tabulatorRef.current?.table?.clearData) {
                  tabulatorRef.current.table.clearData();
                }
              } catch (e) { console.error(e); }
            },
            onError: (error) => {
              setNotificationType('error');
              setNotificationMessage(`Failed to delete rows: ${error.message}`);
              setShowNotification(true);
              setShowModal(false);
            },
          }
        );
      });

      setShowModal(true);
    } catch (e) {
      console.error('deleteAllRowsInView error', e);
      setNotificationType('error');
      setNotificationMessage('Failed to delete rows');
      setShowNotification(true);
    }
  }, [dsName, dsView, userId, deleteManyRowsMutation]);

  // Refresh Jira handler - refreshes JIRA data for current view
  // Reference: DsView.js lines 1625-1642
  const handleRefreshJira = useCallback(() => {
    const table = tabulatorRef.current?.table;
    if (!table) return;

    // Capture current header filters (matching reference implementation)
    let initialHeaderFilter = table.getHeaderFilters();
    
    // Call refresh mutation
    refreshJiraMutation.mutate(
      {
        dsName,
        dsView,
        dsUser: userId,
      },
      {
        onSuccess: (result) => {
          console.log('JIRA refresh successful:', result);
          
          setNotificationType('success');
          setNotificationMessage('JIRA refresh successful');
          setShowNotification(true);
          
          // Refresh table data (Tabulator preserves filter state automatically)
          try { 
            tabulatorRef.current?.table?.setData(); 
          } catch (e) { 
            console.error('Error refreshing table after JIRA refresh:', e); 
          }
        },
        onError: (error) => {
          console.error('refreshJira API error:', error);
          
          setNotificationType('error');
          setNotificationMessage('JIRA refresh failed');
          setShowNotification(true);
        },
      }
    );
  }, [dsName, dsView, userId, refreshJiraMutation]);

  // Handle opening the description editor with fresh config
  const handleOpenDescriptionEditor = useCallback(async () => {
    setIsEditingDescription(true);
    setIsLoadingFreshConfig(true);
    
    try {
      // Fetch fresh view config to ensure we have latest backend state
      const freshConfig = await fetchViewColumns(dsName, dsView, userId);
      setFreshViewConfig(freshConfig);
      setIsLoadingFreshConfig(false);
    } catch (error) {
      console.error('Error fetching fresh config:', error);
      setNotificationType('error');
      setNotificationMessage('Failed to load latest configuration');
      setShowNotification(true);
      setIsEditingDescription(false);
      setIsLoadingFreshConfig(false);
    }
  }, [dsName, dsView, userId]);

  // Handle saving the edited description
  const handleSaveDescription = useCallback(async (editedDescription) => {
    setIsSavingDescription(true);
    
    try {
      // Validate that we have proper column data before sending
      if (!freshViewConfig || !freshViewConfig.columnAttrs || freshViewConfig.columnAttrs.length === 0) {
        console.error('Critical: Cannot save - column attributes missing or empty!');
        setIsSavingDescription(false);
        setNotificationType('error');
        setNotificationMessage('Cannot save - missing column configuration. Please refresh and try again.');
        setShowNotification(true);
        return;
      }

      // Construct payload with all settings, only description changed
      // CRITICAL: API returns 'columnAttrs' but expects 'viewDefs' in the request
      const payload = {
        dsName,
        dsView,
        dsUser: userId,
        viewDefs: freshViewConfig.columnAttrs,  // Use columnAttrs from API response
        jiraConfig: freshViewConfig.jiraConfig || null,
        jiraAgileConfig: freshViewConfig.jiraAgileConfig || null,
        dsDescription: { dsDescription: editedDescription },
        otherTableAttrs: freshViewConfig.otherTableAttrs || {},
        aclConfig: freshViewConfig.aclConfig || null,
        jiraProjectName: freshViewConfig.jiraProjectName || '',
        perRowAccessConfig: freshViewConfig.perRowAccessConfig || {},
      };

      console.log('Saving description with payload:', {
        ...payload,
        viewDefs: `[Array of ${payload.viewDefs.length} columns]`,
      });

      const [success, result] = await setViewDefinitions(payload);
      
      if (success) {
        // Close modal and clear fresh config
        setIsEditingDescription(false);
        setFreshViewConfig(null);
        setIsSavingDescription(false);
        
        // Invalidate React Query cache to refetch the updated data
        queryClient.invalidateQueries({ queryKey: ['dsView', dsName, dsView, userId] });
        
        // Show success notification
        setNotificationType('success');
        setNotificationMessage('Description updated successfully');
        setShowNotification(true);
      } else {
        setIsSavingDescription(false);
        setNotificationType('error');
        setNotificationMessage(result?.message || 'Failed to update description');
        setShowNotification(true);
      }
    } catch (error) {
      console.error('Error saving description:', error);
      setIsSavingDescription(false);
      setNotificationType('error');
      setNotificationMessage('Failed to update description');
      setShowNotification(true);
    }
  }, [dsName, dsView, userId, freshViewConfig, queryClient]);

  // Handle canceling the description editor
  const handleCancelDescriptionEditor = useCallback(() => {
    setIsEditingDescription(false);
    setFreshViewConfig(null);
    setIsLoadingFreshConfig(false);
  }, []);

  // Check for concurrent edit conflicts - prevents editing cells locked by other users
  // Reference: DsView.js lines 567-577 (cellEditCheckForConflicts)
  const cellEditCheckForConflicts = useCallback((cell) => {
    console.log('[cellEditCheckForConflicts] Checking cell', {
      mouseDownOnHtmlLink: mouseDownOnHtmlLinkRef.current,
      mouseDownOnBadgeCopyIcon: mouseDownOnBadgeCopyIconRef.current,
    });
    
    try {
      const _id = cell.getRow().getData()._id;
      const field = cell.getField();
      console.log('[cellEditCheckForConflicts] Cell info:', { _id, field });
      
      // Check if cell is locked by another user
      if (isCellLocked(_id, field)) {
        console.log('[cellEditCheckForConflicts] ❌ Cell is locked by another user');
        // CRITICAL FIX: Blur the cell element to prevent it from retaining focus
        // This ensures that when the cell is unlocked later, it won't automatically
        // enter edit mode due to having focus
        try {
          const cellElement = cell.getElement();
          if (cellElement && document.activeElement === cellElement) {
            cellElement.blur();
            console.log('[cellEditCheckForConflicts] 🔓 Blurred locked cell to prevent auto-edit on unlock');
          }
        } catch (blurError) {
          console.warn('[cellEditCheckForConflicts] Could not blur cell:', blurError);
        }
        return false; // Block editing - cell is locked
      }
    } catch (e) {
      console.log('[cellEditCheckForConflicts] ⚠️ Could not get cell info (might be new row):', e.message);
      // Cell might not have _id or field yet (e.g., new row)
    }
    // Don't allow editing when clicking HTML links or badge copy icons
    if (mouseDownOnHtmlLinkRef.current || mouseDownOnBadgeCopyIconRef.current) {
      console.log('[cellEditCheckForConflicts] ❌ Blocked: clicked on HTML link or badge copy icon');
      return false;
    }
    console.log('[cellEditCheckForConflicts] ✅ No conflicts detected');
    return true;
  }, [isCellLocked]);

  // Cell edit check - controls single-click editing based on checkbox state
  // Reference: DsView.js lines 1014-1020
  // Uses refs to always check current state, not captured closure values
  const cellEditCheck = useCallback((cell) => {
    console.log('[cellEditCheck] Called', {
      singleClickEdit: singleClickEditRef.current,
      disableEditing: disableEditingRef.current,
      connectedState: connectedStateRef.current,
      dbConnectivityState: dbConnectivityStateRef.current,
      cellField: cell?.getField?.(),
      cellValue: cell?.getValue?.(),
    });
    
    if (!singleClickEditRef.current) {
      console.log('[cellEditCheck] ❌ Blocked: singleClickEdit is OFF');
      return false;  // Checkbox unchecked = no single-click edit
    }
    if (disableEditingRef.current) {
      console.log('[cellEditCheck] ❌ Blocked: editing is disabled');
      return false;
    }
    if (!connectedStateRef.current) {
      console.log('[cellEditCheck] ❌ Blocked: not connected to socket');
      return false;      // Not connected to socket
    }
    if (!dbConnectivityStateRef.current) {
      console.log('[cellEditCheck] ❌ Blocked: no DB connectivity');
      return false; // No DB connectivity
    }
    // Check for concurrent edit conflicts (locked cells)
    const canEdit = cellEditCheckForConflicts(cell);
    console.log('[cellEditCheck] cellEditCheckForConflicts returned:', canEdit);
    return canEdit;
  }, [cellEditCheckForConflicts]);

  // Cell force edit trigger - called when user clicks/focuses a cell
  // This should check if editing is allowed and then force the edit
  // Reference: DsView.js lines 588-617
  const cellForceEditTrigger = useCallback((cell, e) => {
    console.log('[cellForceEditTrigger] 🎯 Called', {
      singleClickEdit: singleClickEditRef.current,
      disableEditing: disableEditingRef.current,
      connectedState: connectedStateRef.current,
      dbConnectivityState: dbConnectivityStateRef.current,
      cellField: cell?.getField?.(),
      cellValue: cell?.getValue?.(),
      isCurrentlyEditing: cellImEditingRef.current === cell,
      event: e?.type,
    });
    
    // Check all conditions using same logic as cellEditCheck
    if (!singleClickEditRef.current) {
      console.log('[cellForceEditTrigger] ❌ Aborted: singleClickEdit is OFF');
      return;  // Checkbox unchecked = no single-click edit
    }
    if (disableEditingRef.current) {
      console.log('[cellForceEditTrigger] ❌ Aborted: editing is disabled');
      return;
    }
    if (!connectedStateRef.current) {
      console.log('[cellForceEditTrigger] ❌ Aborted: not connected to socket');
      return;      // Not connected to socket
    }
    if (!dbConnectivityStateRef.current) {
      console.log('[cellForceEditTrigger] ❌ Aborted: no DB connectivity');
      return; // No DB connectivity
    }
    if (cellImEditingRef.current === cell) {
      console.log('[cellForceEditTrigger] ❌ Aborted: this cell is already being edited');
      return;
    }
    // Check for concurrent edit conflicts (locked cells)
    const noConcurrentEdits = cellEditCheckForConflicts(cell);
    console.log('[cellForceEditTrigger] cellEditCheckForConflicts returned:', noConcurrentEdits);
    if (noConcurrentEdits) {
      console.log('[cellForceEditTrigger] ✅ Forcing edit with cell.edit(true)');
      // Force the edit by calling cell.edit(true)
      try {
        cell.edit(true, e);
        console.log('[cellForceEditTrigger] ✅ cell.edit(true) called successfully');
      } catch (error) {
        console.error('[cellForceEditTrigger] ❌ Error calling cell.edit():', error);
      }
    } else {
      console.log('[cellForceEditTrigger] ❌ Aborted: concurrent edit conflict detected');
    }
  }, [cellEditCheckForConflicts]);
559-566
  const cellClickEvents = useCallback((e, cell) => {
    if (!connectedStateRef.current || !dbConnectivityStateRef.current) return;

    // Double-click editing when single-click edit is OFF
    if (e.type === 'dblclick' && !singleClickEditRef.current && !disableEditingRef.current) {
      if (cellImEditingRef.current === cell) return;
      // Check for concurrent edit conflicts before allowing double-click edit
      if (cellEditCheckForConflicts(cell)) {
        // Force edit on double-click bypassing cellEditCheck
        cell.edit(true, e);
      }
    }
  }, [cellEditCheckForConflicts]);

  // Handler for checkbox change
  const handleSingleClickEditToggle = useCallback((event) => {
    const checked = event.target.checked;
    singleClickEditRef.current = checked; // Sync ref
    setSingleClickEdit(checked);
    localStorage.setItem('singleClickEdit', JSON.stringify(checked));
  }, []);

  const toggleEditing = useCallback((shouldDisable) => {
    // Dynamically toggle column editors based on shouldDisable parameter
    // Reference: DsView.js lines 726-755
    if (tabulatorRef.current?.table && originalColumnAttrsRef.current) {
      const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
      
      // Modify column definitions in place
      for (let j = 0; j < currentDefs.length; j++) {
        const originalCol = originalColumnAttrsRef.current[j];
        
        if (shouldDisable) {
          // Disabling: Set all editors to false
          currentDefs[j].editor = false;
        } else {
          // Enabling: Restore original editor from viewConfig
          if (originalCol && originalCol.editor) {
            let restoredEditor = originalCol.editor;
            
            // Map string editor names to function references
            if (restoredEditor === 'textarea') {
              restoredEditor = MyTextArea;
            } else if (restoredEditor === 'codemirror') {
              restoredEditor = MyCodeMirror;
            } else if (restoredEditor === 'date') {
              restoredEditor = DateEditor;
            } else if (restoredEditor === 'autocomplete') {
              // Check for multiselect in editorParams
              if (originalCol.editorParams?.multiselect) {
                restoredEditor = MyAutoCompleter;
              } else {
                restoredEditor = MySingleAutoCompleter;
              }
            }
            
            currentDefs[j].editor = restoredEditor;
          }
        }
      }
      
      // Directly update Tabulator columns without triggering React re-render
      // This avoids backend calls that would happen with setColumns(updatedDefs)
      tabulatorRef.current.table.setColumns(currentDefs);
    }
  }, []);

  const toggleFetchAllRecords = useCallback(() => {
    setFetchAllMatchingRecords(prev => {
      const next = !prev;
      try {
        // Persist choice in localStorage per dataset/view
        const key = `fetchAllMatchingRecords:${dsName}:${dsView}`;
        localStorage.setItem(key, JSON.stringify(next));
      } catch (e) {}

      // Force tabulator to reload from page 1 with new params
      setTimeout(() => {
        try {
          if (tabulatorRef.current?.table) {
            if (typeof tabulatorRef.current.table.setPage === 'function')
              tabulatorRef.current.table.setPage(1);
            tabulatorRef.current.table.setData();
          }
        } catch (e) { console.error('toggleFetchAllRecords refresh error', e); }
      }, 20);

      return next;
    });
  }, []);

  // Render complete handler - called when table finishes rendering
  // Reference: DsView.js lines 432-444
  const handleRenderComplete = useCallback(() => {
    // Request active locks from server
    if (dsName && emitLock) {
      // Note: In reference implementation, socket.emit('getActiveLocks', dsName) is called
      // This functionality is handled by the useDatasetSocket hook on mount
    }

    // Enforce backend column visibility (visible: false) when no filters are active
    // This runs after table renders to ensure Tabulator has initialized columns
    try {
      const table = tabulatorRef.current?.table;
      if (table && viewConfig?.columnAttrs) {
        // Only enforce when NO filter is active (filters manage their own visibility)
        const hasFilters = (filterColumnAttrs && Object.keys(filterColumnAttrs).length > 0) || filter || searchParams.toString();
        
        if (!hasFilters) {
          const cols = table.getColumns();
          for (let i = 0; i < viewConfig.columnAttrs.length; i++) {
            const backendCol = viewConfig.columnAttrs[i];
            if (backendCol.visible === false) {
              // Find matching column and hide it
              for (let j = 0; j < cols.length; j++) {
                if (cols[j].getField() === backendCol.field && cols[j].isVisible()) {
                  console.log('[VISIBILITY] Hiding column in renderComplete:', backendCol.field);
                  cols[j].hide();
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[VISIBILITY] Error enforcing column visibility in renderComplete:', e);
    }

    // Normalize image rows for proper rendering
    if (domHelpers.current) {
      domHelpers.current.normalizeAllImgRows();
      domHelpers.current.applyHighlightJsBadge();
      // Render plotly graphs after DOM layout & paint is ready
      // (Double requestAnimationFrame ensures cells are fully laid out before measuring)
      requestAnimationFrame(() => requestAnimationFrame(() => domHelpers.current.renderPlotlyInCells()));
    }
    
    // Re-run mermaid to render any mermaid diagrams in the table
    // Use double requestAnimationFrame to ensure DOM is fully updated
    requestAnimationFrame(() => requestAnimationFrame(() => renderMermaidDiagrams()));
  }, [dsName, emitLock, viewConfig, filterColumnAttrs, filter, searchParams]);

  // Page loaded handler - called when pagination changes
  const handlePageLoaded = useCallback((pageno) => {
    // Preserve page size when page changes
    const table = tabulatorRef.current;
    if (table && table.getPageSize) {
      const currentSize = table.getPageSize();
      if (currentSize !== pageSize) {
        setPageSize(currentSize);
      }
    }
    // Apply full processing including badges and images for new page
    handleRenderComplete();
    // Additionally apply badges again after a longer delay to catch any late-rendered elements
    setTimeout(() => {
      if (domHelpers.current) {
        domHelpers.current.applyHighlightJsBadge();
      }
    }, 1500);
  }, [pageSize, handleRenderComplete]);

  // Page size changed handler - called when user changes page size via selector
  const handlePaginationPageSizeChanged = useCallback((newSize) => {
    setPageSize(newSize);
  }, []);

  // Cell editing handler - called when editing actually starts
  // Reference: DsView.js lines 656-671
  // Note: cellEditCheck/cellClickEvents already prevented locked cells from being edited
  // This is called after Tabulator opens the editor
  const handleCellEditing = useCallback((cell) => {
    console.log('[handleCellEditing] 🎉 Editor opened! Cell entered editing mode', {
      cellField: cell?.getField?.(),
      cellValue: cell?.getValue?.(),
    });
    
    const _id = cell.getRow().getData()._id;
    const field = cell.getField();

    // Skip locking for new rows (no _id yet)
    if (!_id) {
      console.log('[handleCellEditing] New row (no _id), allowing edit without lock');
      cellImEditingRef.current = cell;
      return true; // Allow edit
    }

    // Double-check lock status as safety measure (race condition protection)
    // Normally prevented earlier by cellEditCheck/cellClickEvents
    if (isCellLocked(_id, field)) {
      console.log('[handleCellEditing] ❌ Cell is locked, canceling edit');
      return false; // Cancel edit
    }

    console.log('[handleCellEditing] ✅ Emitting lock and allowing edit', { _id, field });
    // Emit lock event to notify other users
    emitLock({ dsName, _id, field, user: auth.userId || userId });
    cellImEditingRef.current = cell;

    return true; // Allow edit
  }, [dsName, isCellLocked, emitLock, auth.userId, userId]);

  // Cell edit cancelled handler
  const handleCellEditCancelled = useCallback((cell) => {
    const _id = cell.getRow().getData()._id;
    const field = cell.getField();
    const oldVal = cell.getOldValue();

    // Skip unlocking for new rows (no _id yet)
    if (_id) {
      // Emit unlock when edit is cancelled (e.g., Escape key)
      emitUnlock({ dsName, _id, field, newVal: oldVal, user: auth.userId || userId });
    }
    cellImEditingRef.current = null;
    
    // Reference: DsView.js lines 641-649
    // Adjust table size and normalize images after edit cancellation
    if (timersRef.current['post-cell-edited']) {
      clearTimeout(timersRef.current['post-cell-edited']);
    }
    timersRef.current['post-cell-edited'] = setTimeout(() => {
      if (!cellImEditingRef.current && tabulatorRef.current?.table) {
        console.log('Adjusting table size (cellEditCancelled)...');
        tabulatorRef.current.table.rowManager.adjustTableSize(false);
        if (domHelpers.current) {
          domHelpers.current.normalizeAllImgRows();
          domHelpers.current.applyHighlightJsBadge();
          // Render plotly graphs after DOM layout & paint is ready
          // (Double requestAnimationFrame ensures cells are fully laid out before measuring)
          requestAnimationFrame(() => requestAnimationFrame(() => domHelpers.current.renderPlotlyInCells()));
        }
        
        // Re-run mermaid to render any mermaid diagrams in the table
        // Use double requestAnimationFrame to ensure DOM is fully updated
        requestAnimationFrame(() => requestAnimationFrame(() => renderMermaidDiagrams()));
      } else {
        console.log('Skipping table adjustment (cellEditCancelled)...');
      }
    }, 500);
    
    // Return focus to table (preventScroll prevents unwanted page scrolling)
    if (tabulatorRef.current?.table?.element) {
      tabulatorRef.current.table.element.focus({ preventScroll: true });
    }
  }, [dsName, emitUnlock, auth.user]);

  // Cell edited handler
  const handleCellEdited = useCallback((cell) => {
    const rowData = cell.getRow().getData();
    const _id = rowData._id;
    const field = cell.getField();
    const newVal = cell.getValue();
    const oldVal = cell.getOldValue();

    // Normalize row height immediately (synchronously)
    // Reference: DsView.js line 1119
    cell.getRow().normalizeHeight();
    
    // Schedule delayed table adjustments and image normalization
    // Reference: DsView.js lines 1122-1130
    if (timersRef.current['post-cell-edited']) {
      clearTimeout(timersRef.current['post-cell-edited']);
    }
    timersRef.current['post-cell-edited'] = setTimeout(() => {
      if (tabulatorRef.current?.table) {
        tabulatorRef.current.table.rowManager.adjustTableSize(false);
        if (domHelpers.current) {
          domHelpers.current.normalizeAllImgRows();
          domHelpers.current.applyHighlightJsBadge();
          // Render plotly graphs after DOM layout & paint is ready
          // (Double requestAnimationFrame ensures cells are fully laid out before measuring)
          requestAnimationFrame(() => requestAnimationFrame(() => domHelpers.current.renderPlotlyInCells()));
        }
        
        // Re-run mermaid to render any mermaid diagrams in the table
        // Use double requestAnimationFrame to ensure DOM is fully updated
        requestAnimationFrame(() => requestAnimationFrame(() => renderMermaidDiagrams()));
      }
    }, 500);

    // Check if this is a new row (no _id) - Reference: DsView.js lines 1111-1180
    if (!_id) {
      // This is a new row that needs to be inserted to backend
      // Build key object from configured key fields
      const keyObj = {};
      const keys = viewConfig?.keys || [];
      
      // Collect key field values
      for (const key of keys) {
        if (rowData[key] !== undefined && rowData[key] !== null && rowData[key] !== '') {
          keyObj[key] = rowData[key];
        }
      }
      
      // Ensure at least one key field is populated before inserting
      if (Object.keys(keyObj).length === 0) {
        console.log('New row: waiting for key fields to be populated');
        cellImEditingRef.current = null;
        return;
      }
      
      // Insert the new row to backend
      // Backend expects: dsName, dsView, dsUser, selectorObj (key fields), doc (full row data)
      const payload = {
        dsName,
        dsView,
        dsUser: userId,
        selectorObj: keyObj,  // Only the key fields
        doc: rowData,         // Complete row data
      };
      
      console.log('=== INSERT ROW PAYLOAD ===');
      console.log('dsName:', dsName);
      console.log('dsView:', dsView);
      console.log('dsUser:', userId);
      console.log('selectorObj (keyObj):', JSON.stringify(keyObj));
      console.log('doc (rowData) keys:', Object.keys(rowData));
      console.log('Full payload:', JSON.stringify(payload, null, 2));
      console.log('=== END PAYLOAD ===');
      
      const uiRow = cell.getRow();
      
      insertRowMutation.mutate(
        payload,
        {
          onSuccess: (result) => {
            console.log('INSERT ROW response from backend:', result);
            
            // Match old UI logic: DsView.js line 989
            // Check result.status === 'success' first, then use result._id
            if (result.status === 'success') {
              console.log('Row insertion successful, updating with _id:', result._id);
              uiRow.update({ _id: result._id });
              
              // Clear the "new row" background color styling
              const rowElement = uiRow.getElement();
              rowElement.style.backgroundColor = '';
              rowElement.style.borderLeft = '';
              
              setNotificationType('success');
              setNotificationMessage('Row added successfully');
              setShowNotification(true);
            } else if (result.status === 'fail') {
              // Match old UI logic: DsView.js line 987-988
              console.log('Row insertion failed:', result);
              setNotificationType('error');
              setNotificationMessage(result.message || 'Row addition failed, key might already be used. Try a different key.');
              setShowNotification(true);
            } else {
              // Unexpected response format
              console.log('Unexpected response format:', result);
              setNotificationType('warning');
              setNotificationMessage('Unexpected response from server');
              setShowNotification(true);
            }
          },
          onError: (error) => {
            setNotificationType('error');
            setNotificationMessage(`Failed to add row: ${error.message}`);
            setShowNotification(true);
          },
        }
      );
      
      cellImEditingRef.current = null;
      return;
    }

    if (newVal === oldVal) {
      // No change, just unlock
      emitUnlock({ dsName, _id, field, newVal, user: auth.userId || userId });
      cellImEditingRef.current = null;
      return;
    }

    // Dispatch edit start action
    dispatchEdit({
      type: EDIT_ACTION_TYPES.EDIT_START,
      _id,
      editTracker: { _id, field, oldVal, newVal },
    });

    // Call API to save edit
    // Match reference implementation payload shape
    // Reference: DsView.js lines 1172-1183
    const selectorObj = { _id, [field]: oldVal };
    const editObj = { [field]: newVal };
    const jiraConfig = viewConfig?.jiraConfig;
    const jiraAgileConfig = viewConfig?.jiraAgileConfig;
    const payload = {
      dsName,
      dsView,
      dsUser: userId,
      column: field,
      selectorObj,
      editObj,
      jiraConfig,
      jiraAgileConfig,
    };
    
    // Store cell reference to check later if still valid
    const editedCell = cell;
    
    editCellMutation.mutate(
      payload,
      {
        onSuccess: (result) => {
          dispatchEdit({
            type: EDIT_ACTION_TYPES.EDIT_SUCCESS,
            _id,
            serverStatus: result,
            editTracker: { _id, field, oldVal, newVal },
          });
          
          // Emit unlock with new value
          emitUnlock({ dsName, _id, field, newVal, user: auth.userId || userId });
          cellImEditingRef.current = null;

          // Show success notification
          setNotificationType('success');
          setNotificationMessage('Cell updated successfully');
          setShowNotification(true);
          
          // Note: Do NOT call cell.setValue() or other cell methods here
          // The cell is no longer in edit mode by the time this async callback runs
        },
        onError: (error) => {
          console.error('editCell API error', error);
          dispatchEdit({
            type: EDIT_ACTION_TYPES.EDIT_FAILURE,
            _id,
            editTracker: { _id, field, oldVal, newVal },
            error: error.message,
          });

          // Only try to restore value if cell is still being edited
          // Check if this is still the current cell being edited
          if (cellImEditingRef.current === editedCell) {
            // Cell is still in edit mode, safe to restore
            if (typeof editedCell.restoreOldValue === 'function') {
              editedCell.restoreOldValue();
            } else {
              editedCell.setValue(oldVal);
            }
          }
          // If cell is no longer being edited, the table state already has the old value
          // so we don't need to do anything

          // Emit unlock
          emitUnlock({ dsName, _id, field, newVal: oldVal, user: auth.userId || userId });
          cellImEditingRef.current = null;

          // Show error notification
          setNotificationType('error');
          setNotificationMessage(`Edit failed: ${error.message}`);
          setShowNotification(true);
        },
      }
    );
  }, [dsName, dsView, userId, viewConfig, editCellMutation, insertRowMutation, emitUnlock, auth.userId]);

  // Add row handler
  // Reference: DsView.js lines 867-896
  // Adds a temporary row to Tabulator (no backend call yet)
  // When user edits a cell in the new row, handleCellEdited will detect
  // the missing _id and trigger the actual insertRow API call
  // Add row handler
  // Accepts multiple call signatures used in the codebase:
  //   (e, cell, data, pos)  - menu-driven calls
  //   (data, cell, pos)     - programmatic calls (duplicate handler)
  const handleAddRow = useCallback(async (...args) => {
    if (!tabulatorRef.current?.table) return;

    // Normalize arguments
    let e = null;
    let data = null;
    let cell = null;
    let pos = null;

    if (args.length >= 3 && args[0] && typeof args[0] === 'object' && ('preventDefault' in args[0] || 'target' in args[0])) {
      // (e, cell, data, pos)
      e = args[0];
      cell = args[1];
      data = args[2];
      pos = args[3];
    } else if (args.length >= 3) {
      // (data, cell, pos)
      data = args[0];
      cell = args[1];
      pos = args[2];
    } else if (args.length === 2) {
      // could be (e, cell) or (data, cell)
      if (args[0] && typeof args[0] === 'object' && ('preventDefault' in args[0] || 'target' in args[0])) {
        e = args[0];
        cell = args[1];
      } else {
        data = args[0];
        cell = args[1];
      }
    } else if (args.length === 1) {
      // Could be event (from button click) or data object
      if (args[0] && typeof args[0] === 'object' && ('preventDefault' in args[0] || 'target' in args[0] || 'nativeEvent' in args[0])) {
        // This is an event from button click, not data
        e = args[0];
        data = null;
      } else {
        data = args[0];
      }
    }

    // If no data provided, create empty row
    if (!data) {
      data = {};
      try {
        if (viewConfig?.perRowAccessConfig?.enabled && viewConfig?.perRowAccessConfig?.column) {
          // Use userId string instead of auth.user object to avoid circular references
          // Explicitly create a new string to avoid any reference issues
          data[viewConfig.perRowAccessConfig.column] = String(auth.userId || userId || '');
        }
      } catch (err) {
        console.error('Error setting per-row access:', err);
      }
    } else {
      // If data was provided, create a deep copy to avoid any reference issues
      try {
        data = JSON.parse(JSON.stringify(data));
      } catch (err) {
        console.error('Error cloning data:', err);
        // If JSON parse fails, create a new object with string values only
        const cleanData = {};
        for (const key in data) {
          if (data.hasOwnProperty(key) && typeof data[key] !== 'function' && typeof data[key] !== 'object') {
            cleanData[key] = data[key];
          } else if (typeof data[key] === 'object' && data[key] !== null) {
            try {
              cleanData[key] = JSON.parse(JSON.stringify(data[key]));
            } catch (e) {
              // Skip this field if it can't be serialized
              console.warn(`Skipping field ${key} due to serialization error`);
            }
          }
        }
        data = cleanData;
      }
    }

    // Determine row component from cell if provided
    let rowComponent = null;
    if (cell && typeof cell.getRow === 'function') {
      rowComponent = cell.getRow();
    }

    // Default position to top (true) if not specified
    if (pos === undefined || pos === null) pos = true;

    // Add row to Tabulator (no _id yet, will be added by backend later)
    try {
      console.log('[handleAddRow] About to call addRow with:', { 
        dataKeys: Object.keys(data),
        dataValues: Object.values(data),
        pos, 
        hasRowComponent: !!rowComponent,
      });
      // Verify data is serializable
      try {
        JSON.stringify(data);
        console.log('[handleAddRow] ✓ Data is serializable');
      } catch (e) {
        console.error('[handleAddRow] ✗ Data has circular reference:', e);
        throw new Error('Data contains circular reference');
      }
      
      // Add row with scroll preservation to prevent jumping to top
      let row = null;
      const table = tabulatorRef.current.table;
      const rowManager = table?.rowManager?.element;
      
      if (rowManager) {
        const scrollBefore = {
          top: rowManager.scrollTop,
          left: rowManager.scrollLeft
        };
        console.log('[handleAddRow] Scroll position BEFORE addRow:', scrollBefore);
        
        executeWithScrollPreservation(table, () => {
          // Only pass rowComponent if it exists and we have a non-boolean position
          if (rowComponent) {
            row = table.addRow(data, pos, rowComponent);
          } else {
            // For top button clicks, just pass data and position
            row = table.addRow(data, pos);
          }
        });
        
        setTimeout(() => {
          const scrollAfter = {
            top: rowManager.scrollTop,
            left: rowManager.scrollLeft
          };
          console.log('[handleAddRow] Scroll position AFTER addRow (delayed check):', scrollAfter);
        }, 100);
      } else {
        console.warn('[handleAddRow] No rowManager element found, adding row without scroll preservation');
        if (rowComponent) {
          row = table.addRow(data, pos, rowComponent);
        } else {
          row = table.addRow(data, pos);
        }
      }
      
      console.log('[handleAddRow] ✓ Row added successfully');
      return row;
    } catch (error) {
      console.error('[handleAddRow] Error adding row to table:', error);
      console.error('[handleAddRow] Full error:', error.stack);
      setNotificationType('error');
      setNotificationMessage(`Failed to add row: ${error.message}`);
      setShowNotification(true);
    }
  }, [tabulatorRef, viewConfig, auth.userId, userId, executeWithScrollPreservation]);

  // Copy to clipboard handler
  const handleCopyToClipboard = useCallback(() => {
    if (tabulatorRef.current && clipboardHelpers.current) {
      clipboardHelpers.current.copyToClipboard(tabulatorRef.current);
    }
  }, []);

  // Delete row handler
  const handleDeleteRow = useCallback((_id, row) => {
    console.log('[DELETE ROW] handleDeleteRow called with _id:', _id, ', row:', row);
    setModalTitle('Confirm Delete');
    setModalQuestion('Are you sure you want to delete this row?');
    setModalOk('Delete');
    setModalCancel('Cancel');
    setModalCallback(() => () => {
      deleteRowMutation.mutate(
        {
          dsName,
          dsView,
          dsUser: userId,
          selectorObj: { _id },
        },
        {
          onSuccess: () => {
            // Delete row from Tabulator directly (no table reload)
            // Reference: DsView.js lines 1268-1269
            try {
              if (row && typeof row.delete === 'function') {
                row.delete();
                console.log('[DELETE ROW] Row removed from table successfully');
              }
            } catch (err) {
              console.error('[DELETE ROW] Failed to remove row from table:', err);
            }
            
            // Restore window scroll position after deletion
            const savedPosition = scrollPositionBeforeLoadRef.current;
            if (savedPosition && (savedPosition.windowScrollY !== undefined || savedPosition.windowScrollX !== undefined)) {
              console.log('[DELETE ROW] Restoring window scroll after deletion:', savedPosition.windowScrollY);
              window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
              
              // Use requestAnimationFrame to ensure restoration after any browser reflows
              requestAnimationFrame(() => {
                window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
              });
            }
            
            setNotificationType('success');
            setNotificationMessage('Row deleted successfully');
            setShowNotification(true);
            setShowModal(false);
          },
          onError: (error) => {
            setNotificationType('error');
            setNotificationMessage(`Failed to delete row: ${error.message}`);
            setShowNotification(true);
            setShowModal(false);
          },
        }
      );
    });
    setShowModal(true);
  }, [dsName, dsView, userId, deleteRowMutation]);

  // Keep ref in sync
  useEffect(() => {
    handleDeleteRowRef.current = handleDeleteRow;
  }, [handleDeleteRow]);

  // Hide column handler - matches reference DsView.js hideCol
  // Reference: DsView.js lines 1826-1831
  const hideColumn = useCallback((...args) => {
    try {
      // Normalize arguments - can be called as (column) or (e, column)
      let column = null;
      if (args.length === 1) {
        const a0 = args[0];
        // Check if it's a ColumnComponent (has getField method)
        if (a0 && typeof a0.getField === 'function') {
          column = a0;
        }
      } else if (args.length >= 2) {
        // (e, column)
        column = args[1];
      }

      if (!column || typeof column.getField !== 'function') {
        console.warn('hideColumn: no valid column argument detected');
        return;
      }

      const field = column.getField();
      
      // Don't hide key columns (reference guard)
      if (viewConfig?.keys?.includes(field)) {
        console.log('Cannot hide key column:', field);
        return;
      }

      // Hide the column
      column.hide();

      // Lightweight redraw and size adjustment (matches reference)
      if (tabulatorRef.current?.table) {
        redrawTableWithScrollPreservation(tabulatorRef.current.table);
      }
    } catch (err) {
      console.error('hideColumn error', err);
    }
  }, [viewConfig, redrawTableWithScrollPreservation]);

  // Hide column from cell context menu - matches reference DsView.js hideColFromCell
  // Reference: DsView.js lines 1833-1839
  const hideColumnFromCell = useCallback((...args) => {
    try {
      // Normalize arguments - can be called as (cell) or (e, cell)
      let cell = null;
      if (args.length === 1) {
        const a0 = args[0];
        if (a0 && typeof a0.getRow === 'function') {
          cell = a0;
        }
      } else if (args.length >= 2) {
        // (e, cell)
        cell = args[1];
      }

      if (!cell || typeof cell.getColumn !== 'function') {
        console.warn('hideColumnFromCell: no valid cell argument detected');
        return;
      }

      const column = cell.getColumn();
      if (!column) {
        console.warn('hideColumnFromCell: could not get column from cell');
        return;
      }

      const field = column.getField();
      
      // Don't hide key columns (reference guard)
      if (viewConfig?.keys?.includes(field)) {
        console.log('Cannot hide key column:', field);
        return;
      }

      // Hide the column
      column.hide();

      // Lightweight redraw and size adjustment (matches reference)
      if (tabulatorRef.current?.table) {
        redrawTableWithScrollPreservation(tabulatorRef.current.table);
      }
    } catch (err) {
      console.error('hideColumnFromCell error', err);
    }
  }, [viewConfig, redrawTableWithScrollPreservation]);

  // Show all hidden columns - matches reference DsView.js showAllCols
  // Reference: DsView.js lines 1841-1848
  // Only changes visibility; does NOT modify widths
  const showAllCols = useCallback(() => {
    try {
      const table = tabulatorRef.current?.table;
      if (!table) return;

      const columns = table.getColumns() || [];
      
      // Show only currently hidden columns
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col.isVisible()) {
          col.show();
        }
      }

      // Lightweight redraw (matches reference)
      redrawTableWithScrollPreservation(table);
    } catch (err) {
      console.error('showAllCols error', err);
    }
  }, [redrawTableWithScrollPreservation]);

  // Add column question - shows modal with form
  // Reference: DsView.js lines 1444-1488
  const addColumnQuestion = useCallback((referenceField) => {
    console.log('[ADD COLUMN] addColumnQuestion called with referenceField:', referenceField);
    
    // Reset modal state
    setNewColumnName('');
    setAddColumnPosition('left');
    setAddColumnReferenceField(referenceField || '');
    setAddColumnError('');
    setAddColumnProcessing(false);
    
    // Show the add column modal
    setShowAddColumnModal(true);
  }, []);

  // Add column handler - validates and calls API
  // Reference: DsView.js lines 1490-1533
  const addColumnHandler = useCallback(() => {
    console.log('[ADD COLUMN] addColumnHandler called');
    
    // Validate column name
    if (!newColumnName || newColumnName.trim() === '') {
      setAddColumnError('Column name is required');
      return;
    }
    
    // Validate column name pattern
    const pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!pattern.test(newColumnName)) {
      setAddColumnError('Column name must start with a letter or underscore and contain only alphanumeric characters and underscores');
      return;
    }
    
    // Clear any previous errors
    setAddColumnError('');
    setAddColumnProcessing(true);
    
    // Call add column mutation
    const payload = {
      dsName,
      dsView,
      dsUser: userId,
      columnName: newColumnName,
      position: addColumnPosition,
      referenceColumn: addColumnReferenceField,
      columnAttrs: {}, // Empty object - minimal defaults per reference
    };
    
    console.log('[ADD COLUMN] Calling addColumnMutation with payload:', payload);
    
    addColumnMutation.mutate(
      payload,
      {
        onSuccess: (result) => {
          console.log('[ADD COLUMN] Column added successfully:', result);
          
          // Close modal
          setShowAddColumnModal(false);
          setAddColumnProcessing(false);
          
          // Show success notification
          setNotificationType('success');
          setNotificationMessage(`Column "${newColumnName}" added successfully`);
          setShowNotification(true);
          
          // Refresh column definitions by forcing helper regeneration
          // This will trigger the effect that regenerates columns from viewConfig
          setForceRefresh(prev => prev + 1);
          
          // After state updates, dynamically add column to Tabulator
          // Reference: DsView.js addColumnStatus lines 1547
          setTimeout(() => {
            try {
              const table = tabulatorRef.current?.table;
              if (table && typeof table.addColumn === 'function') {
                const newColDef = {
                  field: newColumnName,
                  title: newColumnName,
                };
                
                // Find reference column index
                const columns = table.getColumns() || [];
                let refColIndex = -1;
                for (let i = 0; i < columns.length; i++) {
                  if (columns[i].getField() === addColumnReferenceField) {
                    refColIndex = i;
                    break;
                  }
                }
                
                // Insert at appropriate position
                if (refColIndex >= 0) {
                  const insertAfter = addColumnPosition === 'right';
                  const targetColumn = columns[refColIndex];
                  table.addColumn(newColDef, insertAfter, targetColumn);
                } else {
                  // Fallback: add at end
                  table.addColumn(newColDef);
                }
                
                console.log('[ADD COLUMN] Dynamically added column to table');
                redrawTableWithScrollPreservation(table);
              }
            } catch (err) {
              console.error('[ADD COLUMN] Error dynamically adding column:', err);
            }
          }, 100);
        },
        onError: (error) => {
          console.error('[ADD COLUMN] addColumn API error:', error);
          setAddColumnError(error.message || 'Failed to add column');
          setAddColumnProcessing(false);
          
          // Also show notification for visibility
          setNotificationType('error');
          setNotificationMessage(`Failed to add column: ${error.message}`);
          setShowNotification(true);
        },
      }
    );
  }, [dsName, dsView, userId, newColumnName, addColumnPosition, addColumnReferenceField, addColumnMutation, redrawTableWithScrollPreservation]);

  // Delete column question - shows modal with confirmation or error if key column
  // Reference: DsView.js lines 1387-1412
  const deleteColumnQuestion = useCallback((...args) => {
    try {
      // Normalize arguments: Tabulator may call (cell) or (e, cell)
      let cell = null;
      if (args.length === 1) {
        const a0 = args[0];
        if (a0 && typeof a0.getColumn === 'function') {
          cell = a0;
        }
      } else if (args.length >= 2) {
        // (e, cell)
        cell = args[1];
      }

      if (!cell || typeof cell.getColumn !== 'function') {
        console.warn('deleteColumnQuestion: no valid cell argument detected');
        return;
      }

      const column = cell.getColumn();
      const columnField = column.getField();

      console.log('[DELETE COLUMN] deleteColumnQuestion called for column:', columnField);

      // Check if this is a key column (cannot be deleted)
      // Reference: DsView.js lines 1392-1399
      if (viewConfig?.keys?.includes(columnField)) {
        console.log('[DELETE COLUMN] Cannot delete key column:', columnField);
        
        // Show error modal for key column
        setModalTitle('Cannot Delete Column');
        setModalQuestion('This is a Key Column. This Column cannot be deleted.');
        setModalOk('Dismiss');
        setModalCancel(null); // No cancel button, only dismiss
        setModalCallback(null); // No action on OK, just close
        setShowModal(true);
        return;
      }

      // Not a key column - show confirmation modal
      // Reference: DsView.js lines 1401-1409
      setColumnToDelete(columnField);
      setModalTitle('Delete current column?');
      setModalQuestion(`This will delete the current column: ${columnField}. Please confirm. Undoing support is not yet available!`);
      setModalOk('Delete');
      setModalCancel('Cancel');
      
      // Set callback for confirm button
      setModalCallback(() => () => {
        deleteColumnHandler(columnField);
      });
      
      setShowModal(true);
    } catch (err) {
      console.error('deleteColumnQuestion error', err);
    }
  }, [viewConfig]);

  // Delete column handler - calls API to delete column
  // Reference: DsView.js lines 1369-1385
  const deleteColumnHandler = useCallback((columnField) => {
    console.log('[DELETE COLUMN] deleteColumnHandler called for column:', columnField);
    
    // Build payload for API
    // Reference: Redux action expects { dsName, dsView, dsUser, columnName }
    const payload = {
      dsName,
      dsView,
      dsUser: userId,
      columnName: columnField,
    };
    
    console.log('[DELETE COLUMN] Calling deleteColumnMutation with payload:', payload);
    
    deleteColumnMutation.mutate(
      payload,
      {
        onSuccess: (result) => {
          console.log('[DELETE COLUMN] Column deleted successfully:', result);
          
          // Close modal
          setShowModal(false);
          setColumnToDelete('');
          
          // Show success notification
          setNotificationType('success');
          setNotificationMessage(`Column "${columnField}" deleted successfully`);
          setShowNotification(true);
          
          // Force table refresh to reload column definitions
          // Reference: DsView.js line 1380
          setForceRefresh(prev => prev + 1);
        },
        onError: (error) => {
          console.error('[DELETE COLUMN] deleteColumn API error:', error);
          
          // Close modal
          setShowModal(false);
          setColumnToDelete('');
          
          // Show error notification
          setNotificationType('error');
          setNotificationMessage(`Failed to delete column: ${error.message}`);
          setShowNotification(true);
        },
      }
    );
  }, [dsName, dsView, userId, deleteColumnMutation]);

  // Edit table attributes - opens modal to edit otherTableAttrs
  const editTableAttributesHandler = useCallback(async () => {
    console.log('[EDIT TABLE ATTRS] Opening table attributes modal');
    setTableAttrsError('');
    setTableAttrsLoading(true);
    setShowTableAttributesModal(true);
    
    try {
      // Fetch current attributes
      const result = await getOtherTableAttrs(dsName, dsView, userId);
      console.log('[EDIT TABLE ATTRS] Fetched attributes:', result);
      
      // Set form state from fetched data
      setTableAttrsFixedHeight(result.fixedHeight || false);
      
      if (result.rowMaxHeight !== undefined && result.rowMaxHeight !== null) {
        setTableAttrsRowMaxHeightEnabled(true);
        setTableAttrsRowMaxHeight(result.rowMaxHeight);
      } else {
        setTableAttrsRowMaxHeightEnabled(false);
        setTableAttrsRowMaxHeight(100);
      }
      
      if (result.rowHeight !== undefined && result.rowHeight !== null) {
        setTableAttrsRowHeightEnabled(true);
        setTableAttrsRowHeight(result.rowHeight);
      } else {
        setTableAttrsRowHeightEnabled(false);
        setTableAttrsRowHeight(50);
      }
      
      setTableAttrsLoading(false);
    } catch (error) {
      console.error('[EDIT TABLE ATTRS] Error fetching attributes:', error);
      setTableAttrsError('Failed to load table attributes: ' + error.message);
      setTableAttrsLoading(false);
    }
  }, [dsName, dsView, userId]);

  // Save table attributes - saves otherTableAttrs via API
  const saveTableAttributesHandler = useCallback(async () => {
    console.log('[EDIT TABLE ATTRS] Saving table attributes');
    setTableAttrsError('');
    setTableAttrsSaving(true);
    
    try {
      // Build payload
      const otherTableAttrs = {};
      
      // Always include fixedHeight
      otherTableAttrs.fixedHeight = tableAttrsFixedHeight;
      
      // Only include rowMaxHeight if enabled
      if (tableAttrsRowMaxHeightEnabled) {
        const val = parseInt(tableAttrsRowMaxHeight, 10);
        if (isNaN(val)) {
          setTableAttrsError('Row Max Height must be a valid integer');
          setTableAttrsSaving(false);
          return;
        }
        otherTableAttrs.rowMaxHeight = val;
      }
      
      // Only include rowHeight if enabled
      if (tableAttrsRowHeightEnabled) {
        const val = parseInt(tableAttrsRowHeight, 10);
        if (isNaN(val)) {
          setTableAttrsError('Row Height must be a valid integer');
          setTableAttrsSaving(false);
          return;
        }
        otherTableAttrs.rowHeight = val;
      }
      
      const payload = {
        dsName,
        dsView,
        dsUser: userId,
        otherTableAttrs
      };
      
      const [success, result] = await setOtherTableAttrs(payload);
      
      if (success) {
        // Invalidate and refetch the view config to get updated otherTableAttrs
        await queryClient.invalidateQueries({ queryKey: ['dsView', dsName, dsView, userId] });
        
        setShowTableAttributesModal(false);
        setNotificationType('success');
        setNotificationMessage('Table attributes updated successfully');
        setShowNotification(true);
        
        // Force table refresh to pick up changes
        setForceRefresh(prev => prev + 1);
      } else {
        setTableAttrsError('Failed to save: ' + (result.message || 'Unknown error'));
      }
      
      setTableAttrsSaving(false);
    } catch (error) {
      console.error('[EDIT TABLE ATTRS] Error saving attributes:', error);
      setTableAttrsError('Failed to save table attributes: ' + error.message);
      setTableAttrsSaving(false);
    }
  }, [dsName, dsView, userId, tableAttrsFixedHeight, tableAttrsRowMaxHeightEnabled, tableAttrsRowMaxHeight, tableAttrsRowHeightEnabled, tableAttrsRowHeight]);

  // Handlers object for tabulatorConfig (defined after all handler functions)
  const handlers = useMemo(() => {
    console.log('[HANDLERS] Creating handlers object', {
      cellEditCheckType: typeof cellEditCheck,
      cellForceEditTriggerType: typeof cellForceEditTrigger,
    });
    return {
    cellEditCheck: cellEditCheck,
    cellForceEditTrigger: cellForceEditTrigger, // Separate function that triggers edit
    isKey: (field) => viewConfig?.keys?.includes(field) || false,
    toggleSingleFilter: () => {}, // TODO
    freezeColumn: () => {}, // TODO
    unfreezeColumn: () => {}, // TODO
    hideColumn: hideColumn,
    hideColumnFromCell: hideColumnFromCell,
    showAllCols: showAllCols,
    copyCellToClipboard: (...args) => {
      try {
        // Tabulator may call context menu actions with different signatures.
        // Normalize to (e, cell) or (cell)
        let cell = null;
        if (args.length === 1) {
          // Could be (cell) or (e) depending on Tabulator version; detect cell by presence of getRow
          const a0 = args[0];
          if (a0 && typeof a0.getRow === 'function') {
            cell = a0;
          }
        } else if (args.length >= 2) {
          // (e, cell)
          cell = args[1];
        }
        if (!cell) {
          // Try fallback: if first arg looks like event and has a target, try to find cell element
          // Not attempting DOM lookup here to avoid brittle code
          console.warn('copyCellToClipboard: no cell argument detected');
          return;
        }
        clipboardHelpers.current?.copyCellToClipboard(null, cell);
      } catch (err) {
        console.error('copyCellToClipboard error', err);
      }
    },
    startPreso: () => {}, // Deferred
    urlGeneratorFunction: urlGeneratorFunction,
    duplicateAndAddRowHandler: async (e, cell, pos) => {
      try {
        // Context menu already captured scroll to scrollPositionBeforeLoadRef.current
        // Log what was captured
        console.log('[duplicateAndAddRowHandler] Using scroll captured by context menu:', scrollPositionBeforeLoadRef.current);
        
        // Future: Check if JIRA row (currently deferred)
        // if (isJiraRow(rowData, jiraConfig, jiraAgileConfig)) { show modal }
        
        console.log('Duplicate and add row called..');
        
        // Clone the row data and remove _id (backend will generate new one)
        let newData = JSON.parse(JSON.stringify(cell.getData()));
        delete newData._id;
        
        console.log('newData: ', newData);
        
        // Call handleAddRow with the duplicated data and position
        await handleAddRow(newData, cell, pos);
        
        // Restore window scroll immediately after adding row (in case rowAdded callback doesn't fire quickly enough)
        const savedPosition = scrollPositionBeforeLoadRef.current;
        if (savedPosition && (savedPosition.windowScrollY !== undefined || savedPosition.windowScrollX !== undefined)) {
          console.log('[duplicateAndAddRowHandler] Restoring window scroll after handleAddRow:', savedPosition.windowScrollY);
          window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
          
          // Use requestAnimationFrame to ensure restoration after any browser reflows
          requestAnimationFrame(() => {
            window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
          });
        }
      } catch (err) {
        console.error('duplicateAndAddRowHandler error', err);
      }
    },
    addRow: handleAddRow,
    deleteAllRowsInViewQuestion: deleteAllRowsInView,
    deleteAllRowsInQuery: deleteAllRowsInQuery,
    deleteRowQuestion: (e, cell) => {
      console.log('[DELETE ROW] deleteRowQuestion called, e:', e, ', cell:', cell);
      try {
        // Normalize arguments: Tabulator may call (cell) or (e, cell)
        let _cell = null;
        if (cell && typeof cell.getRow === 'function') {
          _cell = cell;
        } else if (e && typeof e.getRow === 'function') {
          _cell = e;
        }

        if (!_cell) {
          console.warn('deleteRowQuestion: no cell argument detected');
          return;
        }

        const row = _cell.getRow();
        const data = row?.getData?.() || {};
        const id = data?._id;
        console.log('[DELETE ROW] Extracted row data:', data, ', _id:', id);

        // If row has no backend _id yet (new local row), just delete from table
        if (!id) {
          try {
            row.delete();
          } catch (err) {
            console.error('deleteRowQuestion: failed to delete local row', err);
            setNotificationType('error');
            setNotificationMessage('Failed to remove local row');
            setShowNotification(true);
          }
          return;
        }

        // Otherwise open confirm modal which will call delete mutation on confirm
        console.log('[DELETE ROW] About to call handleDeleteRow with id:', id, ', and row:', row);
        if (handleDeleteRowRef.current) {
          handleDeleteRowRef.current(id, row);
        }
      } catch (err) {
        console.error('deleteRowQuestion error', err);
      }
    },
    deleteColumnQuestion: deleteColumnQuestion,
    addColumnQuestion: addColumnQuestion,
    downloadXlsx: (useQuery) => {
      let query = [];
      if (useQuery) {
        /**
         * This is special case where there in frontend we are viewing just the single row.
         * In such case, whatever the query might be in the header, we need to download only the single row.
         */
        if (_id) {
          query.push({
            field: "_id",
            value: _id
          });
        } else {
          query = tabulatorRef.current?.table?.getHeaderFilters() || [];
        }
      }
      // XXX: Doesn't work from the front end.
      // tabulatorRef.current.table.download("xlsx", "data.xlsx", { sheetName: "export" })

      downloadXlsx({ dsName, dsView, dsUser: userId, query });
    },
    editTableAttributes: editTableAttributesHandler,
    convertToJiraRow: () => {}, // Deferred
    addJiraRow: () => {}, // Deferred
    isJiraRow: () => false, // Deferred
    showAllFilters: showAllFilters,
  };
  }, [handleCellEditing, handleAddRow, viewConfig, showAllFilters, cellEditCheck, cellForceEditTrigger, hideColumn, hideColumnFromCell, showAllCols, deleteAllRowsInView, deleteAllRowsInQuery, urlGeneratorFunction, addColumnQuestion, deleteColumnQuestion, editTableAttributesHandler, dsName, dsView, userId, _id]);

  // Initialize helper modules and generate columns
  useEffect(() => {
    console.log('[DEBUG REFRESH] Column generation effect triggered', {
      viewConfig: !!viewConfig,
      dsName,
      dsView,
      userId,
      showAllFilters,
      filterColumnAttrsKeys: Object.keys(filterColumnAttrs || {}),
      searchParams: searchParams.toString(),
      timestamp: new Date().toISOString()
    });
    urlRestoreLog('[URL RESTORE] Column generation effect triggered');
    if (!viewConfig) {
      console.log('[DEBUG REFRESH] Skipping - no viewConfig');
      return;
    }
    
    // If there are searchParams that haven't been processed yet, wait before generating columns
    const searchString = searchParams.toString();
    urlRestoreLog('[URL RESTORE] Column gen: searchString =', searchString, ', lastProcessed =', lastProcessedSearchRef.current);
    urlRestoreLog('[URL RESTORE] Column gen: current filterColumnAttrs =', filterColumnAttrs);
    if (searchString && lastProcessedSearchRef.current !== searchString) {
      urlRestoreLog('[URL RESTORE] Waiting for searchParams to be processed before generating columns');
      return; // Don't generate columns yet, URL params need to be processed first
    }
    
    // CRITICAL: Even if searchParams were processed, the state updates may not have applied yet
    // Check if URL contains filterColumnAttrs but state is still empty - if so, wait for state update
    if (searchString && lastProcessedSearchRef.current === searchString) {
      try {
        const urlFilterColumnAttrs = searchParams.get('filterColumnAttrs');
        if (urlFilterColumnAttrs) {
          // URL has filterColumnAttrs, check if state has been updated
          const currentAttrsStr = JSON.stringify(filterColumnAttrs || {});
          if (currentAttrsStr === '{}') {
            urlRestoreLog('[URL RESTORE] ⏳ searchParams processed but filterColumnAttrs state not yet updated, waiting...');
            return; // State update hasn't applied yet, wait for next render
          }
        }
      } catch (e) {
        console.error('[URL RESTORE] Error checking filterColumnAttrs state:', e);
      }
    }

    // Store original columnAttrs for editor restoration when toggling editing
    if (!originalColumnAttrsRef.current && viewConfig.columnAttrs) {
      originalColumnAttrsRef.current = JSON.parse(JSON.stringify(viewConfig.columnAttrs));
    }

    // For named filters, derive fresh filterColumnAttrs from viewConfig to get latest saved widths
    // This ensures that after a filter save, the refreshed viewConfig data is used for column generation
    let effectiveFilterColumnAttrs = filterColumnAttrs;
    if (filterParam && viewConfig.filters?.[filterParam]?.filterColumnAttrs) {
      effectiveFilterColumnAttrs = viewConfig.filters[filterParam].filterColumnAttrs;
      console.log('[COLUMN-GEN] Using fresh filterColumnAttrs from viewConfig.filters for:', filterParam);
    }

    const helperContext = {
      tabulatorRef,
      viewConfig,
      dsName,
      dsView,
      userId,
      handlers,
      cellImEditingRef,
      frozenCol,
      filterColumnAttrs: effectiveFilterColumnAttrs,
      columnResizedRecently: columnResizedRecentlyRef.current,
      originalColumnAttrs: originalColumnAttrsRef.current,
      scrollPositionRef: scrollPositionBeforeLoadRef, // For context menu to save scroll before actions
      // Properties needed by domHelpers
      component: { 
        cellImEditing: cellImEditingRef.current,
        mouseDownOnHtmlLink: mouseDownOnHtmlLinkRef.current,
        mouseDownOnBadgeCopyIcon: mouseDownOnBadgeCopyIconRef.current,
      },
      ref: () => tabulatorRef.current,
      timers: timersRef.current,
      // Refs that domHelpers can update
      mouseDownOnHtmlLinkRef,
      mouseDownOnBadgeCopyIconRef,
      // UI setters so helpers can display notifications/modals
      setShowNotification,
      setNotificationMessage,
      setNotificationType,
      setModalTitle,
      setModalQuestion,
      setShowModal,
      // Editor functions for Tabulator columns
      MyInput,
      MyTextArea,
      MyCodeMirror,
      DateEditor,
      MyAutoCompleter,
      MySingleAutoCompleter,
    };

    console.log('[HELPERS] Creating helper modules with handlers:', handlers);
    console.log('[HELPERS] handlers.deleteRowQuestion:', handlers.deleteRowQuestion);
    
    clipboardHelpers.current = createClipboardHelpers(helperContext);
    domHelpers.current = createDomHelpers(helperContext);
    tabulatorConfigHelper.current = createTabulatorConfig(helperContext);
    jiraHelpers.current = createJiraHelpers(helperContext);
    
    // Generate columns using tabulatorConfig
    if (tabulatorConfigHelper.current) {
      // Check if we need to regenerate columns (avoid unnecessary rebuilds)
      const viewConfigHash = JSON.stringify(viewConfig.columnAttrs || []);
      const effectiveAttrsStr = JSON.stringify(effectiveFilterColumnAttrs || {});
      const shouldRegenerate = (
        lastGeneratedViewConfigHashRef.current !== viewConfigHash ||
        lastGeneratedFilterAttrsRef.current !== effectiveAttrsStr
      );
      
      if (shouldRegenerate) {
        console.log('[DEBUG REFRESH] ⚠️ GENERATING NEW COLUMNS - This will cause table remount!', {
          effectiveFilterColumnAttrs,
          viewConfigChanged: lastGeneratedViewConfigHashRef.current !== viewConfigHash,
          filterAttrsChanged: lastGeneratedFilterAttrsRef.current !== effectiveAttrsStr,
          timestamp: new Date().toISOString()
        });
        urlRestoreLog('[URL RESTORE] Generating columns with filterColumnAttrs:', effectiveFilterColumnAttrs);
        const generatedColumns = tabulatorConfigHelper.current.setColumnDefinitions();
        setColumns(generatedColumns);
        
        // Store hashes to prevent unnecessary regeneration
        lastGeneratedFilterAttrsRef.current = effectiveAttrsStr;
        lastGeneratedViewConfigHashRef.current = viewConfigHash;
        urlRestoreLog('[URL RESTORE] Columns generated, stored refs');
      } else {
        console.log('[DEBUG REFRESH] Skipping column regeneration - no changes detected');
      }
    }
  }, [viewConfig, dsName, dsView, userId, showAllFilters, filterColumnAttrs, filterParam, searchParams, urlRestoreLog]);

  // Once column definitions (including saved filter attrs) are generated, allow table to mount
  useEffect(() => {
    if (!initialUrlProcessed && viewConfig && Array.isArray(columns) && columns.length > 0) {
      urlRestoreLog('[URL RESTORE] initialUrlProcessed check: columns.length =', columns.length);
      const searchString = searchParams.toString();
      
      // If there are search params, wait until they've been processed
      if (searchString && lastProcessedSearchRef.current !== searchString) {
        urlRestoreLog('[URL RESTORE] Blocking table mount - searchParams not yet processed');
        return; // Don't allow mount yet, URL params haven't been processed
      }
      
      // If no search params OR they've been processed, check if columns match filterColumnAttrs
      try {
        const currentAttrs = JSON.stringify(filterColumnAttrs || {});
        urlRestoreLog('[URL RESTORE] Comparing filterColumnAttrs: current =', currentAttrs, ', lastGenerated =', lastGeneratedFilterAttrsRef.current);
        if (lastGeneratedFilterAttrsRef.current === currentAttrs) {
          urlRestoreLog('[URL RESTORE] ✓ All conditions met, setting initialUrlProcessed = true');
          setInitialUrlProcessed(true);
        } else {
          urlRestoreLog('[URL RESTORE] ✗ filterColumnAttrs mismatch, waiting...');
        }
      } catch (e) {
        urlRestoreLog('[URL RESTORE] ✓ Exception in comparison, allowing table mount');
        setInitialUrlProcessed(true);
      }
    }
  }, [columns, viewConfig, initialUrlProcessed, filterColumnAttrs, searchParams, urlRestoreLog]);

  // Rebuild Tabulator columns when `showAllFilters` toggles so header filters are applied
  useEffect(() => {
    if (!viewConfig || !tabulatorConfigHelper.current) return;

    try {
      const generatedColumns = tabulatorConfigHelper.current.setColumnDefinitions();
      setColumns(generatedColumns);

      // If table already initialized, apply new column defs directly
      if (tabulatorRef.current?.table) {
        tabulatorRef.current.table.setColumns(generatedColumns);
      }
    } catch (e) {
      console.error('Error rebuilding columns on showAllFilters change:', e);
    }
  }, [showAllFilters, viewConfig]);

  // Continuously track scroll position to ensure we always have the latest position
  // This helps preserve scroll position during filter changes, pagination, etc.
  useEffect(() => {
    const table = tabulatorRef.current?.table;
    if (!table || !table.rowManager?.element || !initialUrlProcessed) return;
    
    const rowManagerElement = table.rowManager.element;
    
    // Immediate scroll handler to update ref (no throttle to ensure we capture position quickly)
    const handleScroll = () => {
      scrollPositionBeforeLoadRef.current = {
        top: rowManagerElement.scrollTop,
        left: rowManagerElement.scrollLeft
      };
    };
    
    rowManagerElement.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      rowManagerElement.removeEventListener('scroll', handleScroll);
    };
  }, [initialUrlProcessed]); // Re-run when table is ready


  // TODO: Implement remaining handlers:
  // - handleAddColumn
  // - handleDeleteColumn
  // - handleDownloadXlsx
  // - handleRefreshJira
  // - handleConvertToJira
  // - URL filtering
  // - Filter controls
  // - And all other methods from the original 2,360-line component

  if (isLoading) {
    return <div className={styles.loading}>Loading dataset view...</div>;
  }

  if (isError) {
    return <div className={styles.error}>Error loading view: {error?.message}</div>;
  }

  if (!viewConfig) {
    return <div className={styles.error}>No view configuration found</div>;
  }

  return (
    <div className={styles.container} style={tableHeight ? { '--table-max-height': tableHeight } : {}}>
      <Row>
        <Col>
          <div className={styles.header}>
            <h2
              className={styles.title}
              role="button"
              tabIndex={0}
              onClick={handleTitleClick}
              onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTitleClick(); }}
            >
              {dsName} - {dsView}
            </h2>
          </div>

          {/* Two-column layout: Description on left, Control Panel on right */}
        </Col>
      </Row>
      <Row>
        <Col>
          {/* Dataset Description - Reference: DsView.js lines 276-287 */}
          {(() => {
            try {
              const descriptionText = viewConfig?.dsDescription?.dsDescription;
              if (descriptionText) {
                const renderedHtml = md.render(descriptionText);
                return (
                  <div
                    style={{
                      border: '1px solid var(--color-border, #ddd)',
                      borderRadius: '8px',
                      padding: '1rem 1.5rem',
                      marginBottom: '1rem',
                      width: '59%',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className={styles.dsDescription} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                    <button
                      className="btn btn-link"
                      onClick={handleOpenDescriptionEditor}
                      style={{
                        padding: '0 6px',
                        fontSize: '1.45rem',
                        lineHeight: '1',
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginTop: '0.5rem',
                      }}
                      title="Edit description"
                    >
                      <i className="fas fa-edit" style={{ fontSize: '1.45rem', marginRight: '6px' }}></i>Edit
                    </button>
                  </div>
                );
              } else {
                // Show edit button even when description is empty
                return (
                  <div style={{ marginBottom: '1rem' }}>
                    <button
                      className="btn btn-link"
                      onClick={handleOpenDescriptionEditor}
                      style={{
                        padding: '0 6px',
                        fontSize: '1.45rem',
                        lineHeight: '1',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                      title="Add description"
                    >
                      <i className="fas fa-plus" style={{ fontSize: '1.45rem', marginRight: '6px' }}></i>Add Description
                    </button>
                  </div>
                );
              }
            } catch (e) {
              // Silently fail - no error display per reference implementation
            }
            return null;
          })()}

          {/* Control Panel - below description */}
          <div style={{ width: '59%', marginBottom: '1rem' }}>
            <ControlPanel
              chronologyDescending={chronologyDescending}
              setChronologyDescending={setChronologyDescending}
              showAllFilters={showAllFilters}
              handleShowAllFiltersToggle={handleShowAllFiltersToggle}
              singleClickEdit={singleClickEdit}
              handleSingleClickEditToggle={handleSingleClickEditToggle}
              disableEditing={disableEditing}
              disableEditingRef={disableEditingRef}
              setDisableEditing={setDisableEditing}
              toggleEditing={toggleEditing}
              setForceRefresh={setForceRefresh}
              handleAddRow={handleAddRow}
              handleRefreshJira={handleRefreshJira}
              handleCopyToClipboard={handleCopyToClipboard}
              refreshJiraMutation={refreshJiraMutation}
              dsName={dsName}
              dsView={dsView}
              viewConfig={viewConfig}
            />
          </div>
        </Col>
      </Row>
      <Row className={styles.controlRow}>
        <Col xs={12}>
          {/* FilterControls - same width as description and control panel */}
          {showAllFilters && (
            <div
              style={{
                border: '1px solid var(--color-border, #ddd)',
                borderRadius: '8px',
                padding: '1rem 1.5rem',
                marginBottom: '1rem',
                width: '59%',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
              }}
            >
              <FilterControls
                show={showAllFilters}
                dsName={dsName}
                dsView={dsView}
                userId={userId}
                tableRef={tabulatorRef.current}
                onFilterChange={processFilterChange}
                defaultValue={filter}
                viewConfig={viewConfig}
              />
            </div>
          )}

          {/* Data bar - full width above table */}
          <div className={styles.dataBar}>
            {tabulatorRef.current?.table?.getHeaderFilters()?.length > 0 ? (
              fetchAllMatchingRecords ? (
                <b className={styles.totalCount}><i className={`fas fa-clone ${styles.totalIcon}`}></i> Total matching records: {totalRecs}</b>
              ) : (
                moreMatchingDocs ? (
                  <b className={styles.totalCount}><i className={`fas fa-clone ${styles.totalIcon}`}></i> Top matching records: {totalRecs - 1}+</b>
                ) : (
                  <b className={styles.totalCount}><i className={`fas fa-clone ${styles.totalIcon}`}></i> Top matching records: {totalRecs}</b>
                )
              )
            ) : (
              <b className={styles.totalCount}><i className={`fas fa-clone ${styles.totalIcon}`}></i> Total records: {totalRecs}</b>
            )}
            
            {tabulatorRef.current?.table?.getHeaderFilters()?.length > 0 && (
              <>
                <span>|</span>
                <button className="btn btn-link" onClick={toggleFetchAllRecords}>
                  <i className='fa fa-download'></i>
                  {fetchAllMatchingRecords ? 'Fetch top matches only' : 'Fetch all matches'}
                </button>
              </>
            )}
            <span>|</span>
            {displayConnectedStatus()}
            <button className="btn btn-link" onClick={() => tabulatorRef.current?.table?.setData()}>
              <i className='fas fa-redo'></i><b className={styles.refreshLabel}>Refresh</b>
            </button>
          </div>
        </Col>
      </Row>
      <Row>
        <Col>
          {initialUrlProcessed && (
          <MyTabulator
            innerref={(ref) => (tabulatorRef.current = ref)}
            columns={columns}
            data={[]}
            options={{
              //layout: 'fitDataStretch',
              //scrollbarTop: false,
              pagination: 'remote',
              paginationSize: pageSize,
              paginationSizeSelector: [5, 10, 25, 30, 50, 100, 500, 1000, 2000, 5000, true],
              virtualDom: false,
              chronology: chronologyDescending ? 'desc' : 'asc', // Triggers shouldComponentUpdate
              cellClick: cellClickEvents,
              cellDblClick: cellClickEvents,
              forceRefresh: forceRefresh, // Triggers shouldComponentUpdate
              currentTheme: currentTheme, // Triggers shouldComponentUpdate on theme change
              _id: _id, // Triggers shouldComponentUpdate when single-row mode changes
              ajaxURL: `${API_URL}/ds/view/${dsName}/${dsView}/${userId}${_id ? `/${_id}` : ''}`,
              ajaxURLGenerator: ajaxURLGenerator,
              ajaxResponse: ajaxResponse,
              ajaxConfig: {
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include'
              },
              paginationDataSent: {
                page: 'page',
                size: 'per_page'
              },
              paginationDataReceived: {
                last_page: 'total_pages'
              },
              ajaxError: (error) => {
                console.error('ajaxError', error);
              },
              ajaxSorting: true,
              ajaxFiltering: true,
              // Apply saved filter header filters
              initialHeaderFilter: initialHeaderFilter,
              // Apply saved filter sort order
              initialSort: initialSort,
              headerSortTristate:true,
              // Row formatter to style unsaved rows (no _id) with different background
              // Reference: DsView.js lines 1962-1968
              // Uses CSS variables to match current theme with accent color for contrast
              rowFormatter: (row) => {
                const rootStyles = getComputedStyle(document.documentElement);
                const rowElement = row.getElement();
                const rowData = row.getData();
                
                if (!rowData._id) {
                  // New unsaved row - use accent color with transparency + left border for high visibility
                  const accentColor = rootStyles.getPropertyValue('--color-accent').trim();
                  rowElement.style.backgroundColor = `${accentColor}22`; // 22 = ~13% opacity in hex
                  rowElement.style.borderLeft = `4px solid ${accentColor}`;
                } else {
                  // Saved row - clear inline styles to use normal CSS styling (odd/even row colors)
                  rowElement.style.backgroundColor = '';
                  rowElement.style.borderLeft = '';
                }
              },
              // Track manual column resizes to prevent conflicts with filter column widths
              columnResized: handleColumnResized,
              // Row added callback - preserve scroll when adding rows locally (duplicate, etc.)
              rowAdded: (row) => {
                console.log('[rowAdded] Row added, current scroll:', scrollPositionBeforeLoadRef.current);
                const savedPosition = scrollPositionBeforeLoadRef.current;
                
                if (!savedPosition) return;
                
                // Restore window scroll position FIRST
                if (savedPosition.windowScrollY !== undefined || savedPosition.windowScrollX !== undefined) {
                  console.log('[rowAdded] Restoring WINDOW scroll to:', savedPosition.windowScrollY, savedPosition.windowScrollX);
                  window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
                }
                
                // Then restore table internal scroll position
                const table = tabulatorRef.current?.table;
                if (table && table.rowManager?.element && (savedPosition.top > 0 || savedPosition.left > 0)) {
                  const rowManagerElement = table.rowManager.element;
                  console.log('[rowAdded] Restoring TABLE scroll to:', savedPosition.top, savedPosition.left);
                  rowManagerElement.scrollTop = savedPosition.top;
                  rowManagerElement.scrollLeft = savedPosition.left;
                }
              },
              // Row deleted callback - preserve scroll when deleting rows
              rowDeleted: (row) => {
                console.log('[rowDeleted] Row deleted, current scroll:', scrollPositionBeforeLoadRef.current);
                const savedPosition = scrollPositionBeforeLoadRef.current;
                
                if (!savedPosition) return;
                
                // Restore window scroll position FIRST
                if (savedPosition.windowScrollY !== undefined || savedPosition.windowScrollX !== undefined) {
                  console.log('[rowDeleted] Restoring WINDOW scroll to:', savedPosition.windowScrollY, savedPosition.windowScrollX);
                  window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
                }
                
                // Then restore table internal scroll position
                const table = tabulatorRef.current?.table;
                if (table && table.rowManager?.element && (savedPosition.top > 0 || savedPosition.left > 0)) {
                  const rowManagerElement = table.rowManager.element;
                  console.log('[rowDeleted] Restoring TABLE scroll to:', savedPosition.top, savedPosition.left);
                  rowManagerElement.scrollTop = savedPosition.top;
                  rowManagerElement.scrollLeft = savedPosition.left;
                }
              },
              // Render complete callback for post-render processing
              // Reference: DsView.js line 1982 (renderComplete: this.renderComplete)
              renderComplete: handleRenderComplete,
              // Page loaded callback to reapply badges when pagination changes
              pageLoaded: handlePageLoaded,
              // Page size changed callback to track user changes
              pageSizeChanged: handlePaginationPageSizeChanged,
              // ═════════════════════════════════════════════════════════════════════════
              // SCROLL PRESERVATION: AJAX REQUEST/RESPONSE CALLBACKS
              // ═════════════════════════════════════════════════════════════════════════
              // These callbacks work together to preserve scroll position during AJAX
              // operations (filtering, sorting, pagination). Critical for maximized windows.
              //
              // TIMING:
              //   ajaxRequesting → AJAX call → server response → dataLoaded
              //                                                ↓
              //                                    React re-renders (6x for handlers)
              //                                                ↓
              //                                    Scroll restoration (now + deferred)
              //
              // WHY TWO RESTORATIONS?
              //   1. Immediate: Gets scroll back ASAP (before React re-renders)
              //   2. Deferred (setTimeout 0): After React finishes handler recreations
              //
              // NOTE: React recreates handlers 6 times during filter operations, so we
              // restore scroll both immediately and after call stack clears.
              // ═════════════════════════════════════════════════════════════════════════

              // Ajax requesting callback - capture scroll position before any AJAX request
              // This catches filter changes, sorting, pagination, etc.
              ajaxRequesting: () => {
                const table = tabulatorRef.current?.table;
                if (table && table.rowManager?.element) {
                  scrollPositionBeforeLoadRef.current = {
                    top: table.rowManager.element.scrollTop,
                    left: table.rowManager.element.scrollLeft,
                    windowScrollY: window.scrollY,
                    windowScrollX: window.scrollX
                  };
                  console.log('[AJAX] Captured scroll positions:', scrollPositionBeforeLoadRef.current);
                }
              },
              // Data loaded callback - restore scroll position and re-request active locks
              // This ensures scroll position stays the same after filter changes
              dataLoaded: (data) => {
                requestActiveLocks();
                
                const savedPosition = scrollPositionBeforeLoadRef.current;
                
                if (savedPosition) {
                  console.log('[AJAX] Restoring scroll positions:', savedPosition);
                  
                  // Restore window scroll position after React has finished all updates
                  // Use setTimeout with 0ms to defer until after current call stack clears
                  // This ensures restoration happens after handler recreations and re-renders
                  if (savedPosition.windowScrollY !== undefined || savedPosition.windowScrollX !== undefined) {
                    // Immediate restoration (may be overwritten by React)
                    window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
                    
                    // Deferred restoration after call stack clears and React updates settle
                    setTimeout(() => {
                      window.scrollTo(savedPosition.windowScrollX || 0, savedPosition.windowScrollY || 0);
                    }, 0);
                  }
                }
                
                // Restore table internal scroll position
                const table = tabulatorRef.current?.table;
                if (table && table.rowManager?.element && savedPosition) {
                  const rowManagerElement = table.rowManager.element;
                  
                  if (savedPosition.top > 0 || savedPosition.left > 0) {
                    // Disable smooth scrolling temporarily
                    const originalScrollBehavior = rowManagerElement.style.scrollBehavior;
                    rowManagerElement.style.scrollBehavior = 'auto';
                    
                    // Restore immediately (synchronous)
                    rowManagerElement.scrollTop = savedPosition.top;
                    rowManagerElement.scrollLeft = savedPosition.left;
                    
                    // Also restore after initial render (backup)
                    requestAnimationFrame(() => {
                      if (rowManagerElement) {
                        rowManagerElement.scrollTop = savedPosition.top;
                        rowManagerElement.scrollLeft = savedPosition.left;
                        rowManagerElement.style.scrollBehavior = originalScrollBehavior;
                      }
                    });
                  }
                }
              },
              // Enable clipboard export module for copy-to-clipboard functionality
              // Reference: DsView.js lines 1948-1960
              clipboard: "fullTableCopyOnly",
              clipboardCopyFormatter: (type, output) => {
                if (type === 'html' && clipboardHelpers.current) {
                  output = clipboardHelpers.current.fixImgSizeForClipboard(output);
                  
                  // Style table headers with green background
                  output = output.replaceAll('<th>', '<th style="border: 1px solid #ddd; padding: 8px; padding-top: 12px; padding-bottom: 12px; text-align: left; background-color: darkgreen;color: white;">');
                  
                  // Style table cells with borders
                  output = output.replaceAll('<td>', '<td style="border: 1px solid #ddd; padding: 8px;">');
                  
                  // Process code blocks - match the full <pre> structure and rebuild with proper formatting
                  // Original structure: <pre class="code-badge-pre"><div class="code-badge">...<div class="code-badge-language">LANG</div>...<copy icon>...</div><code class="hljs">CODE</code></pre>
                  output = output.replace(/<pre class="code-badge-pre">\s*<div class="code-badge">[\s\S]*?<div class="code-badge-language"\s*>(.*?)<\/div>[\s\S]*?<\/div>\s*(<code[^>]*>[\s\S]*?<\/code>)\s*<\/pre>/gi, 
                    function(match, lang, codeBlock) {
                      // Keep the entire code block with its tags and content to preserve formatting
                      // Use display:inline-block to fit content width, white-space:pre to preserve formatting
                      return '<div style="display: inline-block; border: 2px solid #999; border-radius: 4px; padding: 12px; margin: 8px 0; background: #fdf6e3;">' +
                             '<pre style="margin: 0; padding: 0; font-family: \'Courier New\', monospace; font-size: 12px; white-space: pre; background: transparent; color: #657b83;">' +
                             codeBlock +
                             '</pre></div>';
                    });
                  
                  // Style the code tag to ensure proper display
                  output = output.replace(/<code class="hljs">/gi, '<code class="hljs" style="display: block; padding: 0; background: transparent; color: #657b83; font-family: inherit; font-size: inherit; white-space: pre;">');
                  
                  // Apply colors to syntax highlighting classes (Solarized Light theme)
                  output = output.replace(/<span class="hljs-keyword">/gi, '<span class="hljs-keyword" style="color: #859900;">');
                  output = output.replace(/<span class="hljs-selector-tag">/gi, '<span class="hljs-selector-tag" style="color: #859900;">');
                  output = output.replace(/<span class="hljs-addition">/gi, '<span class="hljs-addition" style="color: #859900;">');
                  output = output.replace(/<span class="hljs-number">/gi, '<span class="hljs-number" style="color: #2aa198;">');
                  output = output.replace(/<span class="hljs-string">/gi, '<span class="hljs-string" style="color: #2aa198;">');
                  output = output.replace(/<span class="hljs-literal">/gi, '<span class="hljs-literal" style="color: #2aa198;">');
                  output = output.replace(/<span class="hljs-doctag">/gi, '<span class="hljs-doctag" style="color: #2aa198;">');
                  output = output.replace(/<span class="hljs-regexp">/gi, '<span class="hljs-regexp" style="color: #2aa198;">');
                  output = output.replace(/<span class="hljs-title">/gi, '<span class="hljs-title" style="color: #268bd2;">');
                  output = output.replace(/<span class="hljs-section">/gi, '<span class="hljs-section" style="color: #268bd2;">');
                  output = output.replace(/<span class="hljs-name">/gi, '<span class="hljs-name" style="color: #268bd2;">');
                  output = output.replace(/<span class="hljs-selector-id">/gi, '<span class="hljs-selector-id" style="color: #268bd2;">');
                  output = output.replace(/<span class="hljs-selector-class">/gi, '<span class="hljs-selector-class" style="color: #268bd2;">');
                  output = output.replace(/<span class="hljs-attribute">/gi, '<span class="hljs-attribute" style="color: #b58900;">');
                  output = output.replace(/<span class="hljs-attr">/gi, '<span class="hljs-attr" style="color: #b58900;">');
                  output = output.replace(/<span class="hljs-variable">/gi, '<span class="hljs-variable" style="color: #b58900;">');
                  output = output.replace(/<span class="hljs-template-variable">/gi, '<span class="hljs-template-variable" style="color: #b58900;">');
                  output = output.replace(/<span class="hljs-type">/gi, '<span class="hljs-type" style="color: #b58900;">');
                  output = output.replace(/<span class="hljs-symbol">/gi, '<span class="hljs-symbol" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-bullet">/gi, '<span class="hljs-bullet" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-subst">/gi, '<span class="hljs-subst" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-meta">/gi, '<span class="hljs-meta" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-selector-attr">/gi, '<span class="hljs-selector-attr" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-selector-pseudo">/gi, '<span class="hljs-selector-pseudo" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-link">/gi, '<span class="hljs-link" style="color: #cb4b16;">');
                  output = output.replace(/<span class="hljs-built_in">/gi, '<span class="hljs-built_in" style="color: #dc322f;">');
                  output = output.replace(/<span class="hljs-deletion">/gi, '<span class="hljs-deletion" style="color: #dc322f;">');
                  output = output.replace(/<span class="hljs-comment">/gi, '<span class="hljs-comment" style="color: #93a1a1;">');
                  output = output.replace(/<span class="hljs-quote">/gi, '<span class="hljs-quote" style="color: #93a1a1;">');
                }
                return output;
              },
            }}
            cellEditing={handleCellEditing}
            cellEdited={handleCellEdited}
            cellEditCancelled={handleCellEditCancelled}
          />
          )}

          {/* Notification */}
          <Notification
            show={showNotification}
            type={notificationType}
            message={notificationMessage}
            onClose={() => setShowNotification(false)}
            autoHideDuration={3000}
          />

          {/* Description Editor Modal */}
          <DescriptionEditorModal
            show={isEditingDescription}
            initialValue={freshViewConfig?.dsDescription?.dsDescription || ''}
            onSave={handleSaveDescription}
            onCancel={handleCancelDescriptionEditor}
            isLoading={isLoadingFreshConfig}
            isSaving={isSavingDescription}
          />

          {/* Confirmation Modal */}
          {showModal && (
            <Modal
              show={true}
              title={modalTitle}
              ok={modalOk}
              cancel={modalCancel}
              onClose={(confirmed) => {
                if (confirmed && modalCallback) {
                  modalCallback();
                } else {
                  setShowModal(false);
                }
              }}
            >
              {modalQuestion}
            </Modal>
          )}

          {/* Add Column Modal */}
          {showAddColumnModal && (
            <Modal
              show={true}
              title="Add Column"
              ok="Add"
              cancel="Cancel"
              okDisabled={addColumnProcessing}
              onClose={(confirmed) => {
                if (confirmed) {
                  addColumnHandler();
                } else {
                  setShowAddColumnModal(false);
                }
              }}
            >
              <AddColumnForm
                columnName={newColumnName}
                position={addColumnPosition}
                error={addColumnError}
                onColumnNameChange={setNewColumnName}
                onPositionChange={setAddColumnPosition}
              />
            </Modal>
          )}

          {/* Table Attributes Modal */}
          {showTableAttributesModal && (
            <Modal
              show={true}
              title="Edit Table Attributes"
              ok="Save"
              cancel="Cancel"
              okDisabled={tableAttrsSaving || tableAttrsLoading}
              onClose={(confirmed) => {
                if (confirmed) {
                  saveTableAttributesHandler();
                } else {
                  setShowTableAttributesModal(false);
                  setTableAttrsError('');
                }
              }}
            >
              <div style={{ padding: '10px' }}>
                {tableAttrsLoading && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <span>Loading attributes...</span>
                  </div>
                )}
                
                {!tableAttrsLoading && (
                  <>
                    {tableAttrsError && (
                      <div style={{ 
                        color: 'red', 
                        marginBottom: '15px', 
                        padding: '8px', 
                        border: '1px solid red', 
                        borderRadius: '4px',
                        backgroundColor: '#ffebee'
                      }}>
                        {tableAttrsError}
                      </div>
                    )}
                    
                    {/* Fixed Height */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tableAttrsFixedHeight}
                          onChange={(e) => setTableAttrsFixedHeight(e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        <span>Fixed Height</span>
                      </label>
                      <div style={{ fontSize: '0.85em', color: '#666', marginLeft: '24px' }}>
                        Enable fixed table height for better viewing experience
                      </div>
                    </div>
                    
                    {/* Row Max Height */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tableAttrsRowMaxHeightEnabled}
                          onChange={(e) => setTableAttrsRowMaxHeightEnabled(e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        <span>Row Max Height</span>
                      </label>
                      {tableAttrsRowMaxHeightEnabled && (
                        <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                          <input
                            type="number"
                            value={tableAttrsRowMaxHeight}
                            onChange={(e) => setTableAttrsRowMaxHeight(e.target.value)}
                            style={{ 
                              width: '100px', 
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '4px'
                            }}
                            min="1"
                          />
                          <span style={{ marginLeft: '8px', fontSize: '0.85em', color: '#666' }}>
                            Maximum height for rows in pixels
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Row Height */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tableAttrsRowHeightEnabled}
                          onChange={(e) => setTableAttrsRowHeightEnabled(e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        <span>Row Height</span>
                      </label>
                      {tableAttrsRowHeightEnabled && (
                        <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                          <input
                            type="number"
                            value={tableAttrsRowHeight}
                            onChange={(e) => setTableAttrsRowHeight(e.target.value)}
                            style={{ 
                              width: '100px', 
                              padding: '4px 8px',
                              border: '1px solid #ccc',
                              borderRadius: '4px'
                            }}
                            min="1"
                          />
                          <span style={{ marginLeft: '8px', fontSize: '0.85em', color: '#666' }}>
                            Default height for rows in pixels
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Modal>
          )}

          {/* TODO: Add ModalEditor */}
          {/* TODO: Add JiraForm */}
          {/* TODO: Add ColorPicker */}
        </Col>
      </Row>
    </div>
  );
}

export default DsViewPage;
