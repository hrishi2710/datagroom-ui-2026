import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Form, Button } from 'react-bootstrap';
import { useAuth } from '../../auth/AuthProvider';
import MyTabulator from '../../components/MyTabulator';
import styles from '../DsView/DsViewPage.module.css';
import Select from 'react-select';
import { validateExpr } from '../../components/editors/QueryParsers';
import AccessCtrl from './components/AccessCtrl';
import PerRowAccessCtrl from './components/PerRowAccessCtrl';

import '../DsView/DsViewSimple.css';
import '../DsView/solarized-light.css';
import '../DsView/simpleStyles.css';

// API base URL configuration
const BASE = import.meta.env.VITE_API_BASE || '';
const API_URL = BASE;

/**
 * DsViewEditPage - Configuration interface for editing dataset view definitions
 * Reference: reference/common/routes/home/DsViewEdit.js
 * 
 * Features:
 * - Configure column editors (line, paragraph, codemirror, autocomplete, date)
 * - Configure column formatters (plaintext, textarea, markdown)
 * - Configure header filters and alignment
 * - Manage autocomplete values and conditional values
 * - Configure conditional formatting
 * - Set dataset description
 * - Configure JIRA integration (JQL queries, field mapping)
 * - Configure JIRA Agile integration (board ID, label, field mapping)
 * - Configure access control lists (ACL)
 * - Configure per-row access control
 * - Preview table with current data (read-only)
 * - Save all configurations to server
 */
function DsViewEditPage() {
  const { dsName, dsView } = useParams();
  const auth = useAuth();
  const userId = auth.userId;

  // State management
  const [viewData, setViewData] = useState(null);
  const [dsDescription, setDsDescription] = useState("");
  const [jiraProjectNameEnabled, setJiraProjectNameEnabled] = useState(false);
  const [jiraProjectName, setJiraProjectName] = useState("");
  const [jira, setJira] = useState(false);
  const [jql, setJql] = useState("");
  const [jiraFieldMapping, setJiraFieldMapping] = useState('# Jira keys: "key", "summary", "type", "assignee", "severity", "priority", "reporter", "foundInRls", "created", "rrtTargetRls", "targetRls", "status", "feature", "rzFeature", "versions", "parentKey", "parentSummary", "parent", "subtasks", "subtasksDetails", "dependsLinks", "implementLinks", "packageLinks", "relatesLinks", "testLinks", "coversLinks", "defectLinks", "automatesLinks", "updated", "votes", "systemFeature", "labels", "epic", "description", "Story Points", "Sprint Name", "jiraSummary", "fixVersions", "Agile Commit", "duedate", "targetRlsGx", "Assignee Manager", "Dev RCA Comments", "Agile Team", "Phase Bug Found", "Phase Bug Introduced", "Failure Category", "Failure Subcategory", "Improvement Suggestions", "Root Cause or Defect Category", "Resolution", "Resolution Details", "Notes"\n\n');
  const [jiraAgile, setJiraAgile] = useState(false);
  const [jiraAgileLabel, setJiraAgileLabel] = useState("");
  const [jiraAgileBoardId, setJiraAgileBoardId] = useState(0);
  const [jiraAgileFieldMapping, setJiraAgileFieldMapping] = useState('# Jira keys: "key", "summary", "type", "assignee", "severity", "priority", "reporter", "foundInRls", "created", "rrtTargetRls", "targetRls", "status", "feature", "rzFeature", "versions", "parentKey", "parentSummary", "parent", "subtasks", "subtasksDetails", "dependsLinks", "implementLinks", "packageLinks", "relatesLinks", "testLinks", "coversLinks", "defectLinks", "automatesLinks", "updated", "votes", "systemFeature", "labels", "epic", "description", "Story Points", "Sprint Name", "jiraSummary", "fixVersions", "Agile Commit", "duedate", "targetRlsGx", "Acceptance Criteria", "Agile Team", "Phase Bug Found", "Phase Bug Introduced", "Failure Category", "Failure Subcategory", "Improvement Suggestions", "Root Cause or Defect Category", "Resolution", "Resolution Details", "Notes"\n\n');
  const [fixedHeight, setFixedHeight] = useState(false);
  const [aclConfig, setAclConfig] = useState(null);
  const [perRowAccessConfig, setPerRowAccessConfig] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [setViewStatus, setSetViewStatus] = useState('');
  const [somethingChanged, setSomethingChanged] = useState(0);
  const [forceRender, setForceRender] = useState(0);
  const [widths, setWidths] = useState({});
  const [tableColumns, setTableColumns] = useState([]);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });
  
  const tabulatorRef = useRef(null);
  const editorsRef = useRef({});
  const debounceTimersRef = useRef({});
  const saveTimerRef = useRef(null);

  // Set document title
  useEffect(() => {
    document.title = `Edit-view: ${dsName}`;
  }, [dsName]);

  // Listen for theme changes
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'theme') {
        setCurrentTheme(e.newValue || 'light');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Also check for theme changes via polling (for same-window changes)
    const interval = setInterval(() => {
      const theme = localStorage.getItem('theme') || 'light';
      setCurrentTheme(prev => prev !== theme ? theme : prev);
    }, 500);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Load column definitions from server
  const loadColumns = async () => {
    try {
      const response = await fetch(`${API_URL}/ds/view/columns/${dsName}/${dsView}/${userId}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load columns: ${response.statusText}`);
      }
      
      const data = await response.json();
      setViewData(data);
      
      // Initialize editors map
      if (data.columnAttrs) {
        const editors = {};
        data.columnAttrs.forEach(col => {
          editors[col.field] = col.editor;
        });
        editorsRef.current = editors;
      }
      
      setDataLoaded(true);
    } catch (error) {
      console.error('Error loading columns:', error);
      setSetViewStatus(`Error loading columns: ${error.message}`);
    }
  };

  // Load column definitions on mount
  useEffect(() => {
    loadColumns();
  }, [dsName, dsView, userId]);

  // Initialize state from loaded data - run only once when data is loaded
  useEffect(() => {
    if (!viewData || !dataLoaded) return;

    // Initialize dsDescription
    if (viewData.dsDescription?.dsDescription) {
      setDsDescription(viewData.dsDescription.dsDescription);
    }

    // Initialize JIRA project name
    if (viewData.jiraProjectName) {
      setJiraProjectNameEnabled(true);
      setJiraProjectName(viewData.jiraProjectName);
    }

    // Initialize JIRA config
    if (viewData.jiraConfig) {
      let mapping = '# Jira keys: "key", "summary", "type", "assignee", "severity", "priority", "reporter", "foundInRls", "created", "rrtTargetRls", "targetRls", "status", "feature", "rzFeature", "versions", "parentKey", "parentSummary", "parent", "subtasks", "subtasksDetails", "dependsLinks", "implementLinks", "packageLinks", "relatesLinks", "testLinks", "coversLinks", "defectLinks", "automatesLinks", "updated", "votes", "systemFeature", "labels", "epic", "description", "Story Points", "Sprint Name", "jiraSummary", "fixVersions", "Agile Commit", "duedate", "targetRlsGx", "Assignee Manager", "Dev RCA Comments", "Agile Team", "Phase Bug Found", "Phase Bug Introduced", "Failure Category", "Failure Subcategory", "Improvement Suggestions", "Root Cause or Defect Category", "Resolution", "Resolution Details", "Notes"\n\n';
      for (let key in viewData.jiraConfig.jiraFieldMapping) {
        mapping += `"${key}" -> "${viewData.jiraConfig.jiraFieldMapping[key]}"\n`;
      }
      setJira(viewData.jiraConfig.jira);
      setJql(viewData.jiraConfig.jql);
      setJiraFieldMapping(mapping);
    }

    // Initialize JIRA Agile config
    if (viewData.jiraAgileConfig) {
      let mapping = '# Jira keys: "key", "summary", "type", "assignee", "severity", "priority", "reporter", "foundInRls", "created", "rrtTargetRls", "targetRls", "status", "feature", "rzFeature", "versions", "parentKey", "parentSummary", "parent", "subtasks", "subtasksDetails", "dependsLinks", "implementLinks", "packageLinks", "relatesLinks", "testLinks", "coversLinks", "defectLinks", "automatesLinks", "updated", "votes", "systemFeature", "labels", "epic", "description", "Story Points", "Sprint Name", "jiraSummary", "fixVersions", "Agile Commit", "duedate", "targetRlsGx", "Acceptance Criteria", "Agile Team", "Phase Bug Found", "Phase Bug Introduced", "Failure Category", "Failure Subcategory", "Improvement Suggestions", "Root Cause or Defect Category", "Resolution", "Resolution Details", "Notes"\n\n';
      for (let key in viewData.jiraAgileConfig.jiraFieldMapping) {
        mapping += `"${key}" -> "${viewData.jiraAgileConfig.jiraFieldMapping[key]}"\n`;
      }
      setJiraAgile(viewData.jiraAgileConfig.jira);
      setJiraAgileLabel(viewData.jiraAgileConfig.label);
      setJiraAgileBoardId(viewData.jiraAgileConfig.boardId);
      setJiraAgileFieldMapping(mapping);
    }

    // Initialize fixed height
    if (viewData.otherTableAttrs?.fixedHeight) {
      setFixedHeight(viewData.otherTableAttrs.fixedHeight);
    }

    // Initialize ACL config
    if (aclConfig === null && viewData.aclConfig) {
      let acl = "";
      if (typeof viewData.aclConfig.acl === "string") {
        acl = viewData.aclConfig.acl;
      } else if (Array.isArray(viewData.aclConfig.acl)) {
        acl = viewData.aclConfig.acl.join(", ");
      }
      setAclConfig({
        accessCtrl: viewData.aclConfig.accessCtrl,
        acl: acl
      });
    }

    // Initialize per-row access config
    if (viewData.perRowAccessConfig) {
      setPerRowAccessConfig({
        enabled: viewData.perRowAccessConfig.enabled,
        column: viewData.perRowAccessConfig.column
      });
    }
  }, [viewData, dataLoaded]);

  // Create initial table columns when view data loads
  useEffect(() => {
    if (!viewData?.columnAttrs) return;

    const columns = viewData.columnAttrs.map(col => {
      const colCopy = JSON.parse(JSON.stringify(col));
      
      // Set header menu based on whether it's a key column
      const isKeyCol = viewData.keys?.includes(colCopy.field);
      colCopy.headerMenu = isKeyCol ? getHeaderMenuWithoutHide() : getHeaderMenuWithHide();
      
      // Store original editor type
      if (!editorsRef.current[colCopy.field]) {
        editorsRef.current[colCopy.field] = colCopy.editor;
      }
      
      // Convert codemirror/date to textarea for display
      if (colCopy.editor === "codemirror" || colCopy.editor === "date") {
        colCopy.editor = "textarea";
      }
      
      // Make table read-only
      colCopy.editable = () => false;
      
      return colCopy;
    });

    setTableColumns(columns);
  }, [viewData]);

  // Update table columns when configuration changes
  useEffect(() => {
    if (!viewData?.columnAttrs || !tabulatorRef.current || somethingChanged === 0) return;

    const columns = viewData.columnAttrs.map(col => {
      const colCopy = JSON.parse(JSON.stringify(col));
      
      // Set header menu based on whether it's a key column
      const isKeyCol = viewData.keys?.includes(colCopy.field);
      colCopy.headerMenu = isKeyCol ? getHeaderMenuWithoutHide() : getHeaderMenuWithHide();
      
      // Store original editor type
      if (!editorsRef.current[colCopy.field]) {
        editorsRef.current[colCopy.field] = colCopy.editor;
      }
      
      // Convert codemirror/date to textarea for display
      if (colCopy.editor === "codemirror" || colCopy.editor === "date") {
        colCopy.editor = "textarea";
      }
      
      // Make table read-only
      colCopy.editable = () => false;
      
      return colCopy;
    });

    setTableColumns(columns);
  }, [somethingChanged]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // Clear all debounce timers
      Object.values(debounceTimersRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  const getHeaderMenuWithoutHide = () => [
    { label: "Toggle Filters", action: toggleSingleFilter },
    { label: "Set Editor to 'line'", action: (e, col) => setEditor(col, 'line') },
    { label: "Set Editor to 'paragraph'", action: (e, col) => setEditor(col, 'paragraph') },
    { label: "Disable editing", action: (e, col) => setEditor(col, false) },
    { label: "Set Formatter to 'line'", action: (e, col) => setFormatter(col, 'plaintext') },
    { label: "Set Formatter to 'paragraph'", action: (e, col) => setFormatter(col, 'textarea') },
    { label: "Set header filter type to number", action: (e, col) => setHdrFilterType(col, 'number') },
    { label: "Set header filter type to text", action: (e, col) => setHdrFilterType(col, 'input') },
    { label: "Plus 50 to column width", action: plusFiftyToWidth },
  ];

  const getHeaderMenuWithHide = () => [
    { label: "Toggle Filters", action: toggleSingleFilter },
    { label: "Set Editor to 'line'", action: (e, col) => setEditor(col, 'line') },
    { label: "Set Editor to 'paragraph'", action: (e, col) => setEditor(col, 'paragraph') },
    { label: "Disable editing", action: (e, col) => setEditor(col, false) },
    { label: "Set Formatter to 'line'", action: (e, col) => setFormatter(col, 'plaintext') },
    { label: "Set Formatter to 'paragraph'", action: (e, col) => setFormatter(col, 'textarea') },
    { label: "<i class='fas fa-eye-slash'></i> Hide Column", action: hideColumn },
    { label: "Set header filter type to number", action: (e, col) => setHdrFilterType(col, 'number') },
    { label: "Set header filter type to text", action: (e, col) => setHdrFilterType(col, 'input') },
    { label: "Plus 50 to column width", action: plusFiftyToWidth },
  ];

  const hideColumn = (e, column) => {
    const isKeyCol = viewData?.keys?.includes(column.getField());
    if (!isKeyCol) {
      column.hide();
    }
  };

  const setEditor = (column, editor) => {
    if (!tabulatorRef.current) return;
    
    // Map dropdown values to Tabulator editor strings
    const editorStringMap = {
      'line': 'input',
      'paragraph': 'textarea',
      'codemirror': 'codemirror',
      'autocomplete': 'autocomplete',
      'date': 'date'
    };
    
    const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
    for (let j = 0; j < currentDefs.length; j++) {
      if (currentDefs[j].field === column.getField()) {
        const width = column.getWidth();
        
        // Get the actual editor string from the map
        const actualEditor = editorStringMap[editor] || editor;
        
        // Store original editor type
        editorsRef.current[column.getField()] = actualEditor;
        
        // For display in Tabulator, convert codemirror/date to textarea
        let displayEditor = actualEditor;
        if (actualEditor === "codemirror" || actualEditor === "date") {
          displayEditor = "textarea";
        }
        
        tabulatorRef.current.table.updateColumnDefinition(currentDefs[j].field, { 
          editor: displayEditor,
          width 
        });
        break;
      }
    }
  };

  const setFormatter = (column, formatter) => {
    if (!tabulatorRef.current) return;
    
    const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
    for (let j = 0; j < currentDefs.length; j++) {
      if (currentDefs[j].field === column.getField()) {
        tabulatorRef.current.table.updateColumnDefinition(currentDefs[j].field, { formatter });
        break;
      }
    }
  };

  const setHdrFilterType = (column, headerFilterType) => {
    if (!tabulatorRef.current) return;
    
    const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
    for (let j = 0; j < currentDefs.length; j++) {
      if (currentDefs[j].field === column.getField()) {
        tabulatorRef.current.table.updateColumnDefinition(currentDefs[j].field, { headerFilterType });
        break;
      }
    }
  };

  const setHozAlign = (column, hozAlign) => {
    if (!tabulatorRef.current) return;
    
    const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
    for (let j = 0; j < currentDefs.length; j++) {
      if (currentDefs[j].field === column.getField()) {
        tabulatorRef.current.table.updateColumnDefinition(currentDefs[j].field, { hozAlign });
        break;
      }
    }
  };

  const setVertAlign = (column, vertAlign) => {
    if (!tabulatorRef.current) return;
    
    const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
    for (let j = 0; j < currentDefs.length; j++) {
      if (currentDefs[j].field === column.getField()) {
        tabulatorRef.current.table.updateColumnDefinition(currentDefs[j].field, { vertAlign });
        break;
      }
    }
  };

  const plusFiftyToWidth = (e, column) => {
    const curWidth = column.getWidth();
    column.setWidth(curWidth + 50);
  };

  const toggleSingleFilter = (e, column) => {
    if (!tabulatorRef.current) return;
    
    const currentDefs = tabulatorRef.current.table.getColumnDefinitions();
    for (let j = 0; j < currentDefs.length; j++) {
      if (currentDefs[j].field === column.getField()) {
        const newVal = currentDefs[j].headerFilter === 'input' ? false : 'input';
        currentDefs[j].headerFilter = newVal;
        tabulatorRef.current.table.updateColumnDefinition(currentDefs[j].field, { headerFilter: newVal });
        break;
      }
    }
  };

  const showAllCols = () => {
    if (!tabulatorRef.current) return;
    
    const cols = tabulatorRef.current.table.getColumns();
    for (let i = 0; i < cols.length; i++) {
      if (!cols[i].isVisible()) {
        cols[i].show();
      }
    }
  };

  const renderComplete = () => {
    if (!tabulatorRef.current) return;
    
    const newWidths = {};
    const cols = tabulatorRef.current.table.getColumns();
    for (let i = 0; i < cols.length; i++) {
      newWidths[cols[i].getField()] = cols[i].getWidth();
    }
    setWidths(newWidths);
  };

  const validateAllConditionalExpressions = (filteredDefs) => {
    for (let i = 0; i < filteredDefs.length; i++) {
      const colDef = filteredDefs[i];
      const fieldName = colDef.field;

      // Validate conditional formatting expressions
      if (colDef.formatterParams?.conditionalFormatting && colDef.formatterParams?.conditionalExprs) {
        for (let j = 0; j < colDef.formatterParams.conditionalExprs.length; j++) {
          const exprLine = colDef.formatterParams.conditionalExprs[j];
          const exprStr = exprLine.split('->')[0].trim();
          
          if (exprStr && exprStr.length > 0) {
            const validation = validateExpr(exprStr);
            if (!validation.isValid) {
              const errorMsg = `Invalid expression in ${fieldName} : ${exprStr}`;
              console.log('VALIDATION ERROR:', errorMsg);
              return errorMsg;
            }
          }
        }
      }

      // Validate conditional values expressions (for autocomplete)
      if (colDef.editorParams?.conditionalValues && colDef.editorParams?.conditionalExprs) {
        for (let j = 0; j < colDef.editorParams.conditionalExprs.length; j++) {
          const exprLine = colDef.editorParams.conditionalExprs[j];
          const exprStr = exprLine.split(':')[0].trim();
          
          if (exprStr && exprStr.length > 0) {
            const validation = validateExpr(exprStr);
            if (!validation.isValid) {
              const errorMsg = `Invalid expression in ${fieldName} : ${exprStr}`;
              console.log('VALUES VALIDATION ERROR:', errorMsg);
              return errorMsg;
            }
          }
        }
      }
    }
    
    return null;
  };

  const pushColumnDefs = async () => {
    if (!tabulatorRef.current) return;

    setSetViewStatus('');
    
    let currentDefs = JSON.parse(JSON.stringify(tabulatorRef.current.table.getColumnDefinitions()));
    console.log("currentDefs from tabulator: ", currentDefs);
    
    const cols = tabulatorRef.current.table.getColumns();
    for (let i = 0; i < cols.length; i++) {
      for (let j = 0; j < currentDefs.length; j++) {
        if (currentDefs[j].field === cols[i].getField()) {
          currentDefs[j].width = cols[i].getWidth();
          console.log("Set width: ", currentDefs[j].width);
          break;
        }
      }
    }
    
    // Read header filters
    const hdrFilters = tabulatorRef.current.table.getHeaderFilters();
    for (let i = 0; i < hdrFilters.length; i++) {
      for (let j = 0; j < currentDefs.length; j++) {
        if (currentDefs[j].field === hdrFilters[i].field) {
          currentDefs[j].hdrFilter = hdrFilters[i];
          break;
        }
      }
    }
    
    let filteredDefs = [];
    for (let i = 0; i < currentDefs.length; i++) {
      delete currentDefs[i].headerMenu;
      
      for (let j = 0; j < cols.length; j++) {
        if (currentDefs[i].field === cols[j].getField()) {
          if (!cols[j].isVisible()) {
            currentDefs[i].visible = false;
          } else {
            delete currentDefs[i].visible;
          }
        }
      }
      
      currentDefs[i].editor = editorsRef.current[currentDefs[i].field];
      
      // Remove autocomplete params if not autocomplete
      if (currentDefs[i].editor !== "autocomplete") {
        try {
          delete currentDefs[i].editorParams?.values;
          delete currentDefs[i].editorParams?.showListOnEmpty;
          delete currentDefs[i].editorParams?.allowEmpty;
          delete currentDefs[i].editorParams?.multiselect;
        } catch (e) {}
      }
      
      filteredDefs.push(currentDefs[i]);
    }

    const validationError = validateAllConditionalExpressions(filteredDefs);
    if (validationError) {
      setSetViewStatus(validationError);
      return;
    }

    // Validate JIRA configuration
    const jiraFields = { 
      'key': 1, 'summary': 1, 'type': 1, 'assignee': 1, 'severity': 1, 'priority': 1, 
      'foundInRls': 1, 'reporter': 1, 'created': 1, 'rrtTargetRls': 1, 'targetRls': 1, 
      'status': 1, 'feature': 1, 'rzFeature': 1, 'versions': 1, 'parentKey': 1, 
      'parentSummary': 1, 'parent': 1, 'subtasks': 1, 'subtasksDetails': 1, 
      'dependsLinks': 1, 'implementLinks': 1, 'packageLinks': 1, 'relatesLinks': 1, 
      'testLinks': 1, 'coversLinks': 1, 'defectLinks': 1, 'automatesLinks': 1, 
      'updated': 1, 'votes': 1, 'systemFeature': 1, 'labels': 1, 'phaseBugFound': 1, 
      'phaseBugIntroduced': 1, 'epic': 1, 'description': 1, 'Story Points': 1, 
      'Sprint Name': 1, 'jiraSummary': 1, 'fixVersions': 1, 'Agile Commit': 1, 
      'duedate': 1, 'targetRlsGx': 1, 'Acceptance Criteria': 1, 'Assignee Manager': 1, 
      'Dev RCA Comments': 1, 'Agile Team': 1, 'Phase Bug Found': 1, 
      'Phase Bug Introduced': 1, 'Failure Category': 1, 'Failure Subcategory': 1, 
      'Improvement Suggestions': 1, 'Root Cause or Defect Category': 1, 'Resolution': 1, 
      'Resolution Details': 1, 'Notes': 1 
    };
    
    const dsFields = {};
    for (let i = 0; i < currentDefs.length; i++) {
      dsFields[currentDefs[i].field] = 1;
    }

    const validateMapping = (mapping) => {
      let ret = { status: true, error: '' };
      for (let key in mapping) {
        if (!jiraFields[key]) {
          ret.error = `Unknown Jira key: ${key}`;
          ret.status = false;
          break;
        }
        if (!dsFields[mapping[key]]) {
          ret.error = `Unknown column in data-set: ${mapping[key]}`;
          ret.status = false;
        }
      }
      return ret;
    };

    let jiraFieldMappingObj = {};
    if (jiraFieldMapping) {
      const lines = jiraFieldMapping.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (/^\s*#/.test(line)) continue;
        
        let m = line.match(/^\s*"(.*?)"\s*->\s*"(.*?)"\s*$/);
        if (m && m.length >= 2) {
          jiraFieldMappingObj[m[1]] = m[2];
          continue;
        }
        
        m = line.match(/^\s*'(.*?)'\s*->\s*'(.*?)'\s*$/);
        if (m && m.length >= 2) {
          jiraFieldMappingObj[m[1]] = m[2];
          continue;
        }
      }
      
      const ret = validateMapping(jiraFieldMappingObj);
      console.log("validate ret: ", ret);
      if (!ret.status) {
        setSetViewStatus("Jira validation failed!");
        console.log("Validation failed");
        return;
      }
    }

    let jiraConfig = null;
    if (jira && jql) {
      jiraConfig = {
        jira: true,
        jql: jql,
        jiraFieldMapping: jiraFieldMappingObj
      };
    }

    // JIRA Agile config
    let jiraAgileFieldMappingObj = {};
    if (jiraAgileFieldMapping) {
      const lines = jiraAgileFieldMapping.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (/^\s*#/.test(line)) continue;
        
        let m = line.match(/^\s*"(.*?)"\s*->\s*"(.*?)"\s*$/);
        if (m && m.length >= 2) {
          jiraAgileFieldMappingObj[m[1]] = m[2];
          continue;
        }
        
        m = line.match(/^\s*'(.*?)'\s*->\s*'(.*?)'\s*$/);
        if (m && m.length >= 2) {
          jiraAgileFieldMappingObj[m[1]] = m[2];
          continue;
        }
      }
      
      const ret = validateMapping(jiraAgileFieldMappingObj);
      console.log("validate ret: ", ret);
      if (!ret.status) {
        setSetViewStatus("Jira validation failed!");
        console.log("Validation failed");
        return;
      }
    }

    let jiraAgileConfig = null;
    if (jiraAgile && jiraAgileLabel && jiraAgileBoardId) {
      jiraAgileConfig = {
        jira: true,
        label: jiraAgileLabel,
        boardId: parseInt(jiraAgileBoardId),
        jiraFieldMapping: jiraAgileFieldMappingObj
      };
    }

    const dsDescriptionObj = {
      dsDescription: dsDescription
    };
    
    const otherTableAttrs = {
      fixedHeight: fixedHeight
    };

    let jiraProjectNameValue = null;
    if (jiraProjectNameEnabled && jiraProjectName) {
      jiraProjectNameValue = jiraProjectName;
    }

    console.log("Will push these definitions: ", filteredDefs);

    try {
      const response = await fetch(`${API_URL}/ds/view/setViewDefinitions`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dsName,
          dsView,
          dsUser: userId,
          viewDefs: filteredDefs,
          jiraConfig,
          jiraAgileConfig,
          dsDescription: dsDescriptionObj,
          otherTableAttrs,
          aclConfig,
          jiraProjectName: jiraProjectNameValue,
          perRowAccessConfig
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.status === 'success') {
        setSetViewStatus(`success at ${new Date()}`);
        
        // Clear success message after 2 seconds
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
          setSetViewStatus('');
        }, 2000);

        // Reload view data from server to get updated column definitions
        await loadColumns();
      } else {
        setSetViewStatus(result.message || 'Failed to save view definitions');
      }
    } catch (error) {
      console.error('Error saving view definitions:', error);
      setSetViewStatus(`Error: ${error.message}`);
    }
  };

  const renderSetViewStatus = () => {
    let status = setViewStatus;
    
    if (status) {
      if (status.includes('success')) {
        return <b style={{ color: "green" }}> {status} </b>;
      } else {
        return <b style={{ color: "red" }}> {status} </b>;
      }
    }
    
    return null;
  };

  const handleDebounce = (key, callback, delay = 1000) => {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key]);
    }
    debounceTimersRef.current[key] = setTimeout(() => {
      delete debounceTimersRef.current[key];
      callback();
    }, delay);
  };

  const renderEditorParamsControl = (col) => {
    // Check the actual editor type stored in editorsRef
    const actualEditor = editorsRef.current[col.field] || col.editor;
    
    if (actualEditor === "autocomplete") {
      let valueStr = "";
      let checked = true;
      let condValues = false;
      let condExprStr = "";
      
      // Get editorParams from tabulator if available, otherwise from col
      let editorParams = col.editorParams;
      if (tabulatorRef.current) {
        try {
          const columnDef = tabulatorRef.current.table.getColumn(col.field).getDefinition();
          editorParams = columnDef.editorParams;
        } catch (e) {}
      }
      
      try {
        valueStr = editorParams.values.join(', ');
      } catch (e) {}
      
      try {
        checked = editorParams.multiselect;
      } catch (e) {}
      
      try {
        condValues = editorParams.conditionalValues;
      } catch (e) {}
      
      try {
        condExprStr = editorParams.conditionalExprs.join('\n');
      } catch (e) {}
      
      return (
        <div>
          Values:
          <Form.Control 
            type="text" 
            defaultValue={valueStr} 
            onChange={(event) => {
              const value = event.target.value;
              handleDebounce(col.field, () => {
                if (!value) return;
                if (!tabulatorRef.current) return;
                const valArray = value.split(',').map(v => v.trim());
                const currentEditorParams = editorParams || {};
                const newEditorParams = {
                  ...currentEditorParams,
                  values: valArray,
                  showListOnEmpty: true,
                  allowEmpty: true
                };
                console.log("EditorParams: ", newEditorParams);
                tabulatorRef.current.table.updateColumnDefinition(col.field, { editorParams: newEditorParams });
              });
            }} 
          />
          <Form.Check 
            type="checkbox" 
            label="&nbsp; autocomplete multi" 
            checked={checked} 
            onChange={(event) => {
              if (!tabulatorRef.current) return;
              const isChecked = event.target.checked;
              const curEditorParams = editorParams || {};
              const newEditorParams = {
                ...curEditorParams,
                multiselect: isChecked
              };
              setSomethingChanged(prev => prev + 1);
              tabulatorRef.current.table.updateColumnDefinition(col.field, { editorParams: newEditorParams });
            }}
          />
          <Form.Check 
            type="checkbox" 
            label="&nbsp; autocomplete cond-values" 
            checked={condValues} 
            onChange={(event) => {
              if (!tabulatorRef.current) return;
              const isChecked = event.target.checked;
              const curEditorParams = editorParams || {};
              const newEditorParams = {
                ...curEditorParams,
                conditionalValues: isChecked
              };
              setSomethingChanged(prev => prev + 1);
              tabulatorRef.current.table.updateColumnDefinition(col.field, { editorParams: newEditorParams });
            }}
          />
          {condValues && (
            <Form.Control 
              as="textarea" 
              rows="3" 
              defaultValue={condExprStr} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce(col.field, () => {
                  if (!value) return;
                  if (!tabulatorRef.current) return;
                  let condExprs = value.split('\n').map(v => v.trim());
                  condExprs = condExprs.filter(v => v !== "");
                  const curEditorParams = editorParams || {};
                  const newEditorParams = {
                    ...curEditorParams,
                    conditionalExprs: condExprs,
                    showListOnEmpty: true,
                    allowEmpty: true
                  };
                  tabulatorRef.current.table.updateColumnDefinition(col.field, { editorParams: newEditorParams });
                });
              }} 
            />
          )}
        </div>
      );
    }
    
    return null;
  };

  const renderColumnAttributes = () => {
    if (!viewData?.columnAttrs) {
      return null;
    }
    
    // forceRender is used here just to trigger re-render when needed
    // eslint-disable-next-line no-unused-vars
    const _ = forceRender;

    const editorOptions = [
      { value: 'line', label: 'line' },
      { value: 'paragraph', label: 'paragraph' },
      { value: 'codemirror', label: 'codemirror' },
      { value: 'autocomplete', label: 'autocomplete' },
      { value: 'date', label: 'date' }
    ];

    const filterOptions = [
      { value: 'number', label: 'number' },
      { value: 'input', label: 'text' }
    ];

    const hozAlignOptions = [
      { value: 'left', label: 'left' },
      { value: 'center', label: 'center' },
      { value: 'right', label: 'right' }
    ];

    const vertAlignOptions = [
      { value: 'top', label: 'top' },
      { value: 'middle', label: 'middle' },
      { value: 'bottom', label: 'bottom' }
    ];

    return (
      <>
        <Row>
          <Col md={2} sm={2} xs={2}>
            <b>Column Attributes: </b>
          </Col>
        </Row>
        <br />
        {viewData.columnAttrs.map((col, index) => {
          // Get column definition from tabulator if available, otherwise use col data
          let columnDef = col;
          if (tabulatorRef.current) {
            try {
              columnDef = tabulatorRef.current.table.getColumn(col.field).getDefinition();
            } catch (e) {
              console.log('Column not yet in tabulator:', col.field);
            }
          }
          
          // Use editorsRef to get the current actual editor type
          const actualEditor = editorsRef.current[col.field] || col.editor;
          
          let editorCurVal = {};
          if (actualEditor === "textarea") editorCurVal = editorOptions[1];
          else if (actualEditor === "input") editorCurVal = editorOptions[0];
          else if (actualEditor === "autocomplete") editorCurVal = editorOptions[3];
          else if (actualEditor === "codemirror") editorCurVal = editorOptions[2];
          else if (actualEditor === "date") editorCurVal = editorOptions[4];

          let hdrFilterTypeCurVal = {};
          if (col.headerFilterType === "input") hdrFilterTypeCurVal = filterOptions[1];
          else if (col.headerFilterType === "number") hdrFilterTypeCurVal = filterOptions[0];

          let hozAlignCurVal = {};
          if (col.hozAlign === 'left') hozAlignCurVal = hozAlignOptions[0];
          else if (col.hozAlign === 'center') hozAlignCurVal = hozAlignOptions[1];
          else if (col.hozAlign === 'right') hozAlignCurVal = hozAlignOptions[2];

          let vertAlignCurVal = {};
          if (col.vertAlign === 'top') vertAlignCurVal = vertAlignOptions[0];
          else if (col.vertAlign === 'middle') vertAlignCurVal = vertAlignOptions[1];
          else if (col.vertAlign === 'bottom') vertAlignCurVal = vertAlignOptions[2];

          let conditionalFormatting = false;
          let condFormatExprStr = "";
          
          try {
            conditionalFormatting = columnDef.formatterParams?.conditionalFormatting;
          } catch (e) {}
          
          try {
            condFormatExprStr = columnDef.formatterParams?.conditionalExprs.join('\n');
          } catch (e) {}

          return (
            <React.Fragment key={col.field}>
              <Row style={{ border: '1px solid black', borderRadius: '5px', padding: '10px' }}>
                <Col md={2} sm={2} xs={2}>
                  <b>{col.field}</b>
                </Col>
                <Col md={2} sm={2} xs={2}>
                  Hoz-Align:
                  <Select 
                    className="basic-single" 
                    classNamePrefix="select" 
                    isClearable={true} 
                    name="hozAlignOptions" 
                    options={hozAlignOptions} 
                    defaultValue={hozAlignCurVal} 
                    onChange={(value) => {
                      console.log("Setting for: ", col.field, value);
                      const column = tabulatorRef.current.table.getColumn(col.field);
                      setHozAlign(column, value.value);
                    }}
                  />
                  Vert-Align:
                  <Select 
                    className="basic-single" 
                    classNamePrefix="select" 
                    isClearable={true} 
                    name="vertAlignOptions" 
                    options={vertAlignOptions} 
                    defaultValue={vertAlignCurVal} 
                    onChange={(value) => {
                      console.log("Setting for: ", col.field, value);
                      const column = tabulatorRef.current.table.getColumn(col.field);
                      setVertAlign(column, value.value);
                    }}
                  />
                </Col>
                <Col md={4} sm={4} xs={4}>
                  Editor:
                  <Select 
                    className="basic-single" 
                    classNamePrefix="select" 
                    isClearable={true} 
                    name="editorOptions" 
                    options={editorOptions} 
                    defaultValue={editorCurVal} 
                    onChange={(value) => {
                      console.log("Setting for: ", col.field);
                      const column = tabulatorRef.current.table.getColumn(col.field);
                      setEditor(column, value.value);
                      setSomethingChanged(prev => prev + 1);
                    }}
                  />
                  {renderEditorParamsControl(col)}
                  Hdr-filter-type:
                  <Select 
                    className="basic-single" 
                    classNamePrefix="select" 
                    isClearable={true} 
                    name="filterOptions" 
                    options={filterOptions} 
                    defaultValue={hdrFilterTypeCurVal} 
                    onChange={(value) => {
                      console.log("Setting for: ", col.field, value);
                      const column = tabulatorRef.current.table.getColumn(col.field);
                      setHdrFilterType(column, value.value);
                    }}
                  />
                  <Form.Check 
                    type="checkbox" 
                    label="&nbsp; conditional formatting" 
                    checked={conditionalFormatting} 
                    onChange={(event) => {
                      if (!tabulatorRef.current) return;
                      const isChecked = event.target.checked;
                      const curFormatterParams = columnDef.formatterParams || {};
                      const formatterParams = {
                        ...curFormatterParams,
                        conditionalFormatting: isChecked
                      };
                      tabulatorRef.current.table.updateColumnDefinition(col.field, { formatterParams });
                      // Force re-render without rebuilding table columns
                      setForceRender(prev => prev + 1);
                    }}
                  />
                  {conditionalFormatting && (
                    <Form.Control 
                      as="textarea" 
                      rows="3" 
                      defaultValue={condFormatExprStr} 
                      onChange={(event) => {
                        if (!tabulatorRef.current) return;
                        const value = event.target.value;
                        handleDebounce(col.field, () => {
                          if (!value) return;
                          const curFormatterParams = columnDef.formatterParams || {};
                          let condExprs = value.split('\n').map(v => v.trim());
                          condExprs = condExprs.filter(v => v !== "");
                          const formatterParams = {
                            ...curFormatterParams,
                            conditionalExprs: condExprs,
                          };
                          tabulatorRef.current.table.updateColumnDefinition(col.field, { formatterParams });
                          setSomethingChanged(prev => prev + 1);
                        });
                      }} 
                    />
                  )}
                </Col>
              </Row>
              <br />
            </React.Fragment>
          );
        })}
      </>
    );
  };

  if (!viewData) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <Row>
        <Col md={12} sm={12} xs={12}>
          <h3 style={{ float: 'center' }}>Dataset view: {dsName} | {dsView}</h3>
        </Col>
      </Row>
      <br />
      
      {/* Dataset Description */}
      <Row>
        <Col md={2} sm={2} xs={2}>
          <b>Dataset Description: </b>
        </Col>
        <Col md={10} sm={10} xs={10}>
          <Form.Control 
            as="textarea" 
            rows="3" 
            defaultValue={dsDescription} 
            onChange={(event) => {
              const value = event.target.value;
              handleDebounce("__dg__dsDescription", () => {
                setDsDescription(value);
              });
            }} 
          />
        </Col>
      </Row>
      <br />
      
      {/* Column Attributes */}
      {renderColumnAttributes()}
      
      {/* JIRA Project Name */}
      <Row>
        <Col md={3} sm={3} xs={3}>
          <Form.Check 
            inline 
            type="checkbox" 
            label="&nbsp;Add Jira project name" 
            checked={jiraProjectNameEnabled} 
            onChange={(event) => {
              setJiraProjectNameEnabled(event.target.checked);
            }} 
          />
        </Col>
        {jiraProjectNameEnabled && (
          <Col md={9} sm={9} xs={9}>
            <Form.Control 
              type="text" 
              defaultValue={jiraProjectName} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce("__dsViewEdit__main", () => {
                  if (!value) return;
                  setJiraProjectName(value);
                });
              }} 
            />
          </Col>
        )}
      </Row>
      
      {/* JIRA Query */}
      <Row>
        <Col md={3} sm={3} xs={3}>
          <Form.Check 
            inline 
            type="checkbox" 
            label="&nbsp;Add Jira query" 
            checked={jira} 
            onChange={(event) => {
              setJira(event.target.checked);
            }}
          />
        </Col>
        {jira && (
          <Col md={9} sm={9} xs={9}>
            <Form.Control 
              type="text" 
              defaultValue={jql} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce("__dsViewEdit__main", () => {
                  if (!value) return;
                  setJql(value);
                });
              }} 
            />
          </Col>
        )}
      </Row>
      <Row>
        {jira && (
          <Col md={3} sm={3} xs={3}>
            <b>Jira field mapping: </b>
          </Col>
        )}
        {jira && (
          <Col md={9} sm={9} xs={9}>
            <Form.Control 
              as="textarea" 
              rows="3" 
              defaultValue={jiraFieldMapping} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce("__dsViewEdit__main", () => {
                  if (!value) return;
                  setJiraFieldMapping(value);
                });
              }} 
            />
          </Col>
        )}
      </Row>
      <br />
      <br />
      
      {/* JIRA Agile */}
      <Row>
        <Col md={3} sm={3} xs={3}>
          <Form.Check 
            inline 
            type="checkbox" 
            label="&nbsp;Add Jira Agile Label" 
            checked={jiraAgile} 
            onChange={(event) => {
              setJiraAgile(event.target.checked);
            }} 
          />
        </Col>
        {jiraAgile && (
          <Col md={9} sm={9} xs={9}>
            <Form.Control 
              type="text" 
              required 
              defaultValue={jiraAgileLabel} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce("__dsViewEdit__main", () => {
                  if (!value) return;
                  setJiraAgileLabel(value);
                });
              }} 
            />
          </Col>
        )}
      </Row>
      <Row>
        {jiraAgile && (
          <Col md={3} sm={3} xs={3}>
            <b>Jira Agile BoardId: </b>
          </Col>
        )}
        {jiraAgile && (
          <Col md={9} sm={9} xs={9}>
            <Form.Control 
              type="number" 
              required 
              defaultValue={jiraAgileBoardId} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce("__dsViewEdit__main", () => {
                  if (!value) return;
                  setJiraAgileBoardId(value);
                });
              }} 
            />
          </Col>
        )}
      </Row>
      <Row>
        {jiraAgile && (
          <Col md={3} sm={3} xs={3}>
            <b>Jira Agile field mapping: </b>
          </Col>
        )}
        {jiraAgile && (
          <Col md={9} sm={9} xs={9}>
            <Form.Control 
              as="textarea" 
              rows="3" 
              defaultValue={jiraAgileFieldMapping} 
              onChange={(event) => {
                const value = event.target.value;
                handleDebounce("__dsViewEdit__main", () => {
                  if (!value) return;
                  setJiraAgileFieldMapping(value);
                });
              }} 
            />
          </Col>
        )}
      </Row>
      
      {/* Fixed Height */}
      <Row>
        <Col md={3} sm={3} xs={3}>
          <Form.Check 
            inline 
            type="checkbox" 
            label="&nbsp;Fixed height" 
            checked={fixedHeight} 
            onChange={(event) => {
              setFixedHeight(event.target.checked);
            }}
          />
        </Col>
      </Row>
      
      {/* Access Control */}
      <AccessCtrl 
        dsName={dsName} 
        dsView={dsView} 
        viewData={viewData}
        onChange={(value) => {
          console.log(`Received access control as:`, value);
          setAclConfig(value);
        }}
      />
      
      {/* Per-Row Access Control */}
      <PerRowAccessCtrl 
        config={perRowAccessConfig} 
        onChange={(cfg) => {
          setPerRowAccessConfig(cfg);
        }}
      />
      
      <br />
      
      {/* Action Buttons */}
      <Row>
        <Col md={12} sm={12} xs={12}>
          <Button size="sm" onClick={pushColumnDefs}> Set View </Button>
          {' '}
          <Button size="sm" onClick={showAllCols}> Show all columns </Button>
          {' '}
          {renderSetViewStatus()}
        </Col>
      </Row>
      
      {/* Preview Table */}
      {tableColumns.length > 0 && (
        <Row>
          <div>
            <MyTabulator
              columns={tableColumns}
              data={[]}
              options={{
                ajaxURL: `${API_URL}/ds/view/${dsName}/${dsView}/${userId}`,
                ajaxConfig: {
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                },
                pagination: "remote",
                paginationDataSent: {
                  page: 'page',
                  size: 'per_page'
                },
                paginationDataReceived: {
                  last_page: 'total_pages'
                },
                current_page: 1,
                paginationSize: 20,
                ajaxResponse: function (url, params, response) {
                  console.log('ajaxResponse', url);
                  return response;
                },
                ajaxError: function (error) {
                  console.log('ajaxError', error);
                },
                movableColumns: true,
                index: "_id",
                ajaxSorting: true,
                ajaxFiltering: true,
                currentTheme: currentTheme, // Triggers shouldComponentUpdate on theme change
                rowFormatter: (row) => {
                  const rootStyles = getComputedStyle(document.documentElement);
                  const rowElement = row.getElement();
                  
                  if (!row.getData()._id) {
                    // New unsaved row - use text-muted color with transparency
                    const mutedColor = rootStyles.getPropertyValue('--color-text-muted').trim();
                    rowElement.style.backgroundColor = `${mutedColor}33`; // 33 = ~20% opacity in hex
                  } else {
                    // Saved row - use normal background color from theme
                    rowElement.style.backgroundColor = rootStyles.getPropertyValue('--color-bg').trim();
                  }
                },
                renderComplete: renderComplete,
              }}
              innerref={(ref) => (tabulatorRef.current = ref)}
            />
          </div>
        </Row>
      )}
    </div>
  );
}

export default DsViewEditPage;
