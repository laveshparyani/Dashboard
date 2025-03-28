'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Column {
  name: string;
  type: 'text' | 'date';
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
  data: any[];
  googleSheetId?: string;
}

export default function TableView({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [table, setTable] = useState<Table | null>(null);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumn, setNewColumn] = useState<Column>({ name: '', type: 'text' });
  const [showGoogleSheetModal, setShowGoogleSheetModal] = useState(false);
  const [sheetId, setSheetId] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchTable();
  }, [params.id, router]);

  const fetchTable = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/tables/${params.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch table');
      }

      const data = await response.json();
      setTable(data);
    } catch (error) {
      console.error('Error fetching table:', error);
    }
  };

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!table) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:5000/api/tables/${params.id}/columns`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newColumn),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add column');
      }

      const updatedTable = await response.json();
      setTable(updatedTable);
      setShowAddColumnModal(false);
      setNewColumn({ name: '', type: 'text' });
    } catch (error) {
      console.error('Error adding column:', error);
    }
  };

  const handleGoogleSheetConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!table) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:5000/api/tables/${params.id}/connect-sheet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sheetId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to connect Google Sheet');
      }

      const updatedTable = await response.json();
      setTable(updatedTable);
      setShowGoogleSheetModal(false);
      setSheetId('');
    } catch (error) {
      console.error('Error connecting Google Sheet:', error);
    }
  };

  if (!table) {
    return <div>Loading...</div>;
  }

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{table.name}</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setShowAddColumnModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Add Column
          </button>
          <button
            onClick={() => setShowGoogleSheetModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Connect Google Sheet
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead>
            <tr>
              {table.columns.map((column, index) => (
                <th
                  key={index}
                  className="px-6 py-3 border-b border-gray-300 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {table.columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-6 py-4 whitespace-nowrap border-b border-gray-300"
                  >
                    {row[column.name]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddColumnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Add New Column</h2>
            <form onSubmit={handleAddColumn}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Column Name
                </label>
                <input
                  type="text"
                  value={newColumn.name}
                  onChange={(e) =>
                    setNewColumn({ ...newColumn, name: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Data Type
                </label>
                <select
                  value={newColumn.type}
                  onChange={(e) =>
                    setNewColumn({ ...newColumn, type: e.target.value as 'text' | 'date' })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddColumnModal(false)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGoogleSheetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Connect Google Sheet</h2>
            <form onSubmit={handleGoogleSheetConnect}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Google Sheet ID
                </label>
                <input
                  type="text"
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter Google Sheet ID"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  You can find the Sheet ID in the URL of your Google Sheet
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGoogleSheetModal(false)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
} 