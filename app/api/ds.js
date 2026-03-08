import { api } from './client';

function getAuthHeaders() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return {};
    const u = JSON.parse(raw);
    if (u && u.token) return { authorization: 'Bearer ' + u.token };
  } catch (e) {}
  return {};
}

export async function fetchDsList(userId) {
  const headers = getAuthHeaders();
  return api(`/ds/dsList/${userId}`, { method: 'GET', headers });
}

/**
 * Pin or unpin a dataset for a user.
 * @param {string} dsName
 * @param {string} dsUser
 * @param {boolean} pin  true = pin, false = unpin
 * @param {string|null} token
 */
export async function pinDs(dsName, dsUser, pin, token) {
  const headers = token
    ? { authorization: 'Bearer ' + token }
    : getAuthHeaders();
  return api('/ds/pinDs', {
    method: 'POST',
    body: { dsName, dsUser, pin },
    headers,
  });
}

export async function createDsFromDs(body) {
  const headers = getAuthHeaders();
  try {
    const data = await api('/ds/createDsFromDs', { method: 'POST', body, headers });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, data: { status: 'fail', message: err.message || 'Create failed' } };
  }
}

export async function uploadXlsFile(formData) {
  const headers = getAuthHeaders();
  try {
    const BASE = import.meta.env.VITE_API_BASE || '';
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: { ...headers }
    });
    if (!res.ok) throw new Error('Upload failed');
    return await res.json();
  } catch (err) {
    throw new Error(err.message || 'Upload failed');
  }
}

export async function loadHdrsFromRange(body) {
  const headers = getAuthHeaders();
  return api('/upload/loadHdrsFromRange', { method: 'POST', body, headers });
}

export async function createDsFromXls(body) {
  const headers = getAuthHeaders();
  return api('/upload/createDs', { method: 'POST', body, headers });
}

export async function uploadCsvFile(formData) {
  const headers = getAuthHeaders();
  try {
    const BASE = import.meta.env.VITE_API_BASE || '';
    const res = await fetch(`${BASE}/uploadCsv`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: { ...headers }
    });
    if (!res.ok) throw new Error('Upload failed');
    return await res.json();
  } catch (err) {
    throw new Error(err.message || 'Upload failed');
  }
}

export async function createDsFromCsv(body) {
  const headers = getAuthHeaders();
  return api('/uploadCsv/createDs', { method: 'POST', body, headers });
}

export async function bulkEditFromXls(body) {
  const headers = getAuthHeaders();
  return api('/ds/doBulkEdit', { method: 'POST', body, headers });
}

/**
 * Load column definitions, keys, JIRA config, filters for a dataset view
 */
export async function fetchViewColumns(dsName, dsView, dsUser) {
  const headers = getAuthHeaders();
  return api(`/ds/view/columns/${dsName}/${dsView}/${dsUser}`, {
    method: 'GET',
    headers,
  });
}

/**
 * Edit a single cell value
 */
export async function editCell(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/editSingleAttribute', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Insert a new row/document
 */
export async function insertRow(body) {
  console.log('[API ds.js insertRow] Called with body:', JSON.stringify(body, null, 2));
  const headers = getAuthHeaders();
  const result = await api('/ds/view/insertOneDoc', {
    method: 'POST',
    body,
    headers,
  });
  console.log('[API ds.js insertRow] Response:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Delete a single row/document
 */
export async function deleteRow(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/deleteOneDoc', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Delete multiple rows/documents
 */
export async function deleteManyRows(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/deleteManyDocs', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Add a new column to the dataset view
 */
export async function addColumn({ dsName, dsView, dsUser, columnName, position, referenceColumn, columnAttrs = {} }) {
  const headers = getAuthHeaders();
  const result = await api('/ds/view/addColumn', {
    method: 'POST',
    body: {
      dsName,
      dsView,
      dsUser,
      columnName,
      position: position || 'left',
      referenceColumn,
      columnAttrs,
    },
    headers,
  });
  
  return {
    ...result,
    referenceColumn,
    position: position || 'left',
  };
}

/**
 * Delete a column from the dataset view
 */
export async function deleteColumn(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/deleteColumn', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Download dataset as Excel file
 */
export async function downloadXlsx(body) {
  const { dsName, dsView, dsUser } = body;
  const headers = getAuthHeaders();
  
  const result = await api(`/ds/downloadXlsx/${dsName}/${dsView}/${dsUser}`, {
    method: 'POST',
    body,
    headers,
  });
  
  if (result.output && result.output !== '') {
    const fileName = `export_${dsName}_${dsView}_${dsUser}.xlsx`;
    // Convert base64 to blob
    const byteCharacters = atob(result.output);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/octet-stream' });
    
    // Trigger download
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } else {
    throw new Error('Download file is empty');
  }
}

/**
 * Refresh JIRA integration for dataset
 */
export async function refreshJira(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/refreshJira', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Get default JIRA fields and values for issue type
 */
export async function getDefaultTypeFieldsAndValues(body) {
  const headers = getAuthHeaders();
  return api('/ds/getDefaultTypeFieldsAndValues', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Convert a dataset row to JIRA issue
 */
export async function convertToJira(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/convertToJira', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Add a new JIRA issue row
 */
export async function addJiraRow(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/addJiraRow', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Get JIRA projects metadata
 */
export async function getProjectsMetaData(body) {
  const headers = getAuthHeaders();
  return api('/ds/getProjectsMetadataForProject', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Set view definitions (column config, formatters, etc.)
 */
export async function setViewDefinitions(body) {
  const headers = getAuthHeaders();
  try {
    const result = await api('/ds/view/setViewDefinitions', {
      method: 'POST',
      body,
      headers,
    });
    return [true, result];
  } catch (error) {
    return [false, { status: 'fail', message: error.message || 'setViewDefinitions service exception' }];
  }
}

/**
 * Add a filter to the view
 */
export async function addFilter(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/addFilter', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Edit an existing filter
 */
export async function editFilter(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/editFilter', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Delete a filter
 */
export async function deleteFilter(body) {
  const headers = getAuthHeaders();
  return api('/ds/view/deleteFilter', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Perform bulk edit operation
 */
export async function doBulkEdit(body) {
  const headers = getAuthHeaders();
  return api('/ds/doBulkEdit', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * Delete a dataset
 */
export async function deleteDs(body) {
  const headers = getAuthHeaders();
  return api('/ds/deleteDs', {
    method: 'POST',
    body,
    headers,
  });
}

export default {
  fetchDsList,
  createDsFromDs,
  uploadXlsFile,
  loadHdrsFromRange,
  createDsFromXls,
  uploadCsvFile,
  createDsFromCsv,
  fetchViewColumns,
  editCell,
  insertRow,
  deleteRow,
  deleteManyRows,
  addColumn,
  deleteColumn,
  downloadXlsx,
  refreshJira,
  getDefaultTypeFieldsAndValues,
  convertToJira,
  addJiraRow,
  getProjectsMetaData,
  setViewDefinitions,
  addFilter,
  editFilter,
  deleteFilter,
  doBulkEdit,
  deleteDs,
};
