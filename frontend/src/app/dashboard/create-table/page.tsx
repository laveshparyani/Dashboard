'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Table2, X, ArrowLeft, FileSpreadsheet } from 'lucide-react';

interface Column {
  name: string;
  type: 'text' | 'date' | 'number' | 'boolean';
  isDashboardOnly: boolean;
}

export default function CreateTablePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<Column[]>([]);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddColumn = () => {
    setColumns([...columns, { name: '', type: 'text', isDashboardOnly: false }]);
  };

  const handleRemoveColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index: number, field: keyof Column, value: string | boolean) => {
    const newColumns = [...columns];
    newColumns[index] = {
      ...newColumns[index],
      [field]: field === 'type' ? value as Column['type'] : value
    };
    setColumns(newColumns);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Please enter a table name');
      return;
    }

    if (!columns.length) {
      toast.error('Please add at least one column');
      return;
    }

    if (columns.some(col => !col.name.trim())) {
      toast.error('Please fill out all column names');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          columns,
          googleSheetUrl: googleSheetUrl.trim() || undefined
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create table');
      }

      toast.success('Table created successfully');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error creating table:', error);
      toast.error(error.message || 'Failed to create table');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => router.push('/dashboard')}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>

      <div className="bg-card p-6 rounded-lg shadow-lg">
        <div className="flex items-center mb-6">
          <Table2 className="w-6 h-6 mr-2" />
          <h1 className="text-2xl font-bold">Create New Table</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name">Table Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter table name"
              required
            />
          </div>

          <div className="space-y-4">
            <Label>Columns</Label>
            {columns.map((column, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="flex-1">
                  <Input
                    value={column.name}
                    onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                    placeholder="Column name"
                    required
                  />
                </div>
                <div className="w-32">
                  <Select
                    value={column.type}
                    onValueChange={(value: Column['type']) => handleColumnChange(index, 'type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={column.isDashboardOnly}
                      onChange={(e) => handleColumnChange(index, 'isDashboardOnly', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Dashboard Only
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveColumn(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddColumn}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Column
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="googleSheetUrl">Google Sheet URL (Optional)</Label>
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <Input
                  id="googleSheetUrl"
                  value={googleSheetUrl}
                  onChange={(e) => setGoogleSheetUrl(e.target.value)}
                  placeholder="Paste your Google Sheet URL here"
                />
              </div>
              <FileSpreadsheet className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="space-y-2 mt-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">Important: Before creating the table</p>
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>Share your Google Sheet with this service account:</li>
                <code className="block px-2 py-1 my-1 bg-background rounded text-xs">
                  dashboard-service@dashboard-455013.iam.gserviceaccount.com
                </code>
                <li>Make sure to give it "Editor" access</li>
                <li>The sheet should have a header row matching your column names</li>
              </ol>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Table'}
          </Button>
        </form>
      </div>
    </div>
  );
} 