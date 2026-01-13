import React, { useState } from 'react';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { Calendar, Filter, ChevronLeft, ChevronRight, Check } from 'lucide-react';
// import { useLiveQuery } from 'dexie-react-hooks'; // Removed
// import { db } from '../../db/db'; // Removed
import { useAccountBalance } from '../../hooks/useAccountBalance'; // New Firestore Hook
import { getStartOfMonth, getEndOfMonth, formatMonth } from '../../utils';

export const FilterBar = () => {
    const { filterState, setTimeframe, toggleAccount, setComparisonMode } = useGlobalFilter();
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

    // Get accounts for the current scope to populate filter list
    // useAccountBalance now fetches from Firestore
    const allAccounts = useAccountBalance(filterState.scope);
    const accounts = allAccounts.filter(a => a.scope === filterState.scope || (filterState.scope === 'PERSONAL' && !a.scope));

    const shiftMonth = (direction: 'next' | 'prev') => {
        const currentStart = filterState.timeframe.start;
        const newDate = new Date(currentStart);

        if (direction === 'next') {
            newDate.setMonth(newDate.getMonth() + 1);
        } else {
            newDate.setMonth(newDate.getMonth() - 1);
        }

        setTimeframe({
            mode: 'MONTHLY',
            start: getStartOfMonth(newDate),
            end: getEndOfMonth(newDate),
            label: formatMonth(newDate)
        });
    };

    const handleAccountToggle = (id: string) => {
        toggleAccount(id);
    };

    return (
        <div className="bg-white border-b border-slate-200 px-8 py-3 mb-6 flex items-center justify-between shadow-sm sticky top-0 z-10">
            {/* Left: Timeframe Controls */}
            <div className="flex items-center gap-4">
                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                    <button
                        onClick={() => shiftMonth('prev')}
                        className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-slate-800"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-4 font-bold text-slate-700 min-w-[140px] text-center flex items-center justify-center gap-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="capitalize">{filterState.timeframe.label}</span>
                    </div>
                    <button
                        onClick={() => shiftMonth('next')}
                        className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500 hover:text-slate-800"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {/* Quick Date Shortcuts (Optional for future) */}
                {/* <div className="text-xs font-medium text-slate-400 border-l pl-4 border-slate-200">
                    <button className="hover:text-blue-600 transition-colors">Este Año</button>
                </div> */}
            </div>

            {/* Right: Account & Comparison Filters */}
            <div className="flex items-center gap-3">
                {/* Account Filter Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${filterState.selectedAccountIds.length > 0
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <Filter size={16} />
                        {filterState.selectedAccountIds.length > 0
                            ? `${filterState.selectedAccountIds.length} Cuentas`
                            : 'Todas las Cuentas'}
                    </button>

                    {/* Dropdown Menu */}
                    {isAccountMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50">
                            <div className="mb-2 px-2 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrar por Cuenta</div>
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {accounts.map(acc => {
                                    const isSelected = filterState.selectedAccountIds.includes(acc.id);
                                    return (
                                        <button
                                            key={acc.id}
                                            onClick={() => handleAccountToggle(acc.id)}
                                            className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center justify-between group transition-colors ${isSelected ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50 text-slate-700'
                                                }`}
                                        >
                                            <span className="truncate">{acc.name}</span>
                                            {isSelected && <Check size={14} className="text-blue-600" />}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-100">
                                <button
                                    onClick={() => {
                                        // Clear logic needs to be manually triggered or exposed
                                        // ideally toggleAccount handles the logic or we expose clearAccounts
                                        // For now, toggle all selected to off
                                        filterState.selectedAccountIds.forEach(id => toggleAccount(id));
                                    }}
                                    className="w-full text-xs text-center text-slate-400 hover:text-slate-600 py-1"
                                >
                                    Limpiar Filtros
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Comparison Mode Toggle */}
                <button
                    onClick={() => setComparisonMode(!filterState.comparisonMode)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${filterState.comparisonMode
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <span className="relative flex h-3 w-3">
                        {filterState.comparisonMode && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${filterState.comparisonMode ? 'bg-purple-500' : 'bg-slate-300'}`}></span>
                    </span>
                    Comparar
                </button>
            </div>

            {/* Backdrop for menu */}
            {isAccountMenuOpen && (
                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsAccountMenuOpen(false)} />
            )}
        </div>
    );
};
