import fs from 'fs';
import path from 'path';
import { ITable } from '../models';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const DASHBOARD_DATA_FILE = path.join(STORAGE_DIR, 'dashboard_data.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Initialize storage file if it doesn't exist
if (!fs.existsSync(DASHBOARD_DATA_FILE)) {
  fs.writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify({}), 'utf8');
}

interface DashboardData {
  [tableId: string]: {
    [rowId: string]: {
      [columnName: string]: any;
    };
  };
}

export const saveDashboardData = (tableId: string, rowId: string, data: Record<string, any>) => {
  try {
    // Read existing data
    const fileContent = fs.readFileSync(DASHBOARD_DATA_FILE, 'utf8');
    const dashboardData: DashboardData = JSON.parse(fileContent);

    // Initialize table data if it doesn't exist
    if (!dashboardData[tableId]) {
      dashboardData[tableId] = {};
    }

    // Save row data
    dashboardData[tableId][rowId] = data;

    // Write back to file
    fs.writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving dashboard data:', error);
    throw error;
  }
};

export const getDashboardData = (tableId: string, rowId?: string) => {
  try {
    // Read data file
    const fileContent = fs.readFileSync(DASHBOARD_DATA_FILE, 'utf8');
    const dashboardData: DashboardData = JSON.parse(fileContent);

    // Return specific row data if rowId is provided
    if (rowId && dashboardData[tableId]) {
      return dashboardData[tableId][rowId] || null;
    }

    // Return all data for the table
    return dashboardData[tableId] || {};
  } catch (error) {
    console.error('Error reading dashboard data:', error);
    return null;
  }
};

export const deleteDashboardData = (tableId: string, rowId: string) => {
  try {
    // Read existing data
    const fileContent = fs.readFileSync(DASHBOARD_DATA_FILE, 'utf8');
    const dashboardData: DashboardData = JSON.parse(fileContent);

    // Remove row data if it exists
    if (dashboardData[tableId] && dashboardData[tableId][rowId]) {
      delete dashboardData[tableId][rowId];
    }

    // Write back to file
    fs.writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error deleting dashboard data:', error);
    throw error;
  }
};

export const mergeDashboardData = (table: ITable) => {
  try {
    const tableData = getDashboardData(table._id.toString());
    
    // If no dashboard data exists, return original table data
    if (!tableData) {
      return table.data;
    }

    // Merge dashboard-only data with table data
    return table.data.map(row => {
      const rowId = row._id.toString();
      const dashboardRowData = tableData[rowId];
      
      if (dashboardRowData) {
        return {
          ...row,
          ...dashboardRowData
        };
      }
      
      return row;
    });
  } catch (error) {
    console.error('Error merging dashboard data:', error);
    return table.data;
  }
}; 