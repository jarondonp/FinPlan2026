import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { FilterState, Scope, Timeframe, TimeframeMode } from '../types';
import { getStartOfMonth, getEndOfMonth, formatMonth } from '../utils';

interface GlobalFilterContextType {
    filterState: FilterState;
    setScope: (scope: Scope) => void;
    setTimeframe: (timeframe: Timeframe) => void;
    toggleAccount: (accountId: string) => void;
    setComparisonMode: (enabled: boolean) => void;
    resetFilters: () => void;
}

// Legacy support interface
interface ScopeContextType {
    scope: Scope;
    setScope: (scope: Scope) => void;
}

const GlobalFilterContext = createContext<GlobalFilterContextType | undefined>(undefined);

const STORAGE_KEY = 'finmap_global_filters_v1';

export const GlobalFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Initial State Calculation
    const getInitialState = (): FilterState => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                // Validate shape
                if (!parsed || !parsed.timeframe) {
                    throw new Error("Invalid state shape");
                }

                // Rehydrate dates from string
                parsed.timeframe.start = new Date(parsed.timeframe.start);
                parsed.timeframe.end = new Date(parsed.timeframe.end);

                // Ensure other fields exist
                if (!parsed.selectedAccountIds) parsed.selectedAccountIds = [];
                if (typeof parsed.comparisonMode === 'undefined') parsed.comparisonMode = false;

                return parsed;
            } catch (e) {
                console.warn("Resetting filters due to invalid saved state/version mismatch", e);
                localStorage.removeItem(STORAGE_KEY);
            }
        }

        // Default: Current Month
        const now = new Date();
        return {
            scope: 'PERSONAL',
            timeframe: {
                mode: 'MONTHLY',
                start: getStartOfMonth(now),
                end: getEndOfMonth(now),
                label: formatMonth(now)
            },
            selectedAccountIds: [],
            comparisonMode: false
        };
    };

    const [filterState, setFilterState] = useState<FilterState>(getInitialState);

    // Persistence
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filterState));
    }, [filterState]);

    // Actions
    const setScope = (newScope: Scope) => {
        setFilterState(prev => ({
            ...prev,
            scope: newScope,
            selectedAccountIds: [] // Reset account filters when switching scope
        }));
    };

    const setTimeframe = (newTimeframe: Timeframe) => {
        setFilterState(prev => ({ ...prev, timeframe: newTimeframe }));
    };

    const toggleAccount = (accountId: string) => {
        setFilterState(prev => {
            const current = prev.selectedAccountIds;
            const exists = current.includes(accountId);

            let newAccounts;
            if (exists) {
                newAccounts = current.filter(id => id !== accountId);
            } else {
                newAccounts = [...current, accountId];
            }

            return { ...prev, selectedAccountIds: newAccounts };
        });
    };

    const setComparisonMode = (enabled: boolean) => {
        setFilterState(prev => ({ ...prev, comparisonMode: enabled }));
    };

    const resetFilters = () => {
        const now = new Date();
        setFilterState(prev => ({
            ...prev,
            timeframe: {
                mode: 'MONTHLY',
                start: getStartOfMonth(now),
                end: getEndOfMonth(now),
                label: formatMonth(now)
            },
            selectedAccountIds: [],
            comparisonMode: false
        }));
    };

    return (
        <GlobalFilterContext.Provider value={{
            filterState,
            setScope,
            setTimeframe,
            toggleAccount,
            setComparisonMode,
            resetFilters
        }}>
            {children}
        </GlobalFilterContext.Provider>
    );
};

export const useGlobalFilter = (): GlobalFilterContextType => {
    const context = useContext(GlobalFilterContext);
    if (!context) {
        throw new Error('useGlobalFilter must be used within a GlobalFilterProvider');
    }
    return context;
};

// Backward Compatibility Hook
// This allows us to keep existing components working without refactoring everything at once
export const useScope = (): ScopeContextType => {
    const { filterState, setScope } = useGlobalFilter();
    return {
        scope: filterState.scope,
        setScope
    };
};
