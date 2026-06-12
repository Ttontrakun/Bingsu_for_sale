import { useState, useEffect } from 'react';
import { HiRefresh, HiChevronDown, HiChevronRight, HiDatabase, HiTable, HiCube } from 'react-icons/hi';
import Sidebar from '../components/Sidebar';
import { databaseAPI, getErrorMessage } from '../services/api';

function DatabaseSchemas() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSchemas, setExpandedSchemas] = useState(new Set());
  const [expandedTables, setExpandedTables] = useState(new Set());
  const [tableData, setTableData] = useState({});
  const [loadingTableData, setLoadingTableData] = useState(new Set());
  const [qdrantStatus, setQdrantStatus] = useState(null);
  const [loadingQdrant, setLoadingQdrant] = useState(false);
  const [showQdrantStatus, setShowQdrantStatus] = useState(false);

  // Load schemas on component mount
  useEffect(() => {
    loadSchemas();
    loadQdrantStatus();
  }, []);

  const loadQdrantStatus = async () => {
    setLoadingQdrant(true);
    try {
      const status = await databaseAPI.getQdrantStatus();
      setQdrantStatus(status);
    } catch (err) {
      console.error('Error loading Qdrant status:', err);
      setQdrantStatus({
        connected: false,
        collection_exists: false,
        error: getErrorMessage(err)
      });
    } finally {
      setLoadingQdrant(false);
    }
  };

  const loadSchemas = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await databaseAPI.getAllSchemas();
      setSchemas(data.schemas || []);
      // Auto-expand first schema
      if (data.schemas && data.schemas.length > 0) {
        setExpandedSchemas(new Set([data.schemas[0].name]));
      }
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error loading schemas:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSchema = (schemaName) => {
    const newExpanded = new Set(expandedSchemas);
    if (newExpanded.has(schemaName)) {
      newExpanded.delete(schemaName);
    } else {
      newExpanded.add(schemaName);
    }
    setExpandedSchemas(newExpanded);
  };

  const toggleTable = async (schemaName, tableName) => {
    const key = `${schemaName}.${tableName}`;
    const newExpanded = new Set(expandedTables);
    
    if (newExpanded.has(key)) {
      // Collapse - remove from expanded
      newExpanded.delete(key);
      setExpandedTables(newExpanded);
    } else {
      // Expand - add to expanded and load data if not already loaded
      newExpanded.add(key);
      setExpandedTables(newExpanded);
      
      // Load table data if not already loaded
      if (!tableData[key]) {
        await loadTableData(schemaName, tableName);
      }
    }
  };

  const loadTableData = async (schemaName, tableName) => {
    const key = `${schemaName}.${tableName}`;
    setLoadingTableData(prev => new Set(prev).add(key));
    
    try {
      const data = await databaseAPI.getTableData(schemaName, tableName);
      setTableData(prev => ({
        ...prev,
        [key]: data
      }));
    } catch (err) {
      console.error(`Error loading table data for ${key}:`, err);
      setTableData(prev => ({
        ...prev,
        [key]: { error: getErrorMessage(err) }
      }));
    } finally {
      setLoadingTableData(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  const formatCellValue = (value) => {
    if (value === null || value === undefined) {
      return <span className='text-gray-400 italic'>NULL</span>;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const formatDataType = (column) => {
    let type = column.type;
    if (column.max_length) {
      type += `(${column.max_length})`;
    } else if (column.precision && column.scale !== null) {
      type += `(${column.precision},${column.scale})`;
    } else if (column.precision) {
      type += `(${column.precision})`;
    }
    return type;
  };

  return (
    <div className='flex h-screen bg-white relative'>
      {/* Sidebar Component */}
      <Sidebar onCollapseChange={setIsSidebarCollapsed} />

      {/* Main Content */}
      <main className={`flex-1 bg-white px-8 py-6 overflow-auto flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : ''}`}>
        {/* Header */}
        <div className='mb-6 flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold text-gray-800 mb-2'>Database Schemas</h1>
            <p className='text-sm text-gray-600'>View all PostgreSQL database schemas, tables, and columns</p>
          </div>
          
          <div className='flex items-center gap-3'>
            {/* Qdrant Status Toggle */}
            <button
              onClick={() => {
                setShowQdrantStatus(!showQdrantStatus);
                if (!showQdrantStatus && !qdrantStatus) {
                  loadQdrantStatus();
                }
              }}
              className='flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95'
            >
              <HiCube className='text-lg' />
              <span>Qdrant Status</span>
            </button>
            
            {/* Refresh Button */}
            <button
              onClick={loadSchemas}
              disabled={loading}
              className='flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <HiRefresh className={`text-lg ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Qdrant Status Panel */}
        {showQdrantStatus && (
          <div className='mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 shadow-md'>
            <div className='flex items-center justify-between mb-4'>
              <div className='flex items-center gap-3'>
                <HiCube className='text-3xl text-blue-600' />
                <div>
                  <h2 className='text-xl font-bold text-gray-800'>Qdrant Vector Database Status</h2>
                  <p className='text-sm text-gray-600 mt-1'>
                    Note: Qdrant uses <strong>"collections"</strong> (not "tables" like PostgreSQL)
                  </p>
                </div>
              </div>
              <button
                onClick={loadQdrantStatus}
                disabled={loadingQdrant}
                className='flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50'
              >
                <HiRefresh className={`text-sm ${loadingQdrant ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loadingQdrant ? (
              <div className='py-8 text-center'>
                <HiRefresh className='text-3xl text-blue-400 animate-spin mx-auto mb-2' />
                <p className='text-gray-600'>Loading Qdrant status...</p>
              </div>
            ) : qdrantStatus ? (
              <div className='space-y-4'>
                {/* Connection Status */}
                <div className='bg-white rounded-lg p-4 border border-gray-200'>
                  <div className='flex items-center justify-between mb-2'>
                    <h3 className='font-semibold text-gray-800'>Connection Status</h3>
                    {qdrantStatus.connected ? (
                      <span className='px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium'>
                        ✓ Connected
                      </span>
                    ) : (
                      <span className='px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium'>
                        ✗ Disconnected
                      </span>
                    )}
                  </div>
                  {qdrantStatus.qdrant_url && (
                    <p className='text-sm text-gray-600'>
                      <strong>URL:</strong> <code className='bg-gray-100 px-2 py-1 rounded'>{qdrantStatus.qdrant_url}</code>
                    </p>
                  )}
                  {qdrantStatus.qdrant_version && (
                    <p className='text-sm text-gray-600 mt-1'>
                      <strong>Version:</strong> <code className='bg-gray-100 px-2 py-1 rounded'>{qdrantStatus.qdrant_version}</code>
                    </p>
                  )}
                  {qdrantStatus.message && (
                    <p className='text-sm text-gray-600 mt-2'>{qdrantStatus.message}</p>
                  )}
                </div>

                {/* Collection Status */}
                {qdrantStatus.connected && (
                  <div className='bg-white rounded-lg p-4 border border-gray-200'>
                    <div className='flex items-center justify-between mb-2'>
                      <h3 className='font-semibold text-gray-800'>Collection Status</h3>
                      {qdrantStatus.collection_exists ? (
                        <span className='px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium'>
                          ✓ Exists
                        </span>
                      ) : (
                        <span className='px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium'>
                          ⚠ Not Created Yet
                        </span>
                      )}
                    </div>
                    {qdrantStatus.collection_name && (
                      <p className='text-sm text-gray-600 mb-2'>
                        <strong>Collection Name:</strong> <code className='bg-gray-100 px-2 py-1 rounded'>{qdrantStatus.collection_name}</code>
                      </p>
                    )}
                    {qdrantStatus.collection_exists ? (
                      <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mt-3'>
                        {qdrantStatus.vector_size && (
                          <div>
                            <p className='text-xs text-gray-500 mb-1'>Vector Size</p>
                            <p className='text-lg font-semibold text-gray-800'>{qdrantStatus.vector_size}</p>
                          </div>
                        )}
                        {qdrantStatus.distance && (
                          <div>
                            <p className='text-xs text-gray-500 mb-1'>Distance Metric</p>
                            <p className='text-lg font-semibold text-gray-800'>{qdrantStatus.distance}</p>
                          </div>
                        )}
                        {qdrantStatus.points_count !== undefined && (
                          <div>
                            <p className='text-xs text-gray-500 mb-1'>Vectors Stored</p>
                            <p className='text-lg font-semibold text-gray-800'>{qdrantStatus.points_count.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className='text-sm text-gray-600 mt-2'>
                        Collection will be created automatically when you add files to a knowledge base.
                      </p>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {qdrantStatus.error && (
                  <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
                    <p className='text-red-800 text-sm font-semibold mb-1'>Error:</p>
                    <p className='text-red-700 text-sm'>{qdrantStatus.error}</p>
                  </div>
                )}

                {/* Note */}
                {qdrantStatus.note && (
                  <div className='bg-blue-50 border border-blue-200 rounded-lg p-3'>
                    <p className='text-blue-800 text-sm'>{qdrantStatus.note}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className='py-4 text-center text-gray-500'>
                <p>Unable to load Qdrant status</p>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className='mb-4 p-4 bg-red-50 border border-red-200 rounded-lg'>
            <p className='text-red-800 text-sm'>{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className='flex-1 flex items-center justify-center'>
            <div className='text-center'>
              <HiRefresh className='text-4xl text-yellow-400 animate-spin mx-auto mb-4' />
              <p className='text-gray-600'>Loading schemas...</p>
            </div>
          </div>
        )}

        {/* Schemas List */}
        {!loading && schemas.length > 0 && (
          <div className='flex-1 overflow-auto'>
            <div className='space-y-4'>
              {schemas.map((schema) => (
                <div
                  key={schema.name}
                  className='bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden'
                >
                  {/* Schema Header */}
                  <button
                    onClick={() => toggleSchema(schema.name)}
                    className='w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left'
                  >
                    <div className='flex items-center gap-3'>
                      {expandedSchemas.has(schema.name) ? (
                        <HiChevronDown className='text-gray-600 text-xl' />
                      ) : (
                        <HiChevronRight className='text-gray-600 text-xl' />
                      )}
                      <HiDatabase className='text-yellow-500 text-xl' />
                      <div>
                        <h3 className='text-lg font-semibold text-gray-800'>{schema.name}</h3>
                        <p className='text-sm text-gray-600'>
                          Owner: {schema.owner} • {schema.tables?.length || 0} tables
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Schema Content */}
                  {expandedSchemas.has(schema.name) && (
                    <div className='px-6 py-4 border-t border-gray-200'>
                      {schema.tables && schema.tables.length > 0 ? (
                        <div className='space-y-3'>
                          {schema.tables.map((table) => (
                            <div
                              key={`${schema.name}.${table.name}`}
                              className='bg-gray-50 rounded-lg border border-gray-200 overflow-hidden'
                            >
                              {/* Table Header */}
                              <button
                                onClick={() => toggleTable(schema.name, table.name)}
                                className='w-full px-4 py-3 hover:bg-gray-100 transition-colors flex items-center justify-between text-left'
                              >
                                <div className='flex items-center gap-3'>
                                  {expandedTables.has(`${schema.name}.${table.name}`) ? (
                                    <HiChevronDown className='text-gray-500 text-sm' />
                                  ) : (
                                    <HiChevronRight className='text-gray-500 text-sm' />
                                  )}
                                  <HiTable className='text-blue-500 text-lg' />
                                  <div>
                                    <span className='font-medium text-gray-800'>{table.name}</span>
                                    <span className='ml-2 text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded'>
                                      {table.type}
                                    </span>
                                    <span className='ml-2 text-xs text-gray-500'>
                                      ({table.columns?.length || 0} columns)
                                    </span>
                                  </div>
                                </div>
                              </button>

                              {/* Table Columns */}
                              {expandedTables.has(`${schema.name}.${table.name}`) && table.columns && (
                                <div className='border-t border-gray-200 bg-white'>
                                  {/* Column Schema */}
                                  <div className='px-4 py-3 border-b border-gray-200 bg-gray-50'>
                                    <h4 className='text-sm font-semibold text-gray-700 mb-2'>Column Schema</h4>
                                    <div className='overflow-x-auto'>
                                      <table className='w-full text-sm'>
                                        <thead>
                                          <tr className='border-b border-gray-200'>
                                            <th className='text-left py-2 px-3 font-semibold text-gray-700'>Column Name</th>
                                            <th className='text-left py-2 px-3 font-semibold text-gray-700'>Data Type</th>
                                            <th className='text-left py-2 px-3 font-semibold text-gray-700'>Nullable</th>
                                            <th className='text-left py-2 px-3 font-semibold text-gray-700'>Default</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {table.columns.map((column, idx) => (
                                            <tr
                                              key={idx}
                                              className='border-b border-gray-100 hover:bg-gray-50'
                                            >
                                              <td className='py-2 px-3 font-mono text-gray-800'>{column.name}</td>
                                              <td className='py-2 px-3 font-mono text-gray-600 text-xs'>
                                                {formatDataType(column)}
                                              </td>
                                              <td className='py-2 px-3'>
                                                {column.nullable ? (
                                                  <span className='text-green-600 text-xs font-medium'>YES</span>
                                                ) : (
                                                  <span className='text-red-600 text-xs font-medium'>NO</span>
                                                )}
                                              </td>
                                              <td className='py-2 px-3 font-mono text-gray-500 text-xs'>
                                                {column.default || <span className='text-gray-400'>-</span>}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Table Data */}
                                  <div className='px-4 py-3'>
                                    <h4 className='text-sm font-semibold text-gray-700 mb-2'>Table Data</h4>
                                    {loadingTableData.has(`${schema.name}.${table.name}`) ? (
                                      <div className='py-8 text-center'>
                                        <HiRefresh className='text-2xl text-yellow-400 animate-spin mx-auto mb-2' />
                                        <p className='text-gray-600 text-sm'>Loading data...</p>
                                      </div>
                                    ) : tableData[`${schema.name}.${table.name}`]?.error ? (
                                      <div className='py-4 px-4 bg-red-50 border border-red-200 rounded-lg'>
                                        <p className='text-red-800 text-sm'>{tableData[`${schema.name}.${table.name}`].error}</p>
                                      </div>
                                    ) : tableData[`${schema.name}.${table.name}`] ? (
                                      <div>
                                        <div className='mb-2 text-xs text-gray-600'>
                                          Showing {tableData[`${schema.name}.${table.name}`].rows?.length || 0} of {tableData[`${schema.name}.${table.name}`].total_count || 0} rows
                                        </div>
                                        <div className='overflow-x-auto border border-gray-200 rounded-lg'>
                                          <table className='w-full text-xs'>
                                            <thead>
                                              <tr className='bg-gray-100 border-b border-gray-200'>
                                                {tableData[`${schema.name}.${table.name}`].columns?.map((col, idx) => (
                                                  <th
                                                    key={idx}
                                                    className='text-left py-2 px-3 font-semibold text-gray-700 whitespace-nowrap'
                                                  >
                                                    {col}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {tableData[`${schema.name}.${table.name}`].rows?.length > 0 ? (
                                                tableData[`${schema.name}.${table.name}`].rows.map((row, rowIdx) => (
                                                  <tr
                                                    key={rowIdx}
                                                    className='border-b border-gray-100 hover:bg-gray-50'
                                                  >
                                                    {tableData[`${schema.name}.${table.name}`].columns?.map((col, colIdx) => (
                                                      <td
                                                        key={colIdx}
                                                        className='py-2 px-3 text-gray-800 whitespace-nowrap max-w-xs truncate'
                                                        title={formatCellValue(row[col])}
                                                      >
                                                        {formatCellValue(row[col])}
                                                      </td>
                                                    ))}
                                                  </tr>
                                                ))
                                              ) : (
                                                <tr>
                                                  <td
                                                    colSpan={tableData[`${schema.name}.${table.name}`].columns?.length || 1}
                                                    className='py-8 text-center text-gray-500'
                                                  >
                                                    No data in this table
                                                  </td>
                                                </tr>
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                        {tableData[`${schema.name}.${table.name}`].has_more && (
                                          <div className='mt-2 text-xs text-gray-500 text-center'>
                                            Showing first 100 rows. Total: {tableData[`${schema.name}.${table.name}`].total_count} rows
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className='py-4 text-center text-gray-500 text-sm'>
                                        Click to load table data
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className='text-gray-500 text-sm py-2'>No tables in this schema</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && schemas.length === 0 && !error && (
          <div className='flex-1 flex items-center justify-center'>
            <div className='text-center'>
              <HiDatabase className='text-6xl text-gray-300 mx-auto mb-4' />
              <p className='text-gray-500 text-lg mb-2'>No schemas found</p>
              <p className='text-gray-400 text-sm'>Click refresh to reload schemas</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default DatabaseSchemas;
