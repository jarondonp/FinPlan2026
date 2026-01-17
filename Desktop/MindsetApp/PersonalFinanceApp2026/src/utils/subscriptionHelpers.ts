import { RecurringExpense, RecurringFrequency } from '../types';

/**
 * Calcula días entre dos fechas
 */
export function daysBetween(date1: Date | string, date2: Date | string): number {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    const diffTime = d2.getTime() - d1.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calcula la próxima fecha de vencimiento basada en frecuencia
 */
export function calculateNextDueDate(currentDate: string, frequency: RecurringFrequency): string {
    const date = new Date(currentDate);

    switch (frequency) {
        case 'MONTHLY':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'QUARTERLY':
            date.setMonth(date.getMonth() + 3);
            break;
        case 'SEMI_ANNUAL':
            date.setMonth(date.getMonth() + 6);
            break;
        case 'ANNUAL':
            date.setFullYear(date.getFullYear() + 1);
            break;
        case 'BIENNIAL':
            date.setFullYear(date.getFullYear() + 2);
            break;
        case 'TRIENNIAL':
            date.setFullYear(date.getFullYear() + 3);
            break;
    }

    return date.toISOString().split('T')[0];
}

/**
 * Tipos de urgencia para gastos recurrentes
 */
export type UrgencyLevel = 'VENCIDO' | 'URGENTE' | 'PRÓXIMO' | 'PLANEABLE';

export interface UrgencyBadge {
    level: UrgencyLevel;
    color: string;
    icon: string;
    label: string;
    daysUntil: number;
}

/**
 * Obtiene configuración de badge según días hasta vencimiento
 */
export function getUrgencyBadge(daysUntil: number): UrgencyBadge {
    if (daysUntil < 0) {
        return {
            level: 'VENCIDO',
            color: 'red',
            icon: '🔴',
            label: 'VENCIDO',
            daysUntil
        };
    }

    if (daysUntil <= 30) {
        return {
            level: 'URGENTE',
            color: 'orange',
            icon: '🟠',
            label: 'URGENTE',
            daysUntil
        };
    }

    if (daysUntil <= 60) {
        return {
            level: 'PRÓXIMO',
            color: 'yellow',
            icon: '🟡',
            label: 'PRÓXIMO',
            daysUntil
        };
    }

    return {
        level: 'PLANEABLE',
        color: 'green',
        icon: '🟢',
        label: 'PLANEABLE',
        daysUntil
    };
}

// Enhanced Smart Reserve Result
export interface SmartReserveResult {
    vencidos: RecurringExpense[];
    urgentes: RecurringExpense[];
    proximos: RecurringExpense[]; // Active Reserves
    pendientes: { exp: RecurringExpense; startDate: string }[]; // Future Reserves
    planeables: RecurringExpense[]; // Generic bucket (fallback)
    reservaTotal: number;
}

/**
 * Calcula reserva mensual inteligente basada en tiempo disponible y configuración de inicio
 */
export function calculateSmartReserve(
    expenses: RecurringExpense[],
    today: Date = new Date()
): SmartReserveResult {
    const results: SmartReserveResult = {
        vencidos: [],
        urgentes: [],
        proximos: [],
        pendientes: [], // New: Reserves that haven't started yet
        planeables: [],
        reservaTotal: 0
    };

    // Robust Local Date Parsing
    const currentYear = today.getFullYear();
    const currentMonthIndex = today.getMonth();
    const todayStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    expenses
        .filter(exp => exp.active) // Check ALL active expenses for urgency, not just annuals
        .forEach(exp => {
            const diasHasta = daysBetween(todayStr, exp.nextDueDate);

            // 1. Check if it's already due or urgent (Override functionality)
            // RESTORED TO 30 DAYS as per original requirement to show "Próximos" alerts
            if (diasHasta < 0) {
                results.vencidos.push(exp);
                // Important: Even if overdue, annuals still need reserve calc if not fully paid? 
                // Usually overdue means "pay now", so no reserve needed for accumulation.
                return;
            } else if (diasHasta <= 30) {
                results.urgentes.push(exp);
                // If it's urgent (due this month), we probably still want to see the reserve breakdown?
                // But typically it moves to the "Critical" list.
                return;
            }

            // IF it is monthly, we don't calculate reserves, so we return here if not urgent
            if (exp.frequency === 'MONTHLY') return;

            // ... Reserve Logic continues for NON-MONTHLY ...

            // 2. Planning Logic (Check configured start Date)
            const reservationConfig = exp.reservation;

            // Manual Parse to avoid timezone offset issues (e.g. 2026-05-01 becoming April 30)
            let startYear = 0;
            let startMonthIndex = 0; // 0-based

            if (reservationConfig?.startDate) {
                const parts = reservationConfig.startDate.split('-'); // YYYY-MM-DD
                if (parts.length === 3) {
                    startYear = parseInt(parts[0], 10);
                    startMonthIndex = parseInt(parts[1], 10) - 1;
                }
            }

            // If we have a valid start date logic
            if (startYear > 0) {
                const startMonthTotal = startYear * 12 + startMonthIndex;

                // Compare in local time (derived from the passed 'today' object)
                const currentMonthTotal = currentYear * 12 + currentMonthIndex;

                if (startMonthTotal > currentMonthTotal) {
                    results.pendientes.push({ exp, startDate: reservationConfig!.startDate! });
                    // We do NOT add to reservaTotal
                    return;
                }
            }

            // 3. Active Reserve Calculation (It's time to save!)
            // Logic: Target / Remaining Months
            const targetAmount = reservationConfig?.targetAmount || exp.amount;
            const initialSaved = reservationConfig?.initialSaved || 0;
            const monthsRemaining = Math.max(1, Math.floor(diasHasta / 30));

            // Only calculate if months > 0
            if (monthsRemaining > 0) {
                const monthlyQuota = (targetAmount - initialSaved) / monthsRemaining;

                // Add to active list with calculated quota attached (we might want to change the type or extend RecurringExpense temporarily)
                // For now, attaching quota to the expense object purely for display is risky if not typed, 
                // but we will use the same logic in display.

                // We push to 'proximos' which now implies "Active Reserve"
                // Ideally we'd return a rich object, but keeping compatible with existing structure for now.
                // We add a dynamic property or handle it in the UI.
                results.proximos.push(exp);
                results.reservaTotal += monthlyQuota;
            }
        });

    return results;
}

/**
 * Obtiene label amigable para frecuencia
 */
export function getFrequencyLabel(frequency: RecurringFrequency): string {
    const labels: Record<RecurringFrequency, string> = {
        'MONTHLY': 'Mensual',
        'QUARTERLY': 'Trimestral',
        'SEMI_ANNUAL': 'Semestral',
        'ANNUAL': 'Anual',
        'BIENNIAL': 'Bianual',
        'TRIENNIAL': 'Trianual'
    };
    return labels[frequency];
}

/**
 * Parsea un string YYYY-MM-DD y devuelve un objeto Date en hora local (00:00:00)
 * Evita el bache de zona horaria de 'new Date(str)'
 */
export function parseLocalISOString(dateStr: string): Date {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(dateStr);
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

/**
 * Formatea un string YYYY-MM-DD a una fecha local amigable sin errores de zona horaria
 */
export function formatSafeDate(dateStr: string, options: Intl.DateTimeFormatOptions = { month: 'long' }): string {
    const date = parseLocalISOString(dateStr);
    return date.toLocaleDateString('es-ES', options);
}

/**
 * Calculates smart reserve suggestion based on user configuration
 */
export function calculateSmartReserveForExpense(expense: RecurringExpense, today: Date = new Date()): { isActive: boolean; message: string; amount?: number } | null {
    // 1. Check if reserve is enabled/applicable
    if (expense.frequency === 'MONTHLY' || !expense.reservation?.isEnabled) {
        return null;
    }

    const { targetAmount, startDate, initialSaved } = expense.reservation;
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const target = targetAmount || expense.amount; // Default to full amount if not overridden
    const start = parseLocalISOString(startDate);

    // 2. Check "Before Start Date" (Informative Phase)
    if (today < start) {
        // Calculate estimated future quota
        const futureMonths = Math.max(1, Math.floor(daysBetween(startDate, expense.nextDueDate) / 30));
        const estimatedQuota = (target - (initialSaved || 0)) / futureMonths;

        return {
            isActive: false,
            message: `🕒 Inicio programado para ${formatSafeDate(startDate)} (Est: $${estimatedQuota.toFixed(2)}/mes)`
        };
    }

    // 3. "Active Phase" (Action Required)
    const daysUntilDue = daysBetween(todayStr, expense.nextDueDate);

    // Edge case: Already due or passed
    if (daysUntilDue <= 0) {
        return { isActive: true, message: "⚠️ Vence hoy o ya venció", amount: target };
    }

    // Calculate remaining quota dynamically
    // "Catch-up" logic: simply divide remaining amount by remaining time
    const monthsRemaining = Math.max(1, Math.floor(daysUntilDue / 30)); // Minimum 1 month divisor to avoid infinity
    // In a real app, we would sum actual saved transactions. 
    // Here we assume "initialSaved" is all we have, so the user must update it if they save.
    // OR we assume the user follows the plan perfectly. The prompt implies "recalculating if they fail", 
    // so simply dividing (Total - Saved) / TimeRemaining automatically increases the quota as time shrinks.

    const amountNeeded = target - (initialSaved || 0);
    const monthlyQuota = amountNeeded / monthsRemaining;

    return {
        isActive: true,
        message: `💡 Acción: Reservar $${monthlyQuota.toFixed(2)}/mes`,
        amount: monthlyQuota
    };
}
