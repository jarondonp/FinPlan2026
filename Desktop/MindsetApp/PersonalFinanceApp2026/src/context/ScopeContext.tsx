import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Scope } from '../types';

interface ScopeContextType {
    scope: Scope;
    setScope: (scope: Scope) => void;
}

const ScopeContext = createContext<ScopeContextType | undefined>(undefined);

const SCOPE_STORAGE_KEY = 'finmap_scope';

export const ScopeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [scope, setScopeState] = useState<Scope>('PERSONAL');

    useEffect(() => {
        const savedScope = localStorage.getItem(SCOPE_STORAGE_KEY) as Scope;
        if (savedScope === 'PERSONAL' || savedScope === 'BUSINESS') {
            setScopeState(savedScope);
        }
    }, []);

    const setScope = (newScope: Scope) => {
        setScopeState(newScope);
        localStorage.setItem(SCOPE_STORAGE_KEY, newScope);
    };

    return (
        <ScopeContext.Provider value={{ scope, setScope }}>
            {children}
        </ScopeContext.Provider>
    );
};

export const useScope = (): ScopeContextType => {
    const context = useContext(ScopeContext);
    if (!context) {
        throw new Error('useScope must be used within a ScopeProvider');
    }
    return context;
};
