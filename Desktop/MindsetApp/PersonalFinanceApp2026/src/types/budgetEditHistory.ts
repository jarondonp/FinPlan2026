import { Timestamp } from 'firebase/firestore';

/**
 * Represents a single item in budget details
 */
export interface BudgetItem {
    id: string;
    name: string;
    amount: number;
    notice?: string;
}

/**
 * Represents a budget edit history entry
 * Tracks changes made to a specific category's budget type
 */
export interface BudgetEditHistory {
    id: string;
    user_id: string;
    scope: 'personal' | 'business';
    month: string; // "YYYY-MM"
    category: string; // e.g., "Food & Dining"
    budget_type: 'fixed' | 'reserved' | 'variable';

    // Snapshot of previous state
    previous_total: number;
    previous_items: BudgetItem[];

    // Snapshot of new state
    new_total: number;
    new_items: BudgetItem[];

    // Metadata
    timestamp: Timestamp;
    edit_reason?: string; // Optional user-provided context

    // Calculated diffs
    total_change: number; // new_total - previous_total
    items_added: number; // count of new items
    items_removed: number; // count of removed items
    items_modified: number; // count of items with changed amounts
}
