'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Table2, Trash2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditProfileDialog } from '@/components/EditProfileDialog';
import { UserMenu } from '@/components/UserMenu';

// Add styles for the waving hand animation
const styles = {
  wavingHand: {
    animation: 'wave 2.5s infinite',
    transformOrigin: '70% 70%',
    display: 'inline-block',
  }
};

// Add keyframes for the waving animation
const keyframes = `
@keyframes wave {
  0% { transform: rotate(0deg); }
  10% { transform: rotate(14deg); }
  20% { transform: rotate(-8deg); }
  30% { transform: rotate(14deg); }
  40% { transform: rotate(-4deg); }
  50% { transform: rotate(10deg); }
  60% { transform: rotate(0deg); }
  100% { transform: rotate(0deg); }
}
`;

interface Column {
  name: string;
  type: 'text' | 'date' | 'number' | 'boolean';
  isDashboardOnly: boolean;
}

interface Table {
  _id: string;
  name: string;
  columns: Column[];
  googleSheetId?: string;
  lastSynced?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    fetchTables();
    // Try to get name from localStorage first
    const storedName = localStorage.getItem('userName');
    if (storedName) {
      setUserName(storedName);
    }
    // Then fetch latest from API
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }
      const data = await response.json();
      setUserName(data.name);
      localStorage.setItem('userName', data.name);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    router.push('/login');
  };

  const fetchTables = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch tables');
      }
      const data = await response.json();
      setTables(data);
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast.error('Failed to fetch tables');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tables/${tableId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete table');
      }

      setTables(tables.filter(table => table._id !== tableId));
      toast.success('Table deleted successfully');
    } catch (error) {
      console.error('Error deleting table:', error);
      toast.error('Failed to delete table');
    } finally {
      setTableToDelete(null);
    }
  };

  const handleViewTable = (tableId: string) => {
    router.push(`/dashboard/${tableId}`);
  };

  const handleProfileUpdate = (newName: string) => {
    setUserName(newName);
    localStorage.setItem('userName', newName);
  };

  return (
    <>
      <style>{keyframes}</style>
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-2">
              Welcome, {userName} <span className="animate-wave">👋</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your connected tables
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push('/dashboard/create-table')}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Create New Table
            </Button>
            <UserMenu />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-24 bg-gray-100" />
                <CardContent className="h-32 bg-gray-50" />
              </Card>
            ))}
          </div>
        ) : tables.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Table2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">No Tables Yet</h2>
              <p className="text-gray-500 mb-4">
                Create your first table to get started
              </p>
              <Button onClick={() => router.push('/dashboard/create-table')}>
                <Plus className="w-4 h-4 mr-2" />
                Create New Table
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tables.map((table) => (
              <Card
                key={table._id}
                className="group relative hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Table2 className="w-5 h-5" />
                      {table.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setTableToDelete(table._id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Table</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this table? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setTableToDelete(null)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeleteTable(table._id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{table.columns.length} columns</span>
                      {table.googleSheetId && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <FileSpreadsheet className="w-4 h-4" />
                            Connected to Google Sheet
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-sm">
                      {table.columns.map((col, i) => (
                        <span key={i} className="inline-flex items-center">
                          {i > 0 && <span className="mx-1">•</span>}
                          {col.name}
                          {col.isDashboardOnly && (
                            <span className="ml-1 text-xs text-muted-foreground">(Dashboard)</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleViewTable(table._id)}
                      >
                        View and Manage Table Data
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
} 