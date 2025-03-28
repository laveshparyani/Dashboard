import express, { Router, Request, Response } from 'express';
import { Table, ITable } from '../models';
import { authenticateToken } from '../middleware/auth';
import { extractSheetId, createGoogleSheet, syncGoogleSheet, updateGoogleSheetRow, deleteGoogleSheetRow, initGoogleSheets } from '../services/googleSheets';
import { saveDashboardData, getDashboardData, deleteDashboardData, mergeDashboardData } from '../services/jsonStorage';
import { ObjectId } from 'mongodb';
import { collections } from '../db';
import { getIO } from '../services/io';

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
router.post('/:id/sync-test', authenticateToken, async (req, res) => {
  try {
    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user!._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const updatedTable = await syncGoogleSheet(table);
    res.json(updatedTable);
  } catch (error) {
    console.error('Sync test error:', error);
    res.status(500).json({ error: 'Error testing sync' });
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
    if (!req.user?._id) {
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

    res.json(tableWithMergedData);
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ message: 'Failed to fetch table' });
  }
});

// Create a new table
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, columns, googleSheetUrl } = req.body as CreateTableBody;
    const userId = req.user!._id;

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
    res.status(201).json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ error: 'Failed to create table' });
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
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, columns } = req.body as UpdateTableBody;
    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user!._id
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    if (name) table.name = name;
    if (columns) {
      // Only update dashboard-only columns
      const existingColumns = table.columns.filter(col => !col.isDashboardOnly);
      const newDashboardColumns = columns.filter(col => col.isDashboardOnly);
      table.columns = [...existingColumns, ...newDashboardColumns];
    }

    await table.save();
    res.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ message: 'Failed to update table' });
  }
});

// Delete a table
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const table = await Table.findOneAndDelete({
      _id: req.params.id,
      userId: req.user!._id
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ message: 'Failed to delete table' });
  }
});

// Add a new column to a table
router.post('/:id/columns', authenticateToken, async (req, res) => {
  try {
    const { name, type, isDashboardOnly } = req.body;
    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    // Add the new column with isDashboardOnly flag
    table.columns.push({ name, type, isDashboardOnly });
    await table.save();

    // If this is not a dashboard-only column and we have a Google Sheet connected,
    // verify the column exists in the sheet
    if (!isDashboardOnly && table.googleSheetId) {
      try {
        await syncGoogleSheet(table);
      } catch (error: any) {
        // If sync fails, mark the column as dashboard-only
        const column = table.columns.find(col => col.name === name);
        if (column) {
          column.isDashboardOnly = true;
          await table.save();
        }
        return res.status(200).json({
          ...table.toObject(),
          syncError: `Column '${name}' not found in Google Sheet. It has been marked as dashboard-only.`
        });
      }
    }

    res.json(table);
  } catch (error) {
    console.error('Error adding column:', error);
    res.status(500).json({ message: 'Failed to add column' });
  }
});

// Connect a Google Sheet to a table
router.post('/:id/connect-sheet', authenticateToken, async (req, res) => {
  try {
    const { sheetId } = req.body;
    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    table.googleSheetId = sheetId;
    await table.save();

    // Initial sync with Google Sheet
    await syncGoogleSheet(table);

    res.json(table);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Force sync with Google Sheet
router.post('/:id/sync', authenticateToken, async (req, res) => {
  try {
    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user!._id
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    if (!table.googleSheetId) {
      return res.status(400).json({ message: 'No Google Sheet connected to this table' });
    }

    await syncGoogleSheet(table);
    res.json(table);
  } catch (error) {
    console.error('Error syncing with Google Sheet:', error);
    res.status(500).json({ 
      message: 'Failed to sync with Google Sheet',
      error: error.message
    });
  }
});

// Update a table's Google Sheet URL
router.put('/:id/update-sheet', authenticateToken, async (req, res) => {
  try {
    const { googleSheetUrl } = req.body;
    const table = await Table.findOne({
      _id: req.params.id,
      userId: req.user!._id
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (!googleSheetUrl) {
      // Remove Google Sheet connection
      table.googleSheetId = undefined;
      table.googleSheetUrl = undefined;
      await table.save();
      return res.json(table);
    }

    // Extract sheet ID from URL
    const sheetId = extractSheetId(googleSheetUrl);
    if (!sheetId) {
      return res.status(400).json({ error: 'Invalid Google Sheet URL' });
    }

    // Update the table with new Google Sheet info
    table.googleSheetId = sheetId;
    table.googleSheetUrl = googleSheetUrl;
    await table.save();

    // Try to sync with the sheet
    try {
      const updatedTable = await syncGoogleSheet(table);
      res.json(updatedTable);
    } catch (error) {
      console.error('Error syncing with Google Sheet:', error);
      res.status(200).json({
        ...table.toObject(),
        warning: 'Table updated but failed to sync with Google Sheet. Please ensure the sheet is shared with the service account.'
      });
    }
  } catch (error) {
    console.error('Error updating Google Sheet URL:', error);
    res.status(500).json({ error: 'Failed to update Google Sheet URL' });
  }
});

// Update row
router.put('/:tableId/rows/:rowId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { tableId, rowId } = req.params;
    const { data, isDashboardOnly } = req.body as UpdateRowBody;
    const userId = req.user._id;

    // Find the table
    const table = await Table.findOne({
      _id: tableId,
      userId
    });
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Find the row index and ensure row exists
    const existingRow = table.data.find(row => row._id?.toString() === rowId);
    if (!existingRow || !existingRow._id) {
      return res.status(404).json({ error: 'Row not found' });
    }
    const rowIndex = table.data.indexOf(existingRow);

    // Get existing row data
    const existingRowData = { ...existingRow };

    // Separate data into sheet data and dashboard data
    const sheetData: Record<string, any> = {};
    const dashboardData: Record<string, any> = {};

    // Process incoming data based on isDashboardOnly flags
    Object.entries(data).forEach(([key, value]) => {
      if (isDashboardOnly[key]) {
        dashboardData[key] = value;
      } else {
        sheetData[key] = value;
      }
    });

    // Create the updated row (without dashboard-only data)
    const updatedRow = {
      ...existingRowData,
      ...sheetData,
      _id: existingRow._id
    };

    // Update Google Sheet if needed (only for non-dashboard columns)
    if (table.googleSheetId && Object.keys(sheetData).length > 0) {
      try {
        await updateGoogleSheetRow(table, rowIndex, sheetData);
      } catch (error) {
        console.error('Error updating Google Sheet:', error);
      }
    }

    // Update the row in MongoDB (without dashboard-only data)
    const result = await Table.findOneAndUpdate(
      { 
        _id: tableId,
        userId,
        'data._id': existingRow._id
      },
      { 
        $set: { 
          'data.$': updatedRow
        }
      },
      { 
        new: true,
        runValidators: true
      }
    );

    if (!result) {
      return res.status(404).json({ error: 'Failed to update row' });
    }

    // Update dashboard-only data in JSON storage
    if (Object.keys(dashboardData).length > 0) {
      await saveDashboardData(tableId, rowId, dashboardData);
    }

    // Merge dashboard data for response
    const mergedRow = {
      ...updatedRow,
      ...dashboardData
    };

    // Send update to connected clients
    const io = getIO();
    io?.to(`table-${tableId}`).emit('tableUpdate', {
      tableId,
      data: mergeDashboardData(result)
    });

    res.json({
      row: mergedRow,
      table: {
        ...result.toObject(),
        data: mergeDashboardData(result)
      }
    });
  } catch (error: any) {
    console.error('Error updating row:', error);
    res.status(500).json({ error: error.message || 'Failed to update row' });
  }
});

// Delete row by ID
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
      return res.status(404).json({ message: 'Table not found' });
    }

    // Find the row index by ID
    const rowIndex = table.data.findIndex(row => row._id?.toString() === req.params.rowId);
    if (rowIndex === -1) {
      return res.status(404).json({ message: 'Row not found' });
    }

    const row = table.data[rowIndex];
    if (!row._id) {
      return res.status(400).json({ message: 'Invalid row data' });
    }

    // Remove the row from MongoDB
    table.data.splice(rowIndex, 1);

    // Delete dashboard-only data from JSON storage
    await deleteDashboardData(req.params.id, req.params.rowId);

    // If we have a Google Sheet connected, delete the row there too
    if (table.googleSheetId) {
      try {
        await deleteGoogleSheetRow(table, rowIndex + 2); // +2 because Google Sheets is 1-based and has a header row
      } catch (error) {
        console.error('Error deleting row from Google Sheet:', error);
      }
    }

    await table.save();

    // Send update to connected clients with merged data
    const io = getIO();
    io?.to(`table-${req.params.id}`).emit('tableUpdate', {
      tableId: req.params.id,
      data: mergeDashboardData(table)
    });

    res.json({
      ...table.toObject(),
      data: mergeDashboardData(table)
    });
  } catch (error) {
    console.error('Error deleting row:', error);
    res.status(500).json({ message: 'Failed to delete row' });
  }
});

// Add new row
router.post('/:tableId/rows', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { tableId } = req.params;
    const { data, isDashboardOnly } = req.body as UpdateRowBody;
    const userId = req.user._id;

    // Find the table
    const table = await Table.findOne({
      _id: tableId,
      userId
    });
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Initialize the new row data with all columns set to null
    const initialRowData: Record<string, any> = {};
    table.columns.forEach(column => {
      initialRowData[column.name] = null;
    });

    // Process incoming data based on isDashboardOnly flags
    const sheetData: Record<string, any> = {};
    const dashboardData: Record<string, any> = {};

    // Process each column's data
    table.columns.forEach(column => {
      const value = data[column.name];
      if (column.isDashboardOnly) {
        dashboardData[column.name] = value;
      } else {
        sheetData[column.name] = value;
      }
    });

    // Create the new row with MongoDB ObjectId
    const newRow = {
      _id: new ObjectId(),
      ...initialRowData,  // Start with null values for all columns
      ...sheetData        // Add sheet data
    };

    // If we have a Google Sheet connected, add the row there
    if (table.googleSheetId && Object.keys(sheetData).length > 0) {
      try {
        const doc = await initGoogleSheets(table.googleSheetId);
        const sheet = doc.sheetsByIndex[0];
        
        // Add row to Google Sheet (only non-dashboard columns)
        const sheetColumns = table.columns
          .filter(col => !col.isDashboardOnly)
          .map(col => col.name);
        
        const rowData = sheetColumns.reduce((acc, colName) => {
          acc[colName] = sheetData[colName] ?? null;
          return acc;
        }, {} as Record<string, any>);

        await sheet.addRow(rowData);
      } catch (error) {
        console.error('Error adding row to Google Sheet:', error);
      }
    }

    // Add the row to MongoDB
    const result = await Table.findOneAndUpdate(
      { _id: tableId, userId },
      { 
        $push: { data: newRow }
      },
      { 
        new: true,
        runValidators: true
      }
    );

    if (!result) {
      throw new Error('Failed to save row to database');
    }

    // Save dashboard-only data to JSON storage
    if (Object.keys(dashboardData).length > 0) {
      await saveDashboardData(tableId, newRow._id.toString(), dashboardData);
    }

    // Merge dashboard data for response
    const mergedRow = {
      ...newRow,
      ...dashboardData
    };

    // Send update to connected clients
    const io = getIO();
    io?.to(`table-${tableId}`).emit('tableUpdate', {
      tableId,
      data: mergeDashboardData(result)
    });

    res.json({
      row: mergedRow,
      table: {
        ...result.toObject(),
        data: mergeDashboardData(result)
      }
    });
  } catch (error: any) {
    console.error('Error adding row:', error);
    res.status(500).json({ error: error.message || 'Failed to add row' });
  }
});

export default router; 