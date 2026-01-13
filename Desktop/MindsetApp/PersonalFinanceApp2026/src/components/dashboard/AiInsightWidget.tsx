import React, { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react';
import { AiService, AiInsight } from '../../services/ai/AiService';

interface AiInsightWidgetProps {
    onNavigate: (view: string) => void;
}

export const AiInsightWidget = ({ onNavigate }: AiInsightWidgetProps) => {
    const [insight, setInsight] = useState<AiInsight | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        AiService.getDailyInsight().then(data => {
            setInsight(data);
            setLoading(false);
        });
    }, []);

    if (loading || !insight) return null;

    const isWarning = insight.type === 'warning';

    return (
        <div className={`
            relative overflow-hidden
            mb-8 rounded-2xl p-[1px]
            ${isWarning
                ? 'bg-gradient-to-r from-rose-400 via-orange-300 to-rose-400 animate-in slide-in-from-top-4'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-in slide-in-from-top-4'
            }
        `}>
            <div className="bg-white rounded-2xl p-4 md:p-5 relative md:flex justify-between items-center gap-4">

                {/* Icon & Message */}
                <div className="flex items-start gap-4">
                    <div className={`pk-3 rounded-full shrink-0 mt-1
                        ${isWarning ? 'text-rose-600 bg-rose-50' : 'text-indigo-600 bg-indigo-50'}
                    `}>
                        {isWarning ? <AlertTriangle size={24} /> : <Sparkles size={24} />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className={`text-sm font-bold uppercase tracking-wider
                                ${isWarning ? 'text-rose-600' : 'text-indigo-600'}
                            `}>
                                {isWarning ? 'Alerta IA' : 'Insight IA'}
                            </h3>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Beta</span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-lg leading-tight mb-1">{insight.title}</h4>
                        <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                            {insight.message}
                        </p>
                    </div>
                </div>

                {/* Action Button */}
                {insight.actionLabel && (
                    <button
                        onClick={() => insight.actionLink && onNavigate(insight.actionLink)}
                        className={`
                            mt-4 md:mt-0 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all
                            ${isWarning
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }
                        `}
                    >
                        {insight.actionLabel} <ArrowRight size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};
