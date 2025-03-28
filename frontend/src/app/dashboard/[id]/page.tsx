'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowLeft, Loader2, Edit2, Check, X, AlertCircle, Pencil, Save, RefreshCw, Trash2, FileSpreadsheet } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { connectSocket, disconnectSocket, joinTableRoom, leaveTableRoom, socket as socketInstance, onTableUpdate, offTableUpdate } from '@/lib/socket';

interface Column {
  name: string;
  type: string;
  isDashboardOnly: boolean;
}

interface BaseRow {
  _id: string;
  id?: string;
}

interface RawRow {
  _id?: string;
  id?: string;
  [key: string]: any;
}

interface DynamicRow extends BaseRow {
  [key: string]: string | number | boolean | null | undefined;
}

interface Table {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  syncError?: string;
  columns: Column[];
  data: DynamicRow[];
  googleSheetId?: string;
  googleSheetUrl?: string;
  lastSynced?: Date;
}

interface TableUpdate {
  tableId: string;
  data: DynamicRow[];
}

interface PageParams {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function TableDetailPage({ params }: PageParams) {
  const { id } = params;
  const [table, setTable] = useState<Table | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [newColumn, setNewColumn] = useState<{ name: string; type: Column['type']; isDashboardOnly: boolean }>({ 
    name: '', 
    type: 'text',
    isDashboardOnly: false 
  });
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [newSheetUrl, setNewSheetUrl] = useState('');
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});

  const renderCell = (column: Column, value: any) => {
    switch (column.type) {
      case 'boolean':
        return (
          <div className="flex justify-center">
            <Checkbox
              checked={value}
              disabled
            />
          </div>
        );
      case 'date':
        return formatDateForDisplay(value);
      default:
        return formatCellValue(value, column.type);
    }
  };

  const renderEditCell = (column: Column, value: any, isAddingRow: boolean = false) => {
    switch (column.type) {
      case 'boolean':
        return (
          <div className="flex justify-center">
            <Select
              value={(editedData[column.name] ?? value)?.toString()}
              onValueChange={(val) => handleInputChange(column.name, val === 'true')}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      case 'date':
        return (
          <Input
            type="date"
            value={editedData[column.name] || formatDateForInput(value)}
            onChange={(e) => handleInputChange(column.name, e.target.value)}
            className="w-full"
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={editedData[column.name] ?? value ?? ''}
            onChange={(e) => handleInputChange(column.name, e.target.value)}
            className="w-full"
          />
        );
      default:
        return (
          <Input
            type="text"
            value={editedData[column.name] ?? value ?? ''}
            onChange={(e) => handleInputChange(column.name, e.target.value)}
            className="w-full"
          />
        );
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch table data');
        }

        const data = await response.json();
        console.log('Raw table data:', {
          tableId: data._id,
          columns: data.columns,
          rowSample: data.data[0],
          allRows: data.data
        });
        
        // Ensure all columns are included in the table data and _id is properly set
        const tableWithAllColumns = {
          ...data,
          data: data.data.map((row: RawRow, index: number) => {
            // Create a properly typed row object with index signature
            const rowWithId: DynamicRow = {
              _id: row._id || row.id || `temp-${index}`,
              id: row.id,
            };
            
            // Add missing columns with null values
            data.columns.forEach((column: Column) => {
              if (!(column.name in rowWithId)) {
                rowWithId[column.name] = null;
              }
            });
            
            return rowWithId;
          })
        };
        
        console.log('Processed table data:', {
          columns: tableWithAllColumns.columns,
          rowCount: tableWithAllColumns.data.length,
          sampleRow: tableWithAllColumns.data[0],
          rowIds: tableWithAllColumns.data.map(row => row._id)
        });
        
        setTable(tableWithAllColumns);

        // After successful data fetch, set up socket connection silently
        try {
          await connectSocket(token);
          await joinTableRoom(id as string);
          console.log('Socket connection established');
        } catch (socketError: any) {
          // Only log the error, don't show toast to user unless it's a critical error
          console.error('Socket connection failed:', socketError);
          if (socketError.message?.includes('Authentication failed')) {
            toast.error('Connection error - please refresh the page');
          }
        }
      } catch (error: any) {
        console.error('Error:', error);
        toast.error(error.message || 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      if (id) {
        leaveTableRoom(id as string);
      }
      disconnectSocket();
    };
  }, [id]);

  // Listen for table updates
  useEffect(() => {
    if (!table) return;

    const handleTableUpdate = (updatedData: TableUpdate) => {
      console.log('Received table update:', updatedData);
      if (updatedData.tableId === table._id) {
        setTable(prev => {
          if (!prev) return null;
          
          // Ensure all columns are included in the updated data
          const updatedTableData = updatedData.data.map((row: DynamicRow) => {
            const rowWithAllColumns = { ...row };
            prev.columns.forEach((column: Column) => {
              if (!(column.name in rowWithAllColumns)) {
                rowWithAllColumns[column.name] = null;
              }
            });
            return rowWithAllColumns;
          });
          
          return {
            ...prev,
            data: updatedTableData
          };
        });
      }
    };

    onTableUpdate(handleTableUpdate);

    return () => {
      offTableUpdate(handleTableUpdate);
    };
  }, [table]);

  const handleAddColumn = async () => {
    if (!newColumn.name.trim()) {
      toast.error('Please enter a column name');
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${id}/columns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        credentials: 'include',
        body: JSON.stringify(newColumn),
      });

      if (!response.ok) {
        throw new Error('Failed to add column');
      }

      const updatedTable = await response.json();
      setTable(updatedTable);
      setNewColumn({ name: '', type: 'text', isDashboardOnly: false });
      toast.success('Column added successfully');
    } catch (error) {
      console.error('Error adding column:', error);
      toast.error('Failed to add column');
    }
  };

  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  const handleEditRow = (rowId: string) => {
    console.log('Edit row clicked:', { rowId });
    if (!rowId || !table) {
      console.error('Invalid row edit attempt:', { rowId, hasTable: !!table });
      return;
    }
    
    const row = table.data.find(r => r._id && r._id.toString() === rowId);
    if (!row) {
      console.error('Row not found:', { rowId, tableData: table.data });
      toast.error('Row not found');
      return;
    }

    // Initialize editedData with current row values
    const initialData: Record<string, any> = {};
    table.columns.forEach(column => {
      initialData[column.name] = row[column.name];
    });

    console.log('Setting up edit mode:', { rowId, initialData });
    setEditingRow(rowId);
    setEditedData(initialData);
  };

  const handleSaveRow = async (rowId: string) => {
    console.log('Save row clicked:', { rowId, editedData });
    if (!rowId || !table) {
      console.error('Invalid save attempt:', { rowId, hasTable: !!table });
      toast.error('Invalid operation');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        toast.error('Authentication token not found');
        return;
      }

      // Prepare update data
      const updateData: Record<string, any> = {};
      const isDashboardOnly: Record<string, boolean> = {};

      // Process each edited column
      table.columns.forEach(column => {
        const value = editedData[column.name];
        if (value !== undefined) {
          let formattedValue = value;
          switch (column.type) {
            case 'number':
              formattedValue = value === '' ? null : Number(value);
              break;
            case 'date':
              formattedValue = value ? new Date(value).toISOString() : null;
              break;
            case 'boolean':
              formattedValue = typeof value === 'string' ? value === 'true' : Boolean(value);
              break;
            default:
              formattedValue = value?.toString() || null;
          }
          updateData[column.name] = formattedValue;
          isDashboardOnly[column.name] = column.isDashboardOnly;
        }
      });

      // Only proceed if there are changes
      if (Object.keys(updateData).length === 0) {
        console.log('No changes detected, canceling save');
        setEditingRow(null);
        setEditedData({});
        return;
      }

      // If this is a temporary ID, use POST to create a new row
      const isTemporaryId = rowId.startsWith('temp-');
      const url = `${process.env.NEXT_PUBLIC_API_URL}/tables/${table._id}/rows${isTemporaryId ? '' : `/${rowId}`}`;
      const method = isTemporaryId ? 'POST' : 'PUT';

      console.log('Sending request:', {
        url,
        method,
        data: updateData,
        isDashboardOnly
      });

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          data: updateData,
          isDashboardOnly
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response from server:', errorData);
        throw new Error(errorData.error || 'Failed to update row');
      }

      const { row: updatedRow } = await response.json();
      console.log('Successfully saved row:', updatedRow);
      
      // Update local state with the response data
      setTable(prev => {
        if (!prev) return null;
        if (isTemporaryId) {
          // For temporary IDs, remove the temporary row and add the new one
          const filteredData = prev.data.filter(r => r._id !== rowId);
          return {
            ...prev,
            data: [...filteredData, updatedRow]
          };
        } else {
          // For existing rows, update the row without creating duplicates
          const existingIndex = prev.data.findIndex(r => 
            (r._id && r._id.toString() === rowId) || (r.id && r.id.toString() === rowId)
          );
          
          if (existingIndex === -1) {
            return {
              ...prev,
              data: [...prev.data, updatedRow]
            };
          }

          const newData = [...prev.data];
          newData[existingIndex] = { ...newData[existingIndex], ...updatedRow };
          
          return {
            ...prev,
            data: newData
          };
        }
      });

      setEditingRow(null);
      setEditedData({});
      toast.success(isTemporaryId ? 'Row added successfully' : 'Row updated successfully');

    } catch (error: any) {
      console.error('Error saving row:', error);
      toast.error(error.message || 'Failed to save row');
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    console.log('Delete row clicked:', { rowId, table: table?._id });
    if (!table) {
      console.error('Table not found');
      toast.error('Table not found');
      return;
    }

    if (!rowId) {
      console.error('Invalid row ID');
      toast.error('Invalid row ID');
      return;
    }

    // If it's a temporary ID, just remove it from the local state
    if (rowId.startsWith('temp-')) {
      setTable(prev => {
        if (!prev) return null;
        return {
          ...prev,
          data: prev.data.filter(r => r._id !== rowId)
        };
      });
      toast.success('Row removed');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Authentication token not found');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${table._id}/rows/${rowId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Delete request failed:', error);
        throw new Error(error.message || 'Failed to delete row');
      }

      // Update local state
      setTable(prev => {
        if (!prev) return null;
        return {
          ...prev,
          data: prev.data.filter(r => r._id !== rowId && r.id !== rowId)
        };
      });
      toast.success('Row deleted successfully');
    } catch (error: any) {
      console.error('Error deleting row:', error);
      toast.error(error.message || 'Failed to delete row');
    }
  };

  const handleInputChange = (columnName: string, value: any) => {
    setEditedData(prev => {
      const newData = { ...prev };
      newData[columnName] = value;
      console.log('Updated edited data:', { columnName, value, newData });
      return newData;
    });
  };

  const handleUpdateSheetUrl = async () => {
    try {
      setIsUpdatingUrl(true);
      
      // Validate Google Sheet URL format
      if (!newSheetUrl.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/)) {
        toast.error('Invalid Google Sheet URL format');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${id}/update-sheet`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ googleSheetUrl: newSheetUrl })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update Google Sheet URL');
      }

      const updatedTable = await response.json();
      setTable(updatedTable);
      setIsEditingUrl(false);
      toast.success('Google Sheet URL updated successfully');
      
      // Force sync after URL update
      await handleForceSync();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update Google Sheet URL');
    } finally {
      setIsUpdatingUrl(false);
    }
  };

  const handleForceSync = async () => {
    if (!table) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${table._id}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to sync table');
      }

      const updatedTable = await response.json();
      setTable(updatedTable);
      toast.success('Table synced successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sync table');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddRow = async () => {
    if (!table) {
      toast.error('Table not found');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Authentication token not found');
        return;
      }

      // Initialize data for all columns
      const formattedData: Record<string, any> = {};
      const isDashboardOnly: Record<string, boolean> = {};

      // Initialize all columns with null values and set isDashboardOnly flags
      table.columns.forEach(column => {
        let value = newRowData[column.name];
        
        // Format value based on column type
        switch (column.type) {
          case 'number':
            value = value === '' || value === undefined ? null : Number(value);
            break;
          case 'date':
            value = value ? new Date(value).toISOString() : null;
            break;
          case 'boolean':
            value = typeof value === 'string' ? value === 'true' : Boolean(value);
            break;
          default:
            value = value?.toString() || null;
        }

        formattedData[column.name] = value;
        isDashboardOnly[column.name] = column.isDashboardOnly;
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${table._id}/rows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          data: formattedData,
          isDashboardOnly
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add row');
      }

      const { row } = await response.json();
      
      // Update local state with all columns
      setTable(prev => {
        if (!prev) return null;
        return {
          ...prev,
          data: [...prev.data, row]
        };
      });

      // Reset form
      setNewRowData({});
      setIsAddingRow(false);
      toast.success('Row added successfully');
    } catch (error: any) {
      console.error('Error adding row:', error);
      toast.error(error.message || 'Failed to add row');
    }
  };

  const renderAddRowForm = () => {
    return (
      <TableRow className="bg-gray-50">
        {table?.columns.map((column, colIndex) => (
          <TableCell key={colIndex}>
            {column.type === 'boolean' ? (
              <Select
                value={(newRowData[column.name] ?? 'false').toString()}
                onValueChange={(val) => {
                  setNewRowData(prev => ({
                    ...prev,
                    [column.name]: val === 'true'
                  }));
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            ) : column.type === 'date' ? (
              <Input
                type="date"
                value={newRowData[column.name] || ''}
                onChange={(e) => {
                  setNewRowData(prev => ({
                    ...prev,
                    [column.name]: e.target.value
                  }));
                }}
                className="w-full"
              />
            ) : (
              <Input
                type={column.type === 'number' ? 'number' : 'text'}
                value={newRowData[column.name] || ''}
                onChange={(e) => {
                  setNewRowData(prev => ({
                    ...prev,
                    [column.name]: e.target.value
                  }));
                }}
                className="w-full"
              />
            )}
          </TableCell>
        ))}
        <TableCell>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAddRow}
              className="h-8 w-8"
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsAddingRow(false);
                setNewRowData({});
              }}
              className="h-8 w-8"
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!table) {
    return <div>Table not found</div>;
  }

  const formatCellValue = (value: any, type: string): string => {
    if (value === null || value === undefined) return '';
    return String(value);
  };

  const getConnectionStatus = (table: Table) => {
    // If no URL is provided
    if (!table.googleSheetUrl) {
      return (
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <span className="text-sm text-gray-600">Not Connected - Please enter a Google Sheet URL</span>
        </div>
      );
    }

    // If there's a sync error
    if (table.syncError) {
      return (
        <div className="flex items-center gap-2">
          <X className="h-4 w-4 text-red-500" />
          <span className="text-sm text-gray-600">Not Connected - {table.syncError}</span>
        </div>
      );
    }

    // If connected and synced successfully
    if (table.googleSheetId && table.lastSynced) {
      return (
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-sm text-gray-600">Connected</span>
        </div>
      );
    }

    // If URL is provided but not synced yet
    return (
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-yellow-500" />
        <span className="text-sm text-gray-600">Not Connected - Waiting for sync</span>
      </div>
    );
  };

  const canSync = table?.googleSheetId && !table?.syncError;

  return (
    <>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <h1 className="text-3xl font-semibold text-gray-900">{table?.name}</h1>
          </div>
        </div>

        {/* Google Sheet Connection Status */}
        {table?.googleSheetUrl && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                <div>
                  <h2 className="text-lg font-medium text-gray-900">Google Sheet Connection</h2>
                  <div className="mt-1">
                    {getConnectionStatus(table)}
                  </div>
                </div>
              </div>
              {canSync && (
                <Button
                  variant="outline"
                  onClick={handleForceSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", { "animate-spin": isSyncing })} />
                  Force Sync
                </Button>
              )}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>Last synced: {table.lastSynced ? new Date(table.lastSynced).toLocaleString() : 'Never'}</p>
              {isEditingUrl ? (
                <div className="mt-2 flex gap-2 items-center">
                  <Input
                    value={newSheetUrl}
                    onChange={(e) => setNewSheetUrl(e.target.value)}
                    placeholder="Enter new Google Sheet URL"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateSheetUrl}
                    disabled={isUpdatingUrl}
                  >
                    {isUpdatingUrl ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingUrl(false);
                      setNewSheetUrl(table.googleSheetUrl || '');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2 items-center">
                  <a href={table.googleSheetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex-1">
                    {table.googleSheetUrl}
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingUrl(true);
                      setNewSheetUrl(table.googleSheetUrl || '');
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Column Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Add Column</h2>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="columnName">Column Name</Label>
              <Input
                id="columnName"
                value={newColumn.name}
                onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value })}
                placeholder="Enter column name"
                className="mt-1"
              />
            </div>
            <div className="w-48">
              <Label htmlFor="columnType">Data Type</Label>
              <Select
                value={newColumn.type}
                onValueChange={(value: any) => setNewColumn({ ...newColumn, type: value })}
              >
                <SelectTrigger id="columnType" className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 h-10">
              <Checkbox
                id="dashboardOnly"
                checked={newColumn.isDashboardOnly}
                onCheckedChange={(checked) => setNewColumn({ ...newColumn, isDashboardOnly: checked as boolean })}
              />
              <Label htmlFor="dashboardOnly">Dashboard Only</Label>
            </div>
            <Button onClick={handleAddColumn} className="h-10">
              <Plus className="h-4 w-4 mr-2" />
              Add Column
            </Button>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                {table?.columns.map((column, index) => (
                  <TableHead key={index} className="whitespace-nowrap font-medium text-gray-900">
                    {column.name}
                    {column.isDashboardOnly && (
                      <span className="ml-1 text-xs text-gray-500">(Dashboard)</span>
                    )}
                  </TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAddingRow && renderAddRowForm()}
              {table?.data.map((row: DynamicRow) => {
                const rowId = row._id || row.id || '';
                return (
                  <TableRow key={rowId} className="hover:bg-gray-50">
                    {table.columns.map((column, colIndex) => (
                      <TableCell key={colIndex} className="whitespace-nowrap">
                        {editingRow === rowId ? (
                          column.type === 'boolean' ? (
                            <Select
                              value={(editedData[column.name] ?? row[column.name])?.toString() || 'false'}
                              onValueChange={(val) => handleInputChange(column.name, val === 'true')}
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">True</SelectItem>
                                <SelectItem value="false">False</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : column.type === 'date' ? (
                            <Input
                              type="date"
                              value={editedData[column.name] || formatDateForInput(row[column.name]) || ''}
                              onChange={(e) => handleInputChange(column.name, e.target.value)}
                              className="w-full"
                            />
                          ) : (
                            <Input
                              type={column.type === 'number' ? 'number' : 'text'}
                              value={editedData[column.name] ?? row[column.name] ?? ''}
                              onChange={(e) => handleInputChange(column.name, e.target.value)}
                              className="w-full"
                            />
                          )
                        ) : (
                          formatCellValue(row[column.name], column.type)
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right space-x-2">
                      {editingRow === rowId ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              console.log('Save button clicked', { rowId });
                              rowId && handleSaveRow(rowId);
                            }}
                            className="h-8 px-2"
                          >
                            <Save className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              console.log('Cancel button clicked');
                              setEditingRow(null);
                              setEditedData({});
                            }}
                            className="h-8 px-2"
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              console.log('Edit button clicked', { 
                                rowId,
                                rowData: row,
                                hasId: !!rowId
                              });
                              rowId && handleEditRow(rowId);
                            }}
                            className="h-8 px-2"
                          >
                            <Pencil className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              console.log('Delete button clicked', { rowId });
                              rowId && handleDeleteRow(rowId);
                            }}
                            className="h-8 px-2"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Add Row Button */}
        <div className="flex justify-end mt-4">
          <Button onClick={() => {
            setIsAddingRow(true);
            setNewRowData({});
          }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
        </div>
      </div>
    </>
  );
} 