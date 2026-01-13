import { db } from '../../db/db';

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
        // Return null for now to avoid showing static dummy data
        return null;
    },

    sendMessage: async (message: string): Promise<string> => {
        return "El asistente está aprendiendo de tus nuevos datos en la nube...";
    }
};
