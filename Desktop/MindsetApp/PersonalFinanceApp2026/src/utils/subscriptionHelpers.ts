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

export interface SmartReserveResult {
    vencidos: RecurringExpense[];
    urgentes: RecurringExpense[];
    proximos: RecurringExpense[];
    planeables: RecurringExpense[];
    reservaTotal: number;
}

/**
 * Calcula reserva mensual inteligente basada en tiempo disponible
 */
export function calculateSmartReserve(
    expenses: RecurringExpense[],
    today: Date = new Date()
): SmartReserveResult {
    const results: SmartReserveResult = {
        vencidos: [],
        urgentes: [],
        proximos: [],
        planeables: [],
        reservaTotal: 0
    };

    const todayStr = today.toISOString().split('T')[0];

    expenses
        .filter(exp => exp.frequency !== 'MONTHLY' && exp.active)
        .forEach(exp => {
            const diasHasta = daysBetween(todayStr, exp.nextDueDate);

            if (diasHasta < 0) {
                // VENCIDO: Alerta roja
                results.vencidos.push(exp);
            }
            else if (diasHasta <= 30) {
                // URGENTE: Alerta naranja, no calcular reserva
                results.urgentes.push(exp);
            }
            else if (diasHasta <= 60) {
                // PRÓXIMO: Badge amarillo, calcular reserva
                results.proximos.push(exp);
                const mesesDisp = Math.max(1, Math.floor(diasHasta / 30));
                results.reservaTotal += exp.amount / mesesDisp;
            }
            else {
                // PLANEABLE: Badge verde, calcular reserva
                results.planeables.push(exp);
                const mesesDisp = Math.floor(diasHasta / 30);
                results.reservaTotal += exp.amount / mesesDisp;
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
