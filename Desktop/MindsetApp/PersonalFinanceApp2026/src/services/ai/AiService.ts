import { db } from '../../db/db';

// Simple mock implementation to restore stability
// Replaces the complex Google Search logic that was causing issues
export interface AiInsight {
    id: string;
    type: 'opportunity' | 'warning' | 'tip';
    title: string;
    message: string;
    actionLabel?: string;
    actionLink?: string;
}

export const AiService = {
    getDailyInsight: async (): Promise<AiInsight | null> => {
        // Simple fallback to avoid errors
        return {
            id: 'restore-mode',
            type: 'tip',
            title: 'Sistema Restaurado',
            message: 'El sistema ha sido restaurado a una configuración estable. Tus datos están seguros.'
        };
    },

    sendMessage: async (message: string): Promise<string> => {
        return "El asistente está en modo de mantenimiento. Por favor intenta más tarde.";
    }
};
