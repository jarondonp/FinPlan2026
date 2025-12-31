import React, { useEffect, useState } from 'react';
import { Lock, Unlock, AlertCircle } from 'lucide-react';
import { useGlobalFilter } from '../../context/GlobalFilterContext';
import { closingService } from '../../services/ClosingService';
import { MonthStatus } from '../../types';

export const MonthStatusBadge = () => {
    const { filterState } = useGlobalFilter();
    const { timeframe, scope } = filterState;
    const [status, setStatus] = useState<MonthStatus>('OPEN');

    useEffect(() => {
        const loadStatus = async () => {
            const s = await closingService.getStatus(timeframe.start, scope);
            setStatus(s);
        };
        loadStatus();
    }, [timeframe, scope]);

    if (status === 'OPEN') {
        return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100" title="Mes Abierto - Puedes editar datos">
                <Unlock size={14} />
                <span>Abierto</span>
            </div>
        );
    }

    if (status === 'LOCKED' || status === 'CLOSED') {
        return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200" title="Mes Cerrado - Datos de solo lectura">
                <Lock size={14} />
                <span>Cerrado</span>
            </div>
        );
    }

    return null;
};
