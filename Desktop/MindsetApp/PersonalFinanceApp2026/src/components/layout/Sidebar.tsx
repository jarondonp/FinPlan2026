import React from "react";
import {
    LayoutDashboard,
    Upload,
    Settings,
    FileText,
    PiggyBank,
    Target,
    RefreshCw,
    Sparkles,
    ChevronRight,
    PieChart,
    Calendar,
    TrendingUp,
    Building2,
    User
} from "lucide-react";
import { formatCurrency } from "../../utils";
import { useScope } from '../../context/GlobalFilterContext';
import { useAccountBalance } from '../../hooks/useAccountBalance';
import { useFirestore } from '../../hooks/useFirestore';
import { daysBetween, calculateSmartReserve } from '../../utils/subscriptionHelpers';
import { RecurringExpense } from '../../types';

interface SidebarProps {
    currentView: string;
    onNavigate: (view: string) => void;
}

export const Sidebar = ({ currentView, onNavigate }: SidebarProps) => {
    const { scope } = useScope();
    const accounts = useAccountBalance(scope);

    const totalBalance = accounts.reduce((acc, curr) => {
        const isLiability = curr.type === 'Credit Card' || curr.type === 'Loan';
        // Use dynamicBalance instead of static balance
        return acc + (isLiability ? -(curr.dynamicBalance || 0) : (curr.dynamicBalance || 0));
    }, 0);

    // --- Subscription Metrics (Cloud) ---
    const { data: allRecurring } = useFirestore<RecurringExpense>('recurringExpenses');
    const recurringExpenses = (allRecurring || []).filter(r => r.scope === scope || (scope === 'PERSONAL' && !r.scope));

    const { urgentCount, reserveRequired, urgentItems } = React.useMemo(() => {
        // Use CENTRALIZED logic to guarantee consistency with Dashboard
        const result = calculateSmartReserve(recurringExpenses);

        // Urgent Count = Overdue + Urgent (Same as dashboard red items)
        const criticalItems = [...result.vencidos, ...result.urgentes];

        // Reserve Required = ONLY active reserves (excluding future/pending ones)
        // calculateSmartReserve already filters out 'pendientes' from 'reservaTotal'

        return {
            urgentCount: criticalItems.length,
            reserveRequired: result.reservaTotal,
            urgentItems: criticalItems.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())
        };
    }, [recurringExpenses]);


    const loadDemoData = async () => {
        alert("La carga de datos de demostración está deshabilitada durante la migración a la nube.");
    };

    return (
        <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20 transition-all duration-300 h-screen">
            <div className="p-6 flex items-center gap-3 text-white mb-2">
                <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/50">
                    <Sparkles size={20} className="text-white" />
                </div>
                <div>
                    <h1 className="font-bold text-lg leading-tight tracking-tight">FinMap</h1>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Personal AI</p>
                </div>
            </div>

            <div className="px-3 mb-4">
                <ScopeToggle />
            </div>

            <nav className="flex-1 px-3 space-y-1">
                <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={currentView === "dashboard"} onClick={() => onNavigate("dashboard")} />
                <NavItem icon={<PieChart size={18} />} label="Presupuesto y Metas" active={currentView === 'budget'} onClick={() => onNavigate('budget')} />
                <NavItem icon={<Calendar size={18} />} label="Proyección" active={currentView === 'cashflow'} onClick={() => onNavigate('cashflow')} />
                <NavItem icon={<TrendingUp size={18} />} label="Inversiones" active={currentView === 'investment'} onClick={() => onNavigate('investment')} />
                <NavItem icon={<Target size={18} />} label="Planificación Deuda" active={currentView === 'planning'} onClick={() => onNavigate('planning')} />
                <NavItem icon={<Upload size={18} />} label="Importar Datos" active={currentView === "import"} onClick={() => onNavigate("import")} />
                <NavItem
                    icon={<Settings size={18} />}
                    label="Configuración"
                    active={currentView === "settings"}
                    onClick={() => onNavigate("settings")}
                    badge={urgentCount > 0 ? urgentCount : undefined}
                    alertItems={urgentItems}
                />
            </nav>

            <div className="p-4 border-t border-slate-800 space-y-3">
                {/* Financial Summary */}
                <div className="bg-slate-800 rounded-lg p-3 space-y-3">

                    {/* Assets */}
                    <div className="flex justify-between items-center">
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Liquidez Actual</div>
                        <div className="font-bold text-emerald-400">
                            {formatCurrency(accounts
                                .filter(a => !['Credit Card', 'Loan'].includes(a.type))
                                .reduce((sum, a) => sum + (a.dynamicBalance || 0), 0)
                            )}
                        </div>
                    </div>

                    {/* Debt */}
                    <div className="flex justify-between items-center border-t border-slate-700/50 pt-2">
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Deuda Total</div>
                        <div className="font-bold text-rose-400">
                            {formatCurrency(accounts
                                // Debt Convention: Always show debt as POSITIVE
                                .filter(a => ['Credit Card', 'Loan'].includes(a.type))
                                .reduce((sum, a) => sum + Math.abs(a.dynamicBalance || 0), 0)
                            )}
                        </div>
                    </div>

                    {/* Suggested Reserve */}
                    <div className="flex justify-between items-center border-t border-slate-700/50 pt-2 animate-in fade-in">
                        <div className="text-[10px] text-indigo-400 font-medium uppercase tracking-wider flex items-center gap-1">
                            <PiggyBank size={12} /> Reserva Info.
                        </div>
                        <div className="font-bold text-indigo-400">
                            {formatCurrency(reserveRequired)}/m
                        </div>
                    </div>

                    {/* Credit Available (Only for CCs) */}
                    <div className="flex justify-between items-center border-t border-slate-700/50 pt-2">
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Disponible TDC</div>
                        <div className="font-bold text-blue-400">
                            {formatCurrency(accounts
                                .filter(a => a.type === 'Credit Card')
                                .reduce((sum, a) => {
                                    const debt = Math.abs(a.dynamicBalance || 0);
                                    const limit = a.limit || 0;
                                    return sum + Math.max(0, limit - debt);
                                }, 0)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
};

const NavItem = ({ icon, label, active, onClick, badge, alertItems }: any) => {
    const [showPopover, setShowPopover] = React.useState(false);

    return (
        <div className="relative" onMouseEnter={() => setShowPopover(true)} onMouseLeave={() => setShowPopover(false)}>
            <button
                onClick={onClick}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${active
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                    : "hover:bg-slate-800 hover:text-white"
                    }`}
            >
                {icon}
                <span>{label}</span>
                {badge && (
                    <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center border border-rose-400 shadow-sm animate-pulse">
                        {badge}
                    </span>
                )}
                {!badge && active && <ChevronRight size={14} className="ml-auto opacity-50" />}
            </button>

            {/* Smart Popover for Alerts */}
            {showPopover && alertItems && alertItems.length > 0 && (
                <div className="absolute left-full top-0 ml-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-left-2">
                    <div className="bg-rose-50 p-3 border-b border-rose-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Por Vencer ({alertItems.length})</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 scrollbar-thin scrollbar-thumb-slate-200">
                        {alertItems.map((item: any) => (
                            <div key={item.id} className="p-3 hover:bg-slate-50 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-bold text-slate-700">{item.name}</span>
                                    <span className="text-xs font-mono font-bold text-slate-900">{formatCurrency(item.amount)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-slate-500">
                                    <span>{item.nextDueDate}</span>
                                    <span className="text-rose-500 font-bold bg-rose-50 px-1.5 rounded">{daysBetween(new Date().toISOString().split('T')[0], item.nextDueDate) < 0 ? 'Vencido' : 'Urgente'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-slate-50 p-2 text-center border-t border-slate-100">
                        <span className="text-[10px] text-indigo-600 font-bold cursor-pointer hover:underline">Ir a Configuración →</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const ScopeToggle = () => {
    const { scope, setScope } = useScope();

    return (
        <div className="bg-slate-800 p-1 rounded-lg flex gap-1">
            <button
                onClick={() => setScope('PERSONAL')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${scope === 'PERSONAL'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
            >
                <User size={14} />
                Personal
            </button>
            <button
                onClick={() => setScope('BUSINESS')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${scope === 'BUSINESS'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
            >
                <Building2 size={14} />
                Empresa
            </button>
        </div>
    );
};
