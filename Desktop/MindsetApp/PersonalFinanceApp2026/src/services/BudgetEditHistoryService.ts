import { db } from '../firebase/config';
import { collection, doc, setDoc, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { BudgetEditHistory, BudgetItem } from '../types/budgetEditHistory';

/**
 * Service for tracking budget edit history
 * Only saves changes when user manually edits a category
 */
export class BudgetEditHistoryService {

    /**
     * Save an edit history entry when user modifies a category
     */
    static async saveEdit(
        userId: string,
        scope: 'personal' | 'business',
        month: string,
        category: string,
        budgetType: 'fixed' | 'reserved' | 'variable',
        previousTotal: number,
        previousItems: BudgetItem[],
        newTotal: number,
        newItems: BudgetItem[],
        editReason?: string
    ): Promise<string> {
        try {
            // Calculate diffs
            const totalChange = newTotal - previousTotal;
            const previousIds = new Set(previousItems.map(i => i.id));
            const newIds = new Set(newItems.map(i => i.id));

            const itemsAdded = newItems.filter(i => !previousIds.has(i.id)).length;
            const itemsRemoved = previousItems.filter(i => !newIds.has(i.id)).length;

            // Items modified = items that exist in both but amount changed
            const itemsModified = newItems.filter(newItem => {
                const oldItem = previousItems.find(p => p.id === newItem.id);
                return oldItem && oldItem.amount !== newItem.amount;
            }).length;

            // Create history entry
            const historyRef = doc(collection(db, 'users', userId, 'budget_edit_history'));
            const historyEntry: BudgetEditHistory = {
                id: historyRef.id,
                user_id: userId,
                scope,
                month,
                category,
                budget_type: budgetType,
                previous_total: previousTotal,
                previous_items: previousItems,
                new_total: newTotal,
                new_items: newItems,
                timestamp: Timestamp.now(),
                edit_reason: editReason || null, // Use null instead of undefined
                total_change: totalChange,
                items_added: itemsAdded,
                items_removed: itemsRemoved,
                items_modified: itemsModified
            };

            await setDoc(historyRef, historyEntry);
            return historyRef.id;
        } catch (error) {
            console.error('Error saving budget edit history:', error);
            throw error;
        }
    }

    /**
     * Get edit history for a specific month/scope
     */
    static async getHistory(
        userId: string,
        scope: 'personal' | 'business',
        month: string,
        category?: string
    ): Promise<BudgetEditHistory[]> {
        try {
            const constraints = [
                where('scope', '==', scope),
                where('month', '==', month)
            ];

            if (category) {
                constraints.push(where('category', '==', category));
            }

            const q = query(
                collection(db, 'users', userId, 'budget_edit_history'),
                ...constraints
            );

            const snapshot = await getDocs(q);
            const history = snapshot.docs.map(doc => doc.data() as BudgetEditHistory);

            // Sort by timestamp descending
            return history.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
        } catch (error) {
            console.error('Error fetching budget edit history:', error);
            throw error;
        }
    }
}
