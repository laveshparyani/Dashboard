import express, { Request, Response } from 'express';
import { Table } from '../models';
import { authenticateToken } from '../middleware/auth';
import { extractSheetId, syncGoogleSheet } from '../services/googleSheets';
import { saveDashboardData, deleteDashboardData, mergeDashboardData } from '../services/jsonStorage';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        email: string;
      };
    }
  }
}

// Define the User type
interface User {
  _id: string;
  email: string;
}

// Define the AuthenticatedRequest type
interface AuthenticatedRequest extends Request {
  user?: User;
}

// Type guard for authenticated user
function isAuthenticated(req: AuthenticatedRequest): req is AuthenticatedRequest & { user: User } {
  return req.user !== undefined && typeof req.user._id === 'string';
}

const router = express.Router();

interface CreateTableBody {
  name: string;
  columns: Array<{
    name: string;
    type: 'text' | 'date' | 'number' | 'boolean';
    isDashboardOnly: boolean;
  }>;
  googleSheetUrl?: string;
}

interface UpdateRowBody {
  data: Record<string, any>;
  isDashboardOnly: Record<string, boolean>;
}

// Test Google Sheets sync
router.post('/:id/sync-test', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const updatedTable = await syncGoogleSheet(table);
    return res.json(updatedTable);
  } catch (error) {
    console.error('Sync test error:', error);
    return res.status(500).json({ error: 'Error testing sync' });
  }
});

// Get all tables for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!._id;
    const tables = await Table.find({ userId });
    res.json(tables);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ message: 'Failed to fetch tables' });
  }
});

// Get a specific table by ID
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    // Sync with Google Sheet if available
    if (table.googleSheetId) {
      try {
        await syncGoogleSheet(table);
      } catch (error) {
        console.error('Error syncing with Google Sheet:', error);
        return res.json({
          ...table.toObject(),
          syncError: error.message
        });
      }
    }

    // Merge dashboard-only data from JSON storage
    const mergedData = mergeDashboardData(table);
    const tableWithMergedData = {
      ...table.toObject(),
      data: mergedData
    };

    return res.json(tableWithMergedData);
  } catch (error) {
    console.error('Error fetching table:', error);
    return res.status(500).json({ message: 'Failed to fetch table' });
  }
});

// Create a new table
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, columns, googleSheetUrl } = req.body as CreateTableBody;
    const userId = req.user._id;

    if (!name || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Create table in database
    const table = new Table({
      name,
      userId,
      columns,
      data: []
    });

    // Handle Google Sheet if URL is provided
    if (googleSheetUrl) {
      try {
        // Extract sheet ID from URL
        const sheetId = extractSheetId(googleSheetUrl);
        if (!sheetId) {
          return res.status(400).json({ error: 'Invalid Google Sheet URL' });
        }

        // Set the Google Sheet info
        table.googleSheetId = sheetId;
        table.googleSheetUrl = googleSheetUrl;

        // Save the table first
        await table.save();

        // Then try to sync with the sheet
        try {
          const updatedTable = await syncGoogleSheet(table);
          return res.status(201).json(updatedTable);
        } catch (syncError) {
          console.error('Initial sync error:', syncError);
          // Don't fail the request, but send a warning
          return res.status(201).json({
            ...table.toObject(),
            warning: 'Table created but failed to sync with Google Sheet. Please ensure the sheet is shared with the service account and try syncing again.'
          });
        }
      } catch (error) {
        console.error('Error handling Google Sheet:', error);
        return res.status(500).json({ error: 'Failed to handle Google Sheet connection' });
      }
    }

    await table.save();
    return res.status(201).json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    return res.status(500).json({ error: 'Failed to create table' });
  }
});

interface UpdateTableBody {
  name?: string;
  columns?: Array<{
    name: string;
    type: 'text' | 'date' | 'number' | 'boolean';
    isDashboardOnly: boolean;
  }>;
}

// Update a table
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const { name, columns } = req.body as UpdateTableBody;

    if (name) {
      table.name = name;
    }

    if (columns) {
      table.columns = columns;
    }

    await table.save();
    return res.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    return res.status(500).json({ error: 'Failed to update table' });
  }
});

// Delete a table
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    await table.deleteOne();
    return res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    return res.status(500).json({ error: 'Failed to delete table' });
  }
});

// Add column to table
router.post('/:id/columns', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const { name, type, isDashboardOnly } = req.body;
    table.columns.push({ name, type, isDashboardOnly });
    await table.save();

    return res.json(table);
  } catch (error) {
    console.error('Error adding column:', error);
    return res.status(500).json({ error: 'Failed to add column' });
  }
});

// Connect Google Sheet
router.post('/:id/connect-sheet', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const { googleSheetUrl } = req.body;
    const sheetId = extractSheetId(googleSheetUrl);

    if (!sheetId) {
      return res.status(400).json({ error: 'Invalid Google Sheet URL' });
    }

    table.googleSheetId = sheetId;
    table.googleSheetUrl = googleSheetUrl;
    await table.save();

    try {
      const updatedTable = await syncGoogleSheet(table);
      return res.json(updatedTable);
    } catch (error) {
      console.error('Error syncing with Google Sheet:', error);
      return res.status(500).json({ error: 'Failed to sync with Google Sheet' });
    }
  } catch (error) {
    console.error('Error connecting Google Sheet:', error);
    return res.status(500).json({ error: 'Failed to connect Google Sheet' });
  }
});

// Sync with Google Sheet
router.post('/:id/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (!table.googleSheetId) {
      return res.status(400).json({ error: 'No Google Sheet connected' });
    }

    const updatedTable = await syncGoogleSheet(table);
    return res.json(updatedTable);
  } catch (error) {
    console.error('Error syncing with Google Sheet:', error);
    return res.status(500).json({ error: 'Failed to sync with Google Sheet' });
  }
});

// Update a table's Google Sheet URL
router.put('/:id/update-sheet', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (!table.googleSheetId) {
      return res.status(400).json({ error: 'No Google Sheet connected' });
    }

    const updatedTable = await syncGoogleSheet(table);
    return res.json(updatedTable);
  } catch (error) {
    console.error('Error updating Google Sheet:', error);
    return res.status(500).json({ error: 'Failed to update Google Sheet' });
  }
});

// Update row
router.put('/:tableId/rows/:rowId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { data } = req.body as UpdateRowBody;
    const { tableId, rowId } = req.params;

    const table = await Table.findOne({
      _id: tableId,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Save dashboard-only data
    saveDashboardData(tableId, rowId, data);

    return res.json({ message: 'Row updated successfully' });
  } catch (error) {
    console.error('Error updating row:', error);
    return res.status(500).json({ error: 'Failed to update row' });
  }
});

// Delete row
router.delete('/:id/rows/:rowId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Delete dashboard data
    deleteDashboardData(req.params.id, req.params.rowId);

    return res.json({ message: 'Row deleted successfully' });
  } catch (error) {
    console.error('Error deleting row:', error);
    return res.status(500).json({ error: 'Failed to delete row' });
  }
});

// Add a new row
router.post('/:tableId/rows', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { data } = req.body as UpdateRowBody;
    const { tableId } = req.params;

    const table = await Table.findOne({
      _id: tableId,
      userId: req.user._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Save dashboard data
    const rowId = new Date().getTime().toString();
    saveDashboardData(tableId, rowId, data);

    return res.json({ message: 'Row added successfully', rowId });
  } catch (error) {
    console.error('Error adding row:', error);
    return res.status(500).json({ error: 'Failed to add row' });
  }
});

export default router; 