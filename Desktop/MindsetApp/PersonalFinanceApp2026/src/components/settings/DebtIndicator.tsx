
import React, { useEffect, useState } from 'react';
import { Account } from '../../types';
import { debtService } from '../../services/DebtService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils';
import { CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

export const DebtIndicator = ({ accountId, accounts }: { accountId: string, accounts: Account[] }) => {
    const { user } = useAuth();
    const [status, setStatus] = useState<{ target: number, paid: number } | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            if (!user) return;

            // 1. Get Debt Settings
            const settings = await debtService.getDebtSettings(user.uid);

            // 2. Calculate Plan (Using full debt service logic)
            // We need to calculate the plan for ALL accounts to get the correct 'extra' allocation for THIS account
            const totalBudget = settings.extraPayment + accounts.reduce((sum, a) => sum + (a.minPayment || 0), 0); // Approximation
            // Actually, calculatePaymentPlan handles mins internally. We just need to pass the Total Budget available IF we knew it, 
            // OR we can just rely on the service to calculate mins + extra.
            // Wait, calculatePaymentPlan needs 'totalBudget' which is (Sum of Mins + Extra).

            // Let's recalculate accurately:
            const totalMins = accounts
                .filter(a => (a.type === 'Credit Card' || a.type === 'Loan') && Math.abs(a.balance) > 1)
                .reduce((sum, a) => {
                    const balance = Math.abs('dynamicBalance' in a ? (a as any).dynamicBalance : a.balance);
                    const min = a.minPayment || (balance * 0.02);
                    return sum + Math.min(min, balance);
                }, 0);

            const plan = debtService.calculatePaymentPlan(
                accounts,
                totalMins + settings.extraPayment,
                settings.strategy
            );

            const myPlan = plan.find(p => p.accountId === accountId);
            if (!myPlan) return;

            // 3. Get Actual Paid
            const paymentMap = await debtService.fetchActualPayments(user.uid, new Date().toISOString().slice(0, 7), [accountId]);
            const paid = paymentMap.get(accountId) || 0;

            setStatus({
                target: myPlan.totalSuggested,
                paid: paid
            });
        };

        fetchStatus();
    }, [accountId, accounts, user]);

    if (!status) return <div className="h-6 mt-2 animate-pulse bg-slate-100 rounded"></div>;

    const remaining = Math.max(0, status.target - status.paid);
    const isPaid = remaining < 1;
    const progress = Math.min(100, (status.paid / status.target) * 100);

    return (
        <div className="mt-3 bg-slate-50 rounded-lg p-2 border border-slate-100 relative z-10">
            <div className="flex justify-between items-center mb-1 text-xs">
                <span className="font-bold text-slate-600">Plan de Pago (Mes)</span>
                {isPaid ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle size={10} /> Cubierto</span>
                ) : (
                    <span className="text-amber-600 font-bold flex items-center gap-1"><AlertCircle size={10} /> Pendiente: {formatCurrency(remaining)}</span>
                )}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                    className={`h-full rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${progress}%` }}
                ></div>
            </div>

            <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                <span>Pagado: {formatCurrency(status.paid)}</span>
                <span>Meta: {formatCurrency(status.target)}</span>
            </div>
        </div>
    );
};
