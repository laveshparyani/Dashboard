import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { Server } from 'socket.io';
import { ITable, Table } from '../models';

let io: Server;

export const setSocketIO = (socketIO: Server) => {
  io = socketIO;
};

// Initialize Google Sheets client
const initGoogleSheets = async (sheetId?: string) => {
  try {
    const credentials = require('../config/google-credentials.json');
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });

    if (!sheetId) {
      // Create a new spreadsheet
      const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(auth, { title: 'New Dashboard Table' });
      return doc;
    }

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    return doc;
  } catch (error) {
    console.error('Error initializing Google Sheets:', error);
    throw new Error('Failed to initialize Google Sheets: ' + error.message);
  }
};

// Export the initGoogleSheets function
export { initGoogleSheets };

// Extract sheet ID from URL
export const extractSheetId = (url: string): string | null => {
  try {
    const match = url.match(/\/d\/(.*?)(\/|$)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting sheet ID:', error);
    return null;
  }
};

// Create a new Google Sheet
export const createGoogleSheet = async (table: ITable): Promise<string> => {
  try {
    const doc = await initGoogleSheets();
    const sheet = doc.sheetsByIndex[0];
    
    // Set up headers based on table columns
    const headerValues = table.columns
      .filter(col => !col.isDashboardOnly)
      .map(col => col.name);
    await sheet.setHeaderRow(headerValues);
    
    return doc.spreadsheetId;
  } catch (error) {
    console.error('Error creating Google Sheet:', error);
    throw new Error('Failed to create Google Sheet: ' + error.message);
  }
};

// Sync data from Google Sheet to database
export const syncGoogleSheet = async (table: ITable) => {
  try {
    if (!table.googleSheetId) {
      throw new Error('No Google Sheet ID provided');
    }

    const doc = await initGoogleSheets(table.googleSheetId);
    const sheet = doc.sheetsByIndex[0];
    
    // Reload sheet data to ensure we have the latest
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    
    // Get non-dashboard columns
    const tableColumns = table.columns.filter(col => !col.isDashboardOnly);
    
    // Validate headers match our columns
    const missingColumns = tableColumns.map(col => col.name).filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Missing columns in Google Sheet: ${missingColumns.join(', ')}`);
    }

    // Load all rows with fresh data
    const rows = await sheet.getRows();

    // Map sheet data to table format with proper type conversion
    const data = rows.map((row: GoogleSpreadsheetRow, index: number) => {
      const rowData: Record<string, any> = {};
      
      // If we have existing data, try to preserve the ID
      const existingRow = table.data[index];
      if (existingRow && existingRow._id) {
        rowData._id = existingRow._id;
      }

      tableColumns.forEach(column => {
        let value = row.get(column.name);
        
        // Convert values based on column type
        switch (column.type) {
          case 'date':
            if (!value) {
              value = null;
            } else {
              // Try to parse the date value
              try {
                // First try to parse as a date string
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                  value = date.toISOString();
                } else {
                  // If that fails, try to parse Excel/Google Sheets date number
                  const excelDate = parseInt(value);
                  if (!isNaN(excelDate)) {
                    // Convert Excel/Google Sheets date number to JS date
                    // Excel/Sheets dates are number of days since Dec 30, 1899
                    const msPerDay = 24 * 60 * 60 * 1000;
                    const date = new Date((excelDate - 25569) * msPerDay);
                    value = date.toISOString();
                  } else {
                    value = null;
                  }
                }
              } catch (error) {
                console.error('Error parsing date:', error);
                value = null;
              }
            }
            break;
          case 'number':
            value = value ? parseFloat(value) : null;
            break;
          case 'boolean':
            value = value ? value.toLowerCase() === 'true' : false;
            break;
          default:
            value = value || '';
        }
        
        rowData[column.name] = value;
      });

      // If this is a new row (no existing ID), generate a new ObjectId
      if (!rowData._id) {
        const { ObjectId } = require('mongodb');
        rowData._id = new ObjectId();
      }

      return rowData;
    });

    // Check if data has actually changed
    const hasChanged = JSON.stringify(table.data) !== JSON.stringify(data);

    if (hasChanged) {
      // Update table data
      table.data = data;
      table.lastSynced = new Date();
      await table.save();

      // Emit update event to connected clients
      if (io) {
        io.to(`table-${table._id}`).emit('tableUpdated', table.toObject());
      }

      console.log(`Synced table ${table._id} with ${data.length} rows`);
    }

    return table;
  } catch (error) {
    console.error('Error syncing Google Sheet:', error);
    // Emit error to connected clients
    if (io) {
      io.to(`table-${table._id}`).emit('syncError', {
        tableId: table._id,
        error: error.message
      });
    }
    throw error;
  }
};

// Set up periodic sync for all tables
export const setupGoogleSheetsSync = () => {
  const syncInterval = parseInt(process.env.SYNC_INTERVAL || '5000', 10); // Default to 5 seconds
  let isSyncing = false;
  
  // Sync every interval
  setInterval(async () => {
    // Prevent multiple syncs from running at the same time
    if (isSyncing) return;
    
    try {
      isSyncing = true;
      const tables = await Table.find({ googleSheetId: { $exists: true, $ne: null } });
      
      for (const table of tables) {
        try {
          await syncGoogleSheet(table);
        } catch (error) {
          console.error(`Error syncing table ${table._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in periodic sync:', error);
    } finally {
      isSyncing = false;
    }
  }, syncInterval);
};

// Update a specific row in Google Sheet
export const updateGoogleSheetRow = async (table: ITable, rowIndex: number, data: Record<string, any>) => {
  try {
    if (!table.googleSheetId) {
      throw new Error('No Google Sheet ID provided');
    }

    console.log('Updating Google Sheet row:', { rowIndex, data });

    const doc = await initGoogleSheets(table.googleSheetId);
    const sheet = doc.sheetsByIndex[0];
    
    // Load all rows
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
    
    // Adjust rowIndex for 0-based array (Google Sheets rows are 1-based)
    // rowIndex is 0-based from MongoDB array index, add 1 for header row
    const adjustedRowIndex = rowIndex;
    
    console.log('Adjusted row index:', adjustedRowIndex, 'Total rows:', rows.length);

    // Ensure row exists
    if (adjustedRowIndex < 0 || adjustedRowIndex >= rows.length) {
      throw new Error(`Row index ${rowIndex} is out of bounds (total rows: ${rows.length})`);
    }

    // Update only non-dashboard columns
    const sheetColumns = table.columns.filter(col => !col.isDashboardOnly).map(col => col.name);
    
    // Update row values
    Object.entries(data).forEach(([key, value]) => {
      if (sheetColumns.includes(key)) {
        // Format value based on column type
        const column = table.columns.find(col => col.name === key);
        if (column) {
          let formattedValue = '';
          
          if (value !== null && value !== undefined) {
            switch (column.type) {
              case 'date':
                try {
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    formattedValue = date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    });
                  }
                } catch (error) {
                  console.error('Error formatting date:', error);
                }
                break;
              case 'boolean':
                formattedValue = Boolean(value) ? 'TRUE' : 'FALSE';
                break;
              case 'number':
                formattedValue = value === null ? '' : Number(value).toString();
                break;
              default:
                formattedValue = String(value);
            }
          }
          
          console.log('Setting value:', { column: key, value: formattedValue });
          rows[adjustedRowIndex].set(key, formattedValue);
        }
      }
    });

    // Save changes
    await rows[adjustedRowIndex].save();
    
    // Sync the table to get the latest data
    await syncGoogleSheet(table);
    
    return true;
  } catch (error) {
    console.error('Error updating Google Sheet row:', error);
    throw error;
  }
};

// Delete a row from Google Sheet
export const deleteGoogleSheetRow = async (table: ITable, rowIndex: number) => {
  try {
    if (!table.googleSheetId) {
      throw new Error('No Google Sheet ID provided');
    }

    const doc = await initGoogleSheets(table.googleSheetId);
    const sheet = doc.sheetsByIndex[0];
    
    // Load all rows
    const rows = await sheet.getRows();
    
    // Adjust rowIndex for 0-based array (Google Sheets rows are 1-based)
    const adjustedRowIndex = rowIndex - 2; // -2 because of header row and 1-based indexing
    
    // Ensure row exists
    if (!rows[adjustedRowIndex]) {
      throw new Error('Row not found in Google Sheet');
    }

    // Delete the row
    await rows[adjustedRowIndex].delete();
    
    // Sync the table to get the latest data
    await syncGoogleSheet(table);
    
    return true;
  } catch (error) {
    console.error('Error deleting Google Sheet row:', error);
    throw error;
  }
}; 