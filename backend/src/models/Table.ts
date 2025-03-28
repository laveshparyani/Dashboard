import mongoose, { Document, Schema } from 'mongoose';

export interface IColumn {
  name: string;
  type: 'text' | 'date' | 'number' | 'boolean';
  isDashboardOnly: boolean;
}

export interface ITableRow {
  _id?: mongoose.Types.ObjectId;
  [key: string]: any;
}

export interface ITable extends Document {
  name: string;
  userId: mongoose.Types.ObjectId;
  columns: IColumn[];
  data: ITableRow[];
  googleSheetId?: string;
  googleSheetUrl?: string;
  lastSynced?: Date;
  syncError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const columnSchema = new Schema<IColumn>({
  name: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['text', 'date', 'number', 'boolean']
  },
  isDashboardOnly: { type: Boolean, default: false }
});

const rowSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true }
}, {
  strict: false,
  _id: false
});

const tableSchema = new Schema<ITable>({
  name: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  columns: [columnSchema],
  data: [rowSchema],
  googleSheetId: { type: String },
  googleSheetUrl: { type: String },
  lastSynced: { type: Date },
  syncError: { type: String }
}, {
  timestamps: true
});

// Index for faster queries
tableSchema.index({ userId: 1, name: 1 });
tableSchema.index({ googleSheetId: 1 }, { sparse: true });

export const Table = mongoose.model<ITable>('Table', tableSchema); 